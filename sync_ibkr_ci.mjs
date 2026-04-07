// IBKR Flex Query Sync - CI version v3 (proven parsing logic)
import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore'

const FLEX_TOKEN = process.env.IBKR_TOKEN
const QUERY_ID = process.env.IBKR_QUERY_ID
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY'
const BASE_URL = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService'

// Init Firebase
const fbApp = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const fireDb = getFirestore(fbApp)

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
  if (!codeMatch) { console.error('Failed:', text); throw new Error('Request failed') }
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
    if (text.includes(',') && text.length > 500) { console.log(`Got CSV (${text.length} chars)`); return text }
    await sleep(5000)
  }
  throw new Error('Timeout')
}

function parseDate(raw) {
  if (!raw || raw.length < 8) return null
  return raw.substring(0, 4) + '-' + raw.substring(4, 6) + '-' + raw.substring(6, 8)
}

function parseFlex(csv) {
  const lines = csv.split('\n')
  const navChanges = [] // Change in NAV
  const trades = []
  const deposits = []
  let latestNAV = { total: 0, cash: 0 }
  let totalInterest = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''))

    // Change in NAV rows: U18068915 with StartingValue, EndingValue, TWR
    if (cols[0].startsWith('U') && cols.length > 55) {
      const startVal = parseFloat(cols[6] || 0)
      const endVal = parseFloat(cols[55] || 0)
      const twr = parseFloat(cols[56] || 0)
      const dep = parseFloat(cols[13] || 0)
      const mtm = parseFloat(cols[7] || 0)
      const fromDate = cols[4] || ''
      
      if ((startVal !== 0 || endVal !== 0) && fromDate.length === 8) {
        const interest = parseFloat(cols[30] || 0)  // Interest field
        if (interest !== 0) totalInterest += interest
        navChanges.push({
          date: parseDate(fromDate),
          startingValue: startVal,
          endingValue: endVal,
          twr: twr,
          deposits: dep,
          mtm: mtm
        })
      }
    }

    // Trade rows: CurrencyPrimary, Symbol, DateTime, TradeDate, TradePrice, IBCommission, IBCommissionCurrency, NetCash, Buy/Sell
    // These are 9-column rows starting with currency code like "USD" or "HKD"
    if (cols.length === 9 && /^[A-Z]{3}$/.test(cols[0]) && cols[1] && /^\d{8}/.test(cols[3])) {
      const currency = cols[0]
      const symbol = cols[1]
      const tradeDate = parseDate(cols[3])
      const price = parseFloat(cols[4] || 0)
      const commission = parseFloat(cols[5] || 0)
      const netCash = parseFloat(cols[7] || 0)
      const side = cols[8]

      if (tradeDate && symbol && price > 0) {
        trades.push({
          date: tradeDate,
          symbol,
          type: side === 'BUY' ? 'Buy' : 'Sell',
          quantity: Math.round(Math.abs(netCash / price)),
          price,
          currency,
          grossHKD: netCash - commission,
          commission,
          netHKD: netCash
        })
      }
    }

    // Cash transaction rows (deposits): CurrencyPrimary, Date/Time, Amount, Type
    if (cols.length === 4 && /^[A-Z]{3}$/.test(cols[0]) && /^\d{8}/.test(cols[1])) {
      const amount = parseFloat(cols[2] || 0)
      const type = (cols[3] || '').toLowerCase()
      const date = parseDate(cols[1])
      if (date && type.includes('deposit') && amount > 0) {
        deposits.push({ date, amount })
      }
    }

    // NAV rows: CurrencyPrimary, ReportDate, Cash, ..., Total
    if (cols.length === 17 && /^[A-Z]{3}$/.test(cols[0]) && /^\d{8}$/.test(cols[1])) {
      const total = parseFloat(cols[14] || 0)
      const cash = parseFloat(cols[2] || 0)
      if (total > 0) {
        latestNAV = { total, cash }
      }
    }
  }

  return { navChanges, trades, deposits, latestNAV, totalInterest }
}

async function syncDepositsToFirebase(rawCsv) {
  try {
    const lines = rawCsv.split('\n')
    
    // Get existing IBKR transactions
    const snap = await getDocs(collection(fireDb, 'transactions'))
    const existingKeys = new Set()
    snap.docs.forEach(d => {
      const data = d.data()
      if (data.paymentMethod === 'IBKR') {
        existingKeys.add(`${data.date}|${data.amount}`)
      }
    })

    const newTxns = []
    for (const line of lines) {
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''))
      // Cash transaction rows: HKD, DateTime, Amount, Type
      if (cols.length === 4 && cols[0] === 'HKD' && /^\d{8}/.test(cols[1])) {
        const amount = parseFloat(cols[2] || 0)
        const type = (cols[3] || '').toLowerCase()
        const dateRaw = cols[1].substring(0, 8)
        const date = `${dateRaw.substring(0,4)}-${dateRaw.substring(4,6)}-${dateRaw.substring(6,8)}`
        
        if (date < '2025-01-01') continue
        
        if (type.includes('deposit') && amount > 0) {
          const key = `${date}|${amount}`
          if (!existingKeys.has(key)) {
            newTxns.push({
              date,
              description: 'IBKR Deposit',
              amount: amount,
              type: 'expense',
              category: 'Investment',
              paymentMethod: 'IBKR',
              createdAt: Timestamp.fromDate(new Date(date + 'T00:00:00')),
              userId: '0G3jUSlKzQbzOrbD1cY0ari1Y4i1'
            })
            existingKeys.add(key)
          }
        } else if ((type.includes('withdrawal') || type.includes('disbursement')) && amount < 0) {
          const key = `${date}|${Math.abs(amount)}`
          if (!existingKeys.has(key)) {
            newTxns.push({
              date,
              description: 'IBKR Withdrawal',
              amount: Math.abs(amount),
              type: 'income',
              category: 'Investment',
              paymentMethod: 'IBKR',
              createdAt: Timestamp.fromDate(new Date(date + 'T00:00:00')),
              userId: '0G3jUSlKzQbzOrbD1cY0ari1Y4i1'
            })
            existingKeys.add(key)
          }
        }
      }
    }

    if (newTxns.length > 0) {
      const batch = writeBatch(fireDb)
      for (const t of newTxns) {
        batch.set(doc(collection(fireDb, 'transactions')), t)
      }
      await batch.commit()
      console.log(`Added ${newTxns.length} IBKR transactions to Firebase`)
    } else {
      console.log('No new IBKR transactions to add')
    }
  } catch (e) {
    console.error('Firebase deposit sync error:', e.message)
  }
}

async function main() {
  console.log('=== IBKR Auto-Sync v3 ===')

  const refCode = await requestStatement()
  await sleep(5000)
  const csv = await getStatement(refCode)

  const { navChanges, trades, deposits, latestNAV, totalInterest } = parseFlex(csv)
  console.log(`Parsed: ${navChanges.length} NAV changes, ${trades.length} trades, ${deposits.length} deposits, Latest NAV: $${latestNAV.total}, Interest: $${totalInterest.toFixed(2)}`)

  // Load existing data
  const existing = JSON.parse(readFileSync('ibkr_parsed.json', 'utf-8'))

  // Update trades (dedup)
  const existingKeys = new Set(existing.trades.map(t => `${t.date}|${t.symbol}|${t.type}|${t.price}`))
  let newTrades = 0
  for (const t of trades) {
    const key = `${t.date}|${t.symbol}|${t.type}|${t.price}`
    if (!existingKeys.has(key)) {
      existing.trades.push(t)
      existingKeys.add(key)
      newTrades++
    }
  }
  existing.trades.sort((a, b) => b.date.localeCompare(a.date))
  console.log(`New trades: ${newTrades}`)

  // Calculate TWR from Change in NAV
  if (navChanges.length > 0) {
    const sorted = navChanges.filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date))
    let twrProduct = 1
    const dailyPnL = []
    for (const d of sorted) {
      const dailyReturn = d.twr / 100
      twrProduct *= (1 + dailyReturn)
      dailyPnL.push({
        date: d.date,
        pnl: Math.round(d.twr * 10000) / 10000,
        cumulative: Math.round((twrProduct - 1) * 10000) / 100,
        endingValue: d.endingValue
      })
    }
    existing.dailyPnL = dailyPnL
    existing.summary.totalReturn = dailyPnL.length ? dailyPnL[dailyPnL.length - 1].cumulative : 0
    console.log(`TWR: ${existing.summary.totalReturn}%, Days: ${dailyPnL.length}`)
  }

  // Update NAV + Interest
  if (latestNAV.total > 0) {
    existing.summary.netLiquidationValue = latestNAV.total
    existing.summary.cash = latestNAV.cash
    existing.summary.endingCash = latestNAV.cash
    existing.summary.totalPnL = Math.round((latestNAV.total - existing.summary.netDeposited) * 100) / 100
  }
  if (totalInterest !== 0) {
    existing.summary.totalInterest = Math.round(totalInterest * 100) / 100
    console.log(`Total Interest: $${existing.summary.totalInterest}`)
  }

  // Update deposits
  for (const d of deposits) {
    const exists = existing.deposits?.some(e => e.date === d.date && e.amount === d.amount)
    if (!exists) {
      existing.deposits = existing.deposits || []
      existing.deposits.push(d)
      existing.summary.totalDeposited += d.amount
      existing.summary.netDeposited += d.amount
    }
  }

  // Sync deposits/withdrawals to Firebase Transactions
  await syncDepositsToFirebase(csv)

  // Save
  existing.lastSyncAt = new Date().toISOString()
  writeFileSync('ibkr_parsed.json', JSON.stringify(existing, null, 2))
  writeFileSync('src/data/ibkr_parsed.json', JSON.stringify(existing))
  console.log('Saved. Committing...')

  // Commit updated data
  try {
    execSync('git config user.name "IBKR Sync Bot"')
    execSync('git config user.email "bot@banking.local"')
    execSync('git add ibkr_parsed.json src/data/ibkr_parsed.json')
    execSync('git commit -m "Auto-sync IBKR data" --allow-empty')
  } catch (e) {
    console.log('No changes to commit')
  }

  console.log('=== Done ===')
}

main().catch(e => { console.error(e); process.exit(1) })
