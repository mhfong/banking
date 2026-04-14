// IBKR Flex Query ETL Pipeline v2
// Fetch → Parse → Calculate → Firebase Push
// All calculations done here, frontend just visualizes

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore'

const FLEX_TOKEN = process.env.IBKR_TOKEN
const QUERY_ID = process.env.IBKR_QUERY_ID
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY
const BASE_URL = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService'
const OWNER_UID = '0G3jUSlKzQbzOrbD1cY0ari1Y4i1'

if (!FLEX_TOKEN || !QUERY_ID || !FIREBASE_API_KEY) {
  console.error('[ETL] Missing required env vars: IBKR_TOKEN, IBKR_QUERY_ID, VITE_FIREBASE_API_KEY')
  process.exit(1)
}

// Firebase setup
const fbApp = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const fireDb = getFirestore(fbApp)

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function requestStatement() {
  const url = `${BASE_URL}.SendRequest?t=${FLEX_TOKEN}&q=${QUERY_ID}&v=3`
  console.log('[ETL] Requesting Flex statement...')
  const res = await fetch(url)
  const text = await res.text()
  const codeMatch = text.match(/<ReferenceCode>(\d+)<\/ReferenceCode>/)
  if (!codeMatch) {
    console.error('[ETL] Failed to get reference code:', text.substring(0, 500))
    throw new Error('Failed to request statement')
  }
  console.log(`[ETL] Reference: ${codeMatch[1]}`)
  return codeMatch[1]
}

async function getStatement(refCode) {
  const url = `${BASE_URL}.GetStatement?t=${FLEX_TOKEN}&q=${refCode}&v=3`
  for (let i = 0; i < 15; i++) {
    console.log(`[ETL] Fetching (attempt ${i + 1})...`)
    const res = await fetch(url)
    const text = await res.text()
    
    if (text.includes('<FlexStatementResponse')) {
      console.log('[ETL] Still generating, waiting...')
      await sleep(5000)
      continue
    }
    
    if (text.length > 500 && text.includes(',')) {
      console.log(`[ETL] Got CSV data (${(text.length / 1024 / 1024).toFixed(2)} MB)`)
      return text
    }
    
    console.log('[ETL] Unexpected response, retrying...')
    await sleep(5000)
  }
  
  throw new Error('Timeout waiting for statement')
}

function parseCSV(csv) {
  const lines = csv.split('\n')
  const sections = {}
  let currentTag = null, currentHeader = null
  
  for (const line of lines) {
    if (!line.trim()) continue
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''))
    
    // Section start
    if (cols[0] === 'BOS') {
      currentTag = cols[1]
      sections[currentTag] = []
      continue
    }
    
    // Header row
    if (cols[0] === 'HEADER' && cols[1] === currentTag) {
      currentHeader = cols.slice(2)
      continue
    }
    
    // Data row
    if (cols[0] === 'DATA' && cols[1] === currentTag && currentHeader) {
      const data = cols.slice(2)
      const row = {}
      currentHeader.forEach((h, i) => { row[h] = data[i] || '' })
      sections[currentTag].push(row)
    }
    
    // Section end
    if (cols[0] === 'EOS') currentHeader = null
  }
  
  return sections
}

function formatDate(raw) {
  if (!raw || raw.length < 8) return null
  const d = raw.substring(0, 8)
  return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`
}

function processData(sections) {
  console.log('[ETL] Processing data...')
  
  const result = {
    summary: {
      netLiquidationValue: 0,
      totalPnL: 0,
      netDeposited: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      totalInterest: 0,
      twr: 0
    },
    dailyTWR: [],
    trades: [],
    deposits: [],
    fifoDailyPnL: [],
    monthlyInterest: {},
    monthlyInterestAccrued: {},
    lastSyncAt: new Date().toISOString()
  }
  
  // === NAV Data ===
  // EQUT has daily equity data (262 rows), CNAV has consolidated summary (1 row)
  // EQUT Total = Stock + Cash; for cash-only accounts, Cash IS the NLV
  const navRows = (sections.EQUT || [])
    .map(r => {
      const cash = parseFloat(r.Cash || 0)
      const stock = parseFloat(r.Stock || 0)
      const total = parseFloat(r.Total || 0)
      // Use Total if > 0, otherwise use Cash + Stock
      const nlv = total > 0 ? total : (cash + stock)
      return {
        date: formatDate(r.ReportDate),
        total: nlv
      }
    })
    .filter(r => r.total > 0 && r.date)
    .sort((a, b) => a.date.localeCompare(b.date))
  
  // Get NLV from CNAV (consolidated) as authoritative final value, fallback to last EQUT row
  const cnavRow = (sections.CNAV || [])[0]
  const cnavNLV = cnavRow ? parseFloat(cnavRow.EndingValue || 0) : 0
  const cnavTWR = cnavRow ? parseFloat(cnavRow.TWR || 0) : 0
  
  if (navRows.length === 0 && cnavNLV === 0) throw new Error('No NAV data found')
  
  // Use CNAV EndingValue as authoritative NLV, fallback to last EQUT row
  result.summary.netLiquidationValue = cnavNLV > 0 ? cnavNLV : (navRows.length > 0 ? navRows[navRows.length - 1].total : 0)
  console.log(`[ETL] EQUT rows: ${navRows.length}, CNAV NLV: $${cnavNLV.toFixed(2)}, CNAV TWR: ${cnavTWR}%`)
  console.log(`[ETL] Using NLV: $${result.summary.netLiquidationValue.toFixed(2)}`)
  
  // === Cash Flows ===
  // Build NAV date set for snapping cash flows
  const navDateSet = new Set(navRows.map(d => d.date))
  
  function snapToNavDate(date) {
    // If date is already a NAV date, keep it
    if (navDateSet.has(date)) return date
    // Otherwise find the next NAV date (deposit settles next trading day)
    for (const nr of navRows) {
      if (nr.date > date) return nr.date
    }
    // Fallback: use last NAV date
    return navRows[navRows.length - 1].date
  }
  
  const cfByDate = {}
  for (const r of (sections.CTRN || [])) {
    const type = (r.Type || '').toLowerCase()
    if (!type.includes('deposit') && !type.includes('withdrawal')) continue
    
    const raw = (r['Date/Time'] || '')
    let date = formatDate(raw)
    
    // Late deposits after 8 PM shift to next trading day
    if (raw.includes(';')) {
      const time = parseInt(raw.split(';')[1].substring(0, 2))
      if (time >= 20) {
        // Force to next day, then snap
        const d = new Date(date + 'T12:00:00Z')
        d.setDate(d.getDate() + 1)
        date = d.toISOString().slice(0, 10)
      }
    }
    
    // Snap all cash flows to nearest NAV date
    date = snapToNavDate(date)
    
    const amount = parseFloat(r.Amount || 0)
    cfByDate[date] = (cfByDate[date] || 0) + amount
  }
  
  // Calculate net deposited
  let totalDeposited = 0, totalWithdrawn = 0
  for (const [, amt] of Object.entries(cfByDate)) {
    if (amt > 0) totalDeposited += amt
    else totalWithdrawn -= amt
  }
  
  result.summary.netDeposited = Math.round((totalDeposited - totalWithdrawn) * 100) / 100
  result.summary.totalDeposited = Math.round(totalDeposited * 100) / 100
  result.summary.totalWithdrawn = Math.round(totalWithdrawn * 100) / 100
  console.log(`[ETL] Net Deposited: $${result.summary.netDeposited.toFixed(2)}`)
  
  // === TWR Calculation ===
  let twrProduct = 1
  for (let i = 1; i < navRows.length; i++) {
    const prev = navRows[i - 1]
    const curr = navRows[i]
    const cf = cfByDate[curr.date] || 0
    
    const denominator = prev.total + cf
    if (denominator <= 0) continue
    
    const dailyReturn = curr.total / denominator - 1
    twrProduct *= (1 + dailyReturn)
    
    result.dailyTWR.push({
      date: curr.date,
      pnl: Math.round(dailyReturn * 10000) / 100,  // basis points
      cumulative: Math.round((twrProduct - 1) * 10000) / 100
    })
  }
  
  result.summary.twr = Math.round((twrProduct - 1) * 10000) / 100
  console.log(`[ETL] TWR: ${result.summary.twr.toFixed(4)}%`)
  
  // === Total PnL = NLV - NetDeposited ===
  result.summary.totalPnL = Math.round((result.summary.netLiquidationValue - result.summary.netDeposited) * 100) / 100
  
  // === Interest from CTRN ===
  const monthlyInt = {}
  const monthlyIntAccrued = {}
  let totalInt = 0
  
  for (const r of (sections.CTRN || [])) {
    const type = (r.Type || '').toLowerCase()
    if (!type.includes('interest')) continue
    
    const raw = (r['Date/Time'] || '')
    const date = formatDate(raw)
    if (!date) continue
    
    const month = date.substring(0, 7)
    let amount = parseFloat(r.Amount || 0)
    
    // Convert USD to HKD at pegged rate
    if (r.CurrencyPrimary === 'USD') {
      amount = Math.round(amount * 7.78 * 100) / 100
    }
    
    totalInt += amount
    
    // Paid vs accrued heuristic: recent ones are usually accrued
    if (type.includes('received')) {
      monthlyInt[month] = Math.round(((monthlyInt[month] || 0) + amount) * 100) / 100
    } else {
      monthlyIntAccrued[month] = Math.round(((monthlyIntAccrued[month] || 0) + amount) * 100) / 100
    }
  }
  
  result.summary.totalInterest = Math.round(totalInt * 100) / 100
  result.monthlyInterest = monthlyInt
  result.monthlyInterestAccrued = monthlyIntAccrued
  console.log(`[ETL] Total Interest: $${result.summary.totalInterest.toFixed(2)}`)
  
  // === Trades ===
  const tradesByDate = {}
  for (const r of (sections.TRNT || [])) {
    if (!r.Symbol || r.AssetClass === 'CASH') continue
    
    const date = formatDate(r.TradeDate)
    if (!date) continue
    
    const qty = parseFloat(r.Quantity || 0)
    const price = parseFloat(r.TradePrice || 0)
    const comm = parseFloat(r.IBCommission || 0)
    const netCash = parseFloat(r.NetCash || 0)
    const fxRate = parseFloat(r.FXRateToBase || 1)
    const fifoPnl = parseFloat(r.FifoPnlRealized || 0)
    
    if (!date || !r.Symbol || price <= 0) continue
    
    const grossUSD = Math.abs(qty) * price
    result.trades.push({
      date,
      symbol: r.Symbol,
      type: r['Buy/Sell'] === 'BUY' ? 'Buy' : 'Sell',
      quantity: Math.abs(qty),
      price,
      currency: r.CurrencyPrimary,
      grossHKD: Math.round(grossUSD * fxRate * 100) / 100,
      commission: Math.round(Math.abs(comm) * fxRate * 100) / 100,
      netHKD: Math.round(netCash * fxRate * 100) / 100,
      fifoPnlUSD: fifoPnl,
      fifoPnlHKD: Math.round(fifoPnl * fxRate * 100) / 100
    })
    
    // Aggregate FIFO PnL by date (only sells)
    if (r['Buy/Sell'] === 'SELL' && fifoPnl !== 0) {
      if (!tradesByDate[date]) tradesByDate[date] = { pnl: 0, commission: 0 }
      tradesByDate[date].pnl += Math.round(fifoPnl * fxRate * 100) / 100
      tradesByDate[date].commission += Math.round(Math.abs(comm) * fxRate * 100) / 100
    }
  }
  
  result.trades.sort((a, b) => b.date.localeCompare(a.date))
  console.log(`[ETL] Trades: ${result.trades.length}`)
  
  // === FIFO Daily PnL (for calendar) ===
  for (const [date, data] of Object.entries(tradesByDate)) {
    if (Math.abs(data.pnl) >= 0.01) {
      result.fifoDailyPnL.push({
        date,
        pnl: data.pnl,
        commission: data.commission
      })
    }
  }
  result.fifoDailyPnL.sort((a, b) => a.date.localeCompare(b.date))
  
  // === Deposits (raw individual entries for transaction sync) ===
  result.rawDeposits = []
  for (const r of (sections.CTRN || [])) {
    const type = (r.Type || '').toLowerCase()
    if (!type.includes('deposit') && !type.includes('withdrawal')) continue
    const raw = (r['Date/Time'] || '')
    const date = formatDate(raw)
    const amount = parseFloat(r.Amount || 0)
    if (date && amount !== 0) {
      result.rawDeposits.push({ date, amount })
    }
  }
  
  // === Deposits (aggregated by snapped date, for TWR/summary only) ===
  for (const [date, amount] of Object.entries(cfByDate).sort(([a], [b]) => a.localeCompare(b))) {
    result.deposits.push({ date, amount })
  }
  
  console.log(`[ETL] Summary:`)
  console.log(`  NLV: $${result.summary.netLiquidationValue.toFixed(2)}`)
  console.log(`  Total PnL: $${result.summary.totalPnL.toFixed(2)}`)
  console.log(`  Net Deposited: $${result.summary.netDeposited.toFixed(2)}`)
  console.log(`  Interest: $${result.summary.totalInterest.toFixed(2)}`)
  console.log(`  TWR: ${result.summary.twr.toFixed(4)}%`)
  
  return result
}

async function pushToFirebase(data) {
  console.log('[ETL] Pushing to Firebase...')
  
  // Merge with existing to preserve history
  const docRef = doc(fireDb, 'investment_data', 'latest')
  
  try {
    // Merge daily TWR (keep all historical)
    const existingDailyTWR = (await (await import('firebase/firestore')).getDoc(docRef)).data()?.dailyTWR || []
    const twr_map = new Map()
    existingDailyTWR.forEach(d => twr_map.set(d.date, d))
    data.dailyTWR.forEach(d => twr_map.set(d.date, d))
    data.dailyTWR = Array.from(twr_map.values()).sort((a, b) => a.date.localeCompare(b.date))
    
    // Merge trades (dedup by date, symbol, type, price)
    const tradeKey = t => `${t.date}-${t.symbol}-${t.type}-${t.price}`
    const existingTrades = (await (await import('firebase/firestore')).getDoc(docRef)).data()?.trades || []
    const trade_map = new Map()
    existingTrades.forEach(t => trade_map.set(tradeKey(t), t))
    data.trades.forEach(t => trade_map.set(tradeKey(t), t))
    data.trades = Array.from(trade_map.values()).sort((a, b) => b.date.localeCompare(a.date))
    
    // Push to Firestore (exclude rawDeposits — internal use only)
    const { rawDeposits, ...firebaseData } = data
    await setDoc(docRef, firebaseData)
    console.log('[ETL] Pushed to Firestore')
  } catch (e) {
    console.error('[ETL] Firebase error:', e.message)
    throw e
  }
}

async function syncDepositsToTransactions(data) {
  console.log('[ETL] Syncing deposits to transactions collection...')
  
  try {
    const snap = await getDocs(collection(fireDb, 'transactions'))
    const existingCounts = {}
    snap.docs.forEach(d => {
      const txn = d.data()
      if (txn.paymentMethod === 'IBKR') {
        const dateStr = typeof txn.date === 'string' ? txn.date : (txn.date?.toDate ? txn.date.toDate().toISOString().slice(0, 10) : String(txn.date))
        const key = `${dateStr}|${Math.round(txn.amount * 100) / 100}|${txn.type}`
        existingCounts[key] = (existingCounts[key] || 0) + 1
      }
    })
    
    const newTxns = []
    for (const d of (data.rawDeposits || [])) {
      // Only sync actual deposits (money into IBKR = expense from bank)
      if (d.amount <= 0) continue
      
      const type = 'expense'
      const key = `${d.date}|${Math.round(d.amount * 100) / 100}|${type}`
      const fbCount = existingCounts[key] || 0
      
      if (fbCount === 0) {
        const { Timestamp } = await import('firebase/firestore')
        newTxns.push({
          date: d.date,
          description: 'IBKR Deposit',
          amount: Math.abs(d.amount),
          type: type,
          category: 'Investment',
          paymentMethod: 'IBKR',
          createdAt: Timestamp.fromDate(new Date(d.date + 'T00:00:00')),
          userId: OWNER_UID,
          excludeFromChart: true
        })
      }
    }
    
    if (newTxns.length > 0) {
      const batch = writeBatch(fireDb)
      for (const t of newTxns) {
        batch.set(doc(collection(fireDb, 'transactions')), t)
      }
      await batch.commit()
      console.log(`[ETL] Added ${newTxns.length} deposits to transactions`)
    }
  } catch (e) {
    console.error('[ETL] Deposit sync error:', e.message)
  }
}

async function main() {
  console.log('=== IBKR ETL Pipeline v2 ===')
  console.log(new Date().toISOString())
  
  try {
    // Fetch
    const refCode = await requestStatement()
    await sleep(5000)
    const csv = await getStatement(refCode)
    
    // Parse
    const sections = parseCSV(csv)
    console.log(`[ETL] Parsed sections: ${Object.keys(sections).join(', ')}`)
    
    // Process
    const data = processData(sections)
    
    // Push
    await pushToFirebase(data)
    await syncDepositsToTransactions(data)
    
    console.log('=== ETL Complete ===')
    process.exit(0)
  } catch (e) {
    console.error('[ETL] Fatal error:', e.message)
    console.error(e.stack)
    process.exit(1)
  }
}

main()
