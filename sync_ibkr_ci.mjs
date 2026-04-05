// IBKR Flex Query Sync - CI version (reads secrets from env vars)
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
  if (!codeMatch) {
    console.error('Failed:', text)
    throw new Error('Failed to request statement')
  }
  console.log(`Reference: ${codeMatch[1]}`)
  return codeMatch[1]
}

async function getStatement(refCode) {
  const url = `${BASE_URL}.GetStatement?t=${FLEX_TOKEN}&q=${refCode}&v=3`
  for (let i = 0; i < 10; i++) {
    console.log(`Fetching (attempt ${i + 1})...`)
    const res = await fetch(url)
    const text = await res.text()
    if (text.includes('<FlexStatementResponse')) {
      await sleep(5000)
      continue
    }
    if (text.includes(',') && (text.includes('Transaction') || text.includes('Symbol') || text.includes('Trades'))) {
      console.log(`Got CSV (${text.length} chars)`)
      return text
    }
    console.log('Waiting...')
    await sleep(5000)
  }
  throw new Error('Timeout waiting for statement')
}

function parseCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim())
  const sections = { trades: [], cash: [], nav: [] }
  let currentSection = null, headers = []
  for (const line of lines) {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim())
    if (cols[0] === 'Trades' && cols[1] === 'Header') { currentSection = 'trades'; headers = cols.slice(2); continue }
    if (cols[0] === 'Cash Transactions' && cols[1] === 'Header') { currentSection = 'cash'; headers = cols.slice(2); continue }
    if (cols[0] === 'Net Asset Value in Base' && cols[1] === 'Header') { currentSection = 'nav'; headers = cols.slice(2); continue }
    if (cols[1] === 'Data' && currentSection) {
      const row = {}; cols.slice(2).forEach((v, i) => { row[headers[i]] = v }); sections[currentSection].push(row)
    }
  }
  return sections
}

function processNewData(sections, existing) {
  const existingTradeKeys = new Set(existing.trades.map(t => `${t.date}|${t.symbol}|${t.type}|${t.quantity}|${t.price}`))
  let newTradesCount = 0

  for (const t of sections.trades) {
    const date = t.TradeDate?.substring(0, 4) + '-' + t.TradeDate?.substring(4, 6) + '-' + t.TradeDate?.substring(6, 8)
    if (!date || date.includes('undefined')) continue
    const symbol = t.Symbol || ''
    const isBuy = (t['Buy/Sell'] || '').toUpperCase() === 'BUY'
    const qty = parseFloat(t.Quantity || 0)
    const price = parseFloat(t.TradePrice || 0)
    const commission = parseFloat(t.IBCommission || 0)
    const netCash = parseFloat(t.NetCash || 0)
    const key = `${date}|${symbol}|${isBuy ? 'Buy' : 'Sell'}|${qty}|${price}`
    if (existingTradeKeys.has(key)) continue
    existing.trades.push({ date, symbol, type: isBuy ? 'Buy' : 'Sell', quantity: qty, price, currency: 'USD', grossHKD: netCash - commission, commission, netHKD: netCash })
    existingTradeKeys.add(key)
    newTradesCount++
  }
  existing.trades.sort((a, b) => b.date.localeCompare(a.date))

  if (sections.nav.length > 0) {
    const latest = sections.nav[sections.nav.length - 1]
    const total = parseFloat(latest.Total || 0)
    const cash = parseFloat(latest.Cash || 0)
    if (total > 0) {
      existing.summary.netLiquidationValue = total
      existing.summary.cash = cash
      existing.summary.endingCash = cash
      existing.summary.totalPnL = Math.round((total - existing.summary.netDeposited) * 100) / 100
      existing.summary.totalReturn = Math.round((total - existing.summary.netDeposited) / existing.summary.netDeposited * 10000) / 100
      console.log(`NLV: $${total}, Return: ${existing.summary.totalReturn}%`)
    }
  }

  for (const c of sections.cash) {
    const type = (c.Type || '').toLowerCase()
    const amount = parseFloat(c.Amount || 0)
    const dateRaw = c['Date/Time'] || c.DateTime || ''
    const date = dateRaw.substring(0, 4) + '-' + dateRaw.substring(4, 6) + '-' + dateRaw.substring(6, 8)
    if (type.includes('deposit') && amount > 0) {
      const exists = existing.deposits?.some(d => d.date === date && d.amount === amount)
      if (!exists) {
        existing.deposits = existing.deposits || []
        existing.deposits.push({ date, amount })
        existing.summary.totalDeposited += amount
        existing.summary.netDeposited += amount
      }
    }
  }

  // Recalc daily PnL (matched round trips only)
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

  console.log(`New trades: ${newTradesCount}, Total trades: ${existing.trades.length}, Trading days: ${existing.dailyPnL.length}`)
  return existing
}

async function main() {
  console.log('=== IBKR Auto-Sync (CI) ===')
  const refCode = await requestStatement()
  await sleep(3000)
  const csv = await getStatement(refCode)
  const sections = parseCSV(csv)
  console.log(`Parsed: ${sections.trades.length} trades, ${sections.cash.length} cash, ${sections.nav.length} NAV`)
  const existing = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  const updated = processNewData(sections, existing)
  writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2))
  writeFileSync(SRC_DATA_PATH, JSON.stringify(updated))
  console.log('=== Done ===')
}

main()
