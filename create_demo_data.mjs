// Create demo data for account KHEpex9lWFZn7JVNkEHmW2orNDn1
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, writeBatch, Timestamp } from 'firebase/firestore'

const DEMO_UID = 'KHEpex9lWFZn7JVNkEHmW2orNDn1'

const fbApp = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDK4xT9IqS2F-3WrNVtCbCKesPq3cf9JDY',
  authDomain: 'login-system-7d812.firebaseapp.com',
  projectId: 'login-system-7d812'
})
const db = getFirestore(fbApp)

// Helper
const rand = (min, max) => Math.round((Math.random() * (max - min) + min) * 100) / 100
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const INCOME_CATS = ['Salary', 'Freelance', 'Side Income', 'Bonus']
const EXPENSE_CATS = ['Food', 'Transport', 'Rent', 'Utilities', 'Entertainment', 'Shopping', 'Healthcare', 'Education', 'Insurance', 'Other']
const PAYMENT_METHODS = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'FPS']

function generateTransactions() {
  const txns = []
  const start = new Date('2025-01-01')
  const end = new Date()

  // Monthly salary
  let d = new Date(start)
  while (d <= end) {
    // Salary on 1st
    txns.push({
      date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,
      description: 'Monthly Salary',
      amount: rand(28000, 35000),
      type: 'income',
      category: 'Salary',
      paymentMethod: 'Bank Transfer',
      userId: DEMO_UID,
      createdAt: Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), 1))
    })

    // Rent on 1st
    txns.push({
      date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`,
      description: 'Monthly Rent',
      amount: 12000,
      type: 'expense',
      category: 'Rent',
      paymentMethod: 'Bank Transfer',
      userId: DEMO_UID,
      createdAt: Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), 1))
    })

    // 15-25 random expenses per month
    const numExpenses = Math.floor(Math.random() * 11) + 15
    for (let i = 0; i < numExpenses; i++) {
      const day = Math.min(28, Math.floor(Math.random() * 28) + 1)
      const cat = pick(EXPENSE_CATS.filter(c => c !== 'Rent'))
      let amount
      switch(cat) {
        case 'Food': amount = rand(30, 200); break
        case 'Transport': amount = rand(10, 100); break
        case 'Utilities': amount = rand(200, 800); break
        case 'Entertainment': amount = rand(50, 500); break
        case 'Shopping': amount = rand(100, 2000); break
        case 'Healthcare': amount = rand(100, 1000); break
        case 'Education': amount = rand(200, 3000); break
        case 'Insurance': amount = rand(500, 2000); break
        default: amount = rand(20, 300)
      }
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      txns.push({
        date: dateStr,
        description: `${cat} expense`,
        amount,
        type: 'expense',
        category: cat,
        paymentMethod: pick(PAYMENT_METHODS),
        userId: DEMO_UID,
        createdAt: Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), day))
      })
    }

    // 1-3 random income per month (freelance etc)
    const numIncome = Math.floor(Math.random() * 3)
    for (let i = 0; i < numIncome; i++) {
      const day = Math.min(28, Math.floor(Math.random() * 28) + 1)
      const cat = pick(INCOME_CATS.filter(c => c !== 'Salary'))
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      txns.push({
        date: dateStr,
        description: `${cat} payment`,
        amount: rand(1000, 8000),
        type: 'income',
        category: cat,
        paymentMethod: pick(PAYMENT_METHODS),
        userId: DEMO_UID,
        createdAt: Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), day))
      })
    }

    // IBKR deposit (every 2-3 months)
    if (d.getMonth() % 3 === 0) {
      const depAmt = rand(20000, 50000)
      txns.push({
        date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-15`,
        description: 'IBKR Deposit',
        amount: depAmt,
        type: 'expense',
        category: 'Investment',
        paymentMethod: 'IBKR',
        userId: DEMO_UID,
        excludeFromChart: true,
        createdAt: Timestamp.fromDate(new Date(d.getFullYear(), d.getMonth(), 15))
      })
    }

    d.setMonth(d.getMonth() + 1)
  }
  return txns
}

function generateInvestmentData() {
  // Generate daily TWR data from 2025-01 to now
  const dailyTWR = []
  const trades = []
  const fifoDailyPnL = []
  const deposits = []
  const monthlyInterest = {}

  let cumTWR = 0
  let nlv = 100000 // Starting NLV in HKD
  let netDeposited = 100000
  const start = new Date('2025-01-02')
  const end = new Date()

  let d = new Date(start)
  while (d <= end) {
    const dow = d.getDay()
    if (dow === 0 || dow === 6) { d.setDate(d.getDate() + 1); continue } // skip weekends

    const dateStr = d.toISOString().substring(0, 10)
    const monthKey = dateStr.substring(0, 7)

    // Random daily return -2% to +2% with slight positive bias
    const dailyReturn = (Math.random() - 0.47) * 0.04
    cumTWR = (1 + cumTWR / 100) * (1 + dailyReturn) * 100 - 100
    nlv = nlv * (1 + dailyReturn)

    dailyTWR.push({
      date: dateStr,
      dailyReturn: Math.round(dailyReturn * 10000) / 100,
      cumulativeTWR: Math.round(cumTWR * 100) / 100
    })

    // Random trades (60% of days)
    if (Math.random() > 0.4) {
      const pnl = rand(-500, 800)
      const commission = rand(1, 5)
      fifoDailyPnL.push({
        date: dateStr,
        pnl: Math.round(pnl),
        commission: -commission
      })

      trades.push({
        date: dateStr,
        symbol: pick(['GDX', 'NUGT', 'GLD', 'GDXJ', 'SLV']),
        quantity: pick([100, 200, 300, 500]),
        price: rand(25, 45),
        pnl: Math.round(pnl),
        commission: -commission
      })
    }

    // Quarterly deposits
    if (d.getDate() === 15 && d.getMonth() % 3 === 0) {
      const dep = rand(20000, 50000)
      deposits.push({ date: dateStr, amount: dep })
      netDeposited += dep
      nlv += dep
    }

    // Monthly interest
    if (!monthlyInterest[monthKey]) {
      monthlyInterest[monthKey] = Math.round(rand(30, 150) * 100) / 100
    }

    d.setDate(d.getDate() + 1)
  }

  const totalInterest = Object.values(monthlyInterest).reduce((s, v) => s + v, 0)
  const totalPnL = Math.round((nlv - netDeposited) * 100) / 100

  return {
    summary: {
      netLiquidationValue: Math.round(nlv * 100) / 100,
      totalPnL,
      netDeposited: Math.round(netDeposited * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      twr: Math.round(cumTWR * 100) / 100
    },
    dailyTWR,
    trades,
    fifoDailyPnL,
    deposits,
    monthlyInterest,
    lastSyncAt: new Date().toISOString()
  }
}

async function main() {
  console.log(`[DEMO] Creating demo data for UID: ${DEMO_UID}`)

  // 1. Generate and write transactions
  const txns = generateTransactions()
  console.log(`[DEMO] Generated ${txns.length} transactions`)

  let written = 0
  for (let i = 0; i < txns.length; i += 400) {
    const batch = writeBatch(db)
    txns.slice(i, i + 400).forEach(t => {
      batch.set(doc(collection(db, 'transactions')), t)
    })
    await batch.commit()
    written += Math.min(400, txns.length - i)
    console.log(`  Written ${written}/${txns.length}`)
  }

  // 2. Generate and write investment data (per-user path)
  const investData = generateInvestmentData()
  await setDoc(doc(db, 'investment_data', DEMO_UID), investData)
  console.log(`[DEMO] Investment data written to investment_data/${DEMO_UID}`)
  console.log(`  NLV: $${investData.summary.netLiquidationValue.toLocaleString()}`)
  console.log(`  TWR: ${investData.summary.twr}%`)
  console.log(`  Trades: ${investData.trades.length}`)
  console.log(`  Deposits: ${investData.deposits.length}`)

  // 3. Write user settings
  await setDoc(doc(db, 'userSettings', DEMO_UID), {
    startingBalance: 50000,
    monthlyTarget: 3
  }, { merge: true })
  console.log(`[DEMO] User settings written`)

  console.log(`[DEMO] Complete! ✅`)
}

main().catch(e => { console.error('[DEMO] Error:', e.message); process.exit(1) })
