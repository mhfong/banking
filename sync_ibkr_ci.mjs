// IBKR Flex Query Sync - CI version with TWR calculation
import { readFileSync, writeFileSync } from 'fs'

const FLEX_TOKEN = process.env.IBKR_TOKEN
const QUERY_ID = process.env.IBKR_QUERY_ID
const BASE_URL = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService'
const DATA_PATH = 'ibkr_parsed.json'
const SRC_DATA_PATH = 'src/data/ibkr_parsed.json'

if (!FLEX_TOKEN || !QUERY_ID) {
  console.error('Missing IBKR_TOKEN or IBKR_QUERY_ID env vars')
  process.exit(1)
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function requestStatement() {
  const url = `${BASE_URL}.SendRequest?t=${FLEX_TOKEN}&q=${QUERY_ID}&v=3`
  console.log('Requesting Flex statement...')
  const res = await fetch(url)
  const text = await res.text()
  const codeMatch = text.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/)
  if (!codeMatch) { console.error('Failed:', text); throw new Error('Failed to request statement') }
  console.log(`Reference: ${codeMatch[1]}`)
  return codeMatch[1]
}

async function getStatement(refCode) {
  const url = `${BASE_URL}.GetStatement?t=${FLEX_TOKEN}&q=${refCode}&v=3`
  for (let i = 0; i < 15; i++) {
    console.log(`Fetching (attempt ${i + 1})...`)
    const res = await fetch(url)
    const text = await res.text()
    if (text.includes('<FlexStatementResponse')) { await sleep(5000); continue }
    if (text.includes(',')) { console.log(`Got CSV (${text.length} chars)`); return text }
    console.log('Waiting...'); await sleep(5000)
  }
  throw new Error('Timeout waiting for statement')
}

function parseDate(raw) {
  if (!raw || raw.length < 8) return null
  return raw.substring(0, 4) + '-' + raw.substring(4, 6) + '-' + raw.substring(6, 8)
}

function parseCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim())
  const sections = { trades: [], cash: [], nav: [], changeInNav: [], mtm: [] }
  let currentSection = null, headers = []

  for (const line of lines) {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())

    if (cols[1] === 'Header') {
      if (cols[0] === 'Trades') currentSection = 'trades'
      else if (cols[0] === 'Cash Transactions') currentSection = 'cash'
      else if (cols[0].includes('Net Asset Value')) currentSection = 'nav'
      else if (cols[0].includes('Change in NAV')) currentSection = 'changeInNav'
      else if (cols[0].includes('Mark-to-Market')) currentSection = 'mtm'
      else currentSection = null
      headers = cols.slice(2)
      continue
    }

    if (cols[1] === 'Data' && currentSection) {
      const row = {}; cols.slice(2).forEach((v, i) => { if (headers[i]) row[headers[i]] = v })
      sections[currentSection].push(row)
    }
  }
  return sections
}

function calculateTWR(changeInNav) {
  // Sort by date
  const sorted = changeInNav
    .map(r => ({
      date: parseDate(r.ReportDate || r.Date || ''),
      startingValue: parseFloat(r.StartingValue || r['Starting Value'] || 0),
      mtm: parseFloat(r.MTM || r['Mark-to-Market'] || r['Mark-To-Market'] || 0),
      deposits: parseFloat(r.Deposits || r.Deposit || 0),
      withdrawals: parseFloat(r.Withdrawals || r.Withdrawal || 0),
      endingValue: parseFloat(r.EndingValue || r['Ending Value'] || 0),
    }))
    .filter(r => r.date && r.startingValue !== 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!sorted.length) return { dailyReturns: [], twr: 0 }

  let twrProduct = 1
  const dailyReturns = []

  for (const day of sorted) {
    // Daily return = (EndingNAV - StartingNAV - Deposits + Withdrawals) / StartingNAV
    const adjustedStart = day.startingValue + day.deposits - Math.abs(day.withdrawals)
    const dailyReturn = adjustedStart !== 0 ? (day.endingValue - adjustedStart) / Math.abs(adjustedStart) : 0
    twrProduct *= (1 + dailyReturn)
    const cumulativePct = Math.round((twrProduct - 1) * 10000) / 100

    dailyReturns.push({
      date: day.date,
      dailyReturn: Math.round(dailyReturn * 10000) / 100,
      cumulativePct,
      endingValue: day.endingValue,
    })
  }

  return {
    dailyReturns,
    twr: Math.round((twrProduct - 1) * 10000) / 100
  }
}

function processData(sections, existing) {
  const existingTradeKeys = new Set(existing.trades.map(t => `${t.date}|${t.symbol}|${t.type}|${t.quantity}|${t.price}`))
  let newTradesCount = 0

  // Process trades
  for (const t of sections.trades) {
    const date = parseDate(t.TradeDate || t.DateTime)
    if (!date) continue
    const symbol = t.Symbol || ''
    const isBuy = (t['Buy/Sell'] || t.Side || '').toUpperCase() === 'BUY'
    const qty = parseFloat(t.Quantity || 0)
    const price = parseFloat(t.TradePrice || t.Price || 0)
    const commission = parseFloat(t.IBCommission || t.Commission || 0)
    const netCash = parseFloat(t.NetCash || 0)
    const key = `${date}|${symbol}|${isBuy ? 'Buy' : 'Sell'}|${qty}|${price}`
    if (existingTradeKeys.has(key)) continue
    existing.trades.push({ date, symbol, type: isBuy ? 'Buy' : 'Sell', quantity: qty, price, currency: 'USD', grossHKD: netCash - commission, commission, netHKD: netCash })
    existingTradeKeys.add(key)
    newTradesCount++
  }
  existing.trades.sort((a, b) => b.date.localeCompare(a.date))

  // Process NAV
  if (sections.nav.length > 0) {
    const latest = sections.nav[sections.nav.length - 1]
    const total = parseFloat(latest.Total || latest['Total'] || 0)
    const cash = parseFloat(latest.Cash || 0)
    if (total > 0) {
      existing.summary.netLiquidationValue = total
      existing.summary.cash = cash
      existing.summary.endingCash = cash
    }
  }

  // Process deposits/withdrawals
  for (const c of sections.cash) {
    const type = (c.Type || '').toLowerCase()
    const amount = parseFloat(c.Amount || 0)
    const date = parseDate(c['Date/Time'] || c.DateTime || c.Date || '')
    if (type.includes('deposit') && amount > 0) {
      const exists = existing.deposits?.some(d => d.date === date && d.amount === amount)
      if (!exists) {
        existing.deposits = existing.deposits || []
        existing.deposits.push({ date, amount })
        existing.summary.totalDeposited += amount
        existing.summary.netDeposited += amount
      }
    }
    if ((type.includes('withdrawal') || type.includes('disbursement')) && amount < 0) {
      existing.summary.totalWithdrawn += Math.abs(amount)
      existing.summary.netDeposited -= Math.abs(amount)
    }
  }

  // Calculate TWR from Change in NAV
  if (sections.changeInNav.length > 0) {
    console.log(`Processing ${sections.changeInNav.length} Change in NAV records`)
    const { dailyReturns, twr } = calculateTWR(sections.changeInNav)

    if (dailyReturns.length > 0) {
      existing.dailyPnL = dailyReturns.map(d => ({
        date: d.date,
        pnl: d.dailyReturn,  // daily % return
        cumulative: d.cumulativePct,  // cumulative TWR %
        endingValue: d.endingValue,
      }))
      existing.summary.totalReturn = twr
      existing.summary.totalPnL = Math.round((existing.summary.netLiquidationValue - existing.summary.netDeposited) * 100) / 100
      console.log(`TWR: ${twr}%, Trading days: ${dailyReturns.length}`)
    }
  } else {
    // Fallback: recalc from trades (realized only)
    console.log('No Change in NAV data, using realized trades P&L')
    const dailyByDateSym = {}
    for (const t of existing.trades) {
      const key = `${t.date}|${t.symbol}`
      if (!dailyByDateSym[key]) dailyByDateSym[key] = { buys: [], sells: [] }
      if (t.type === 'Buy') dailyByDateSym[key].buys.push(t); else dailyByDateSym[key].sells.push(t)
    }
    const dailyPnL = {}
    for (const [key, data] of Object.entries(dailyByDateSym)) {
      const date = key.split('|')[0]
      const buyQty = data.buys.reduce((s, t) => s + t.quantity, 0)
      const sellQty = data.sells.reduce((s, t) => s + Math.abs(t.quantity), 0)
      if (buyQty > 0 && sellQty > 0) {
        const matched = Math.min(buyQty, sellQty)
        let totalBuy = data.buys.reduce((s, t) => s + t.netHKD, 0)
        let totalSell = data.sells.reduce((s, t) => s + t.netHKD, 0)
        if (buyQty !== sellQty) { if (buyQty > sellQty) totalBuy *= matched / buyQty; else totalSell *= matched / sellQty }
        dailyPnL[date] = (dailyPnL[date] || 0) + totalSell + totalBuy
      }
    }
    let cumulative = 0
    existing.dailyPnL = Object.keys(dailyPnL).sort().map(date => {
      const pnl = Math.round(dailyPnL[date] * 100) / 100
      cumulative = Math.round((cumulative + pnl) * 100) / 100
      return { date, pnl, cumulative }
    })
  }

  console.log(`New trades: ${newTradesCount}, Total trades: ${existing.trades.length}`)
  return existing
}

async function main() {
  console.log('=== IBKR Auto-Sync v2 (TWR) ===')
  const refCode = await requestStatement()
  await sleep(3000)
  const csv = await getStatement(refCode)
  const sections = parseCSV(csv)
  console.log(`Parsed: ${sections.trades.length} trades, ${sections.cash.length} cash, ${sections.nav.length} NAV, ${sections.changeInNav.length} changeInNAV, ${sections.mtm.length} MTM`)
  const existing = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  const updated = processData(sections, existing)
  writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2))
  writeFileSync(SRC_DATA_PATH, JSON.stringify(updated))
  console.log('=== Done ===')
}

main()
