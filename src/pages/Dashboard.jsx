import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMask } from '../contexts/MaskContext'
import MaskToggle from '../components/MaskToggle'
import { db } from '../firebase'
import { collection, query, onSnapshot, getDocs, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, ReferenceLine } from 'recharts'
import '../styles/dashboard.css'
import ibkrData from '../data/ibkr_parsed.json'

const COLORS = ['#539bf5','#e5534b','#57ab5a','#c69026','#6cb6ff','#986ee2','#e0823d','#768390','#57ab5a','#e5534b','#539bf5','#c69026','#6cb6ff','#986ee2','#e0823d','#768390','#57ab5a','#e5534b']

export default function Dashboard() {
  const { user } = useAuth()
  const { mask } = useMask()
  const [transactions, setTransactions] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [startingBalance, setStartingBalance] = useState(null)
  const [showBalancePopup, setShowBalancePopup] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')

  // Load starting balance from user settings
  useEffect(() => {
    if (!user) return
    async function loadBalance() {
      const docRef = doc(db, 'userSettings', user.uid)
      const snap = await getDoc(docRef)
      if (snap.exists() && snap.data().startingBalance !== undefined) {
        setStartingBalance(snap.data().startingBalance)
      } else {
        setShowBalancePopup(true)
      }
    }
    loadBalance()
  }, [user])

  // One-time: migrate 'global' transactions to current user
  useEffect(() => {
    if (!user) return
    async function migrate() {
      const snap = await getDocs(collection(db, 'transactions'))
      const globalDocs = snap.docs.filter(d => d.data().userId === 'global')
      if (globalDocs.length === 0) return
      // Only migrate if this user has no own transactions yet
      const ownDocs = snap.docs.filter(d => d.data().userId === user.uid)
      if (ownDocs.length > 0) return
      console.log(`Migrating ${globalDocs.length} global transactions to ${user.uid}`)
      for (let i = 0; i < globalDocs.length; i += 400) {
        const batch = writeBatch(db)
        globalDocs.slice(i, i + 400).forEach(d => batch.update(doc(db, 'transactions', d.id), { userId: user.uid }))
        await batch.commit()
      }
    }
    migrate()
  }, [user])

  useEffect(() => {
    const q = query(collection(db, 'transactions'))
    const unsub = onSnapshot(q, (snap) => {
      const txns = snap.docs.map(d => {
        const data = d.data()
        let date = data.date
        if (date?.toDate) date = date.toDate().toISOString().substring(0, 10)
        else if (typeof date !== 'string') date = ''
        return { id: d.id, ...data, date }
      }).filter(t => t.userId === user.uid || t.userId === 'global')
      setTransactions(txns)
      setLoading(false)
    })
    return unsub
  }, [user])

  const stats = useMemo(() => {
    if (!transactions.length) return {
      totalExpense: 0, totalIncome: 0, totalNet: 0,
      avgExpense: 0, avgIncome: 0, avgSaving: 0, savingsRate: 0,
      monthlyData: [], categoryData: [], paymentData: [],
      thisMonthTotal: 0, numMonths: 0, monthlyRegular: 0,
      biggestExpense: null, totalTransactions: 0,
      investmentTotal: 0, accountBalance: startingBalance || 0, netWorth: (startingBalance || 0) + (ibkrData.summary?.netLiquidationValue || 0), balanceTrend: [],
    }

    const STARTING_BALANCE = startingBalance || 0
    const EXCLUDED_FROM_EXPENSE = ['Transfer', 'Investment', 'ATM']
    const realExpenses = transactions.filter(t => t.type === 'expense' && !EXCLUDED_FROM_EXPENSE.includes(t.category))
    const incomes = transactions.filter(t => t.type === 'income' && !EXCLUDED_FROM_EXPENSE.includes(t.category))
    const totalExpense = realExpenses.reduce((s, t) => s + t.amount, 0)
    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0)

    // Monthly breakdown (real expenses only)
    const monthly = {}
    transactions.forEach(t => {
      const m = t.date?.substring(0, 7)
      if (!m) return
      if (!monthly[m]) monthly[m] = { income: 0, expense: 0 }
      if (t.type === 'income' && !EXCLUDED_FROM_EXPENSE.includes(t.category)) monthly[m].income += t.amount
      else if (t.type === 'expense' && !EXCLUDED_FROM_EXPENSE.includes(t.category)) monthly[m].expense += t.amount
    })

    const monthlyData = Object.entries(monthly)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, d]) => ({
        month: month.substring(2), // 25-01
        income: Math.round(d.income),
        expense: Math.round(d.expense),
        net: Math.round(d.income - d.expense),
      }))

    // Exclude months with only partial data (first and current month)
    const fullMonths = monthlyData.filter(m => m.income > 0 || m.expense > 5000)
    const numMonths = Math.max(1, fullMonths.length)
    const avgExpense = Math.round(fullMonths.reduce((s, m) => s + m.expense, 0) / numMonths)
    const avgIncome = Math.round(fullMonths.reduce((s, m) => s + m.income, 0) / numMonths)
    const avgSaving = avgIncome - avgExpense

    // Category breakdown (real expenses only, exclude transfers/investments/ATM)
    const byCategory = {}
    realExpenses.forEach(t => {
      const c = t.category || 'Other'
      byCategory[c] = (byCategory[c] || 0) + t.amount
    })
    const categoryData = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: Math.round(value) }))

    // Payment method breakdown
    const byPayment = {}
    realExpenses.forEach(t => {
      const p = t.paymentMethod || 'Unknown'
      byPayment[p] = (byPayment[p] || 0) + t.amount
    })
    const paymentData = Object.entries(byPayment)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: Math.round(value) }))

    // Top spending categories this month
    const currentMonth = new Date().toISOString().substring(0, 7)
    const thisMonthExpenses = realExpenses.filter(t => t.date?.startsWith(currentMonth))
    const thisMonthTotal = thisMonthExpenses.reduce((s, t) => s + t.amount, 0)

    // Savings rate
    const savingsRate = totalIncome > 0 ? Math.round((totalIncome - totalExpense) / totalIncome * 100) : 0

    // Biggest expense
    const biggestExpense = realExpenses.sort((a, b) => b.amount - a.amount)[0]

    // Investment total
    const investmentTotal = transactions.filter(t => t.category === 'Investment').reduce((s, t) => s + t.amount, 0)

    // HSBC Bank balance = starting balance + all flows (including transfers, investments, etc)
    const allIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const allExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const accountBalance = Math.round((STARTING_BALANCE + allIncome - allExpense) * 100) / 100
    // Net worth = account balance + IBKR NLV (from ibkr_parsed.json)
    const ibkrNLV = ibkrData.summary?.netLiquidationValue || 0
    const netWorth = Math.round((accountBalance + ibkrNLV) * 100) / 100

    // Monthly balance trend
    let runBal = STARTING_BALANCE
    const balanceTrend = monthlyData.map(m => {
      runBal = runBal + m.income - m.expense
      return { ...m, balance: Math.round(runBal) }
    })

    // Regular expenses (bills)
    const regularExpenses = realExpenses.filter(t => t.category === 'Bills' || t.category === 'Subscriptions' || t.category === 'Home')
    const monthlyRegular = Math.round(regularExpenses.reduce((s, t) => s + t.amount, 0) / numMonths)

    return {
      totalExpense, totalIncome, totalNet: totalIncome - totalExpense,
      avgExpense, avgIncome, avgSaving, savingsRate,
      monthlyData, categoryData, paymentData,
      thisMonthTotal, numMonths, monthlyRegular,
      biggestExpense,
      totalTransactions: transactions.length,
      investmentTotal, accountBalance, netWorth, balanceTrend,
    }
  }, [transactions, startingBalance])

  const monthBreakdown = useMemo(() => {
    if (!selectedMonth || !transactions.length) return null
    const EXCLUDED = ['Transfer', 'Investment', 'ATM']
    const fullMonth = '20' + selectedMonth // 25-01 -> 2025-01
    const monthTxns = transactions.filter(t => t.date?.startsWith(fullMonth) && !EXCLUDED.includes(t.category))
    const expenses = monthTxns.filter(t => t.type === 'expense')
    const incomes = monthTxns.filter(t => t.type === 'income')
    const byCat = {}
    expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount })
    const catList = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value: Math.round(value) }))
    return {
      month: fullMonth,
      totalExpense: Math.round(expenses.reduce((s, t) => s + t.amount, 0)),
      totalIncome: Math.round(incomes.reduce((s, t) => s + t.amount, 0)),
      categories: catList,
      topTransactions: expenses.sort((a, b) => b.amount - a.amount).slice(0, 10),
    }
  }, [selectedMonth, transactions])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const fmt = (v) => '$' + Math.abs(Math.round(v)).toLocaleString()

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>{p.name}: ${Math.abs(p.value).toLocaleString()}</div>
        ))}
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Welcome back, {user?.displayName || 'User'}</h1>
        <MaskToggle />
      </div>

      {stats && (
        <>
          {/* Key Stats */}
          <div className="stats-grid">
            <div className="stat-card income">
              <span className="stat-label">Net Balance</span>
              <span className="stat-value">{mask(fmt(stats.netWorth))}</span>
            </div>
            <div className="stat-card expense">
              <span className="stat-label">Account Balance</span>
              <span className="stat-value">{mask(fmt(stats.accountBalance))}</span>
            </div>
            <div className="stat-card balance">
              <span className="stat-label">Avg Monthly Expense</span>
              <span className="stat-value" style={{ color: 'var(--red)' }}>{mask('-' + fmt(stats.avgExpense))}</span>
            </div>
            <div className="stat-card savings">
              <span className="stat-label">Avg Monthly Saving</span>
              <span className="stat-value" style={{ color: stats.avgSaving >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {mask((stats.avgSaving >= 0 ? '+' : '-') + fmt(stats.avgSaving))}
              </span>
            </div>
          </div>



          {/* Monthly Income vs Expense Chart */}
          <div className="chart-card">
            <h3>Monthly Income vs Expenses</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stats.monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444c56" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#768390' }} />
                <YAxis tick={{ fontSize: 11, fill: '#768390' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="expense" name="Expense" fill="#e5534b" radius={[4, 4, 0, 0]} opacity={0.8} cursor="pointer" onClick={(data) => setSelectedMonth(data.month)} />
                <Line type="monotone" dataKey="income" name="Income" stroke="#57ab5a" strokeWidth={2.5} dot={{ r: 3 }} />
                <ReferenceLine y={stats.avgExpense} stroke="#e5534b" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'Avg', fill: '#e5534b', fontSize: 10 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Month Breakdown */}
          {monthBreakdown && (
            <div className="month-breakdown">
              <div className="breakdown-header">
                <h3><i className="fas fa-calendar-alt"></i> {monthBreakdown.month} Breakdown</h3>
                <button className="breakdown-close" onClick={() => setSelectedMonth(null)}><i className="fas fa-times"></i></button>
              </div>
              <div className="breakdown-summary">
                <div className="breakdown-stat"><span className="breakdown-label">Income</span><span className="breakdown-value positive">{mask(fmt(monthBreakdown.totalIncome))}</span></div>
                <div className="breakdown-stat"><span className="breakdown-label">Expenses</span><span className="breakdown-value negative">{mask(fmt(monthBreakdown.totalExpense))}</span></div>
                <div className="breakdown-stat"><span className="breakdown-label">Net</span><span className="breakdown-value" style={{ color: monthBreakdown.totalIncome - monthBreakdown.totalExpense >= 0 ? 'var(--green)' : 'var(--red)' }}>{mask((monthBreakdown.totalIncome - monthBreakdown.totalExpense >= 0 ? '+' : '-') + fmt(monthBreakdown.totalIncome - monthBreakdown.totalExpense))}</span></div>
              </div>
              <div className="breakdown-cats">
                {monthBreakdown.categories.map((c, i) => (
                  <div key={c.name} className="breakdown-cat-row">
                    <div className="breakdown-cat-bar-wrap">
                      <span className="breakdown-cat-name">{c.name}</span>
                      <div className="breakdown-cat-bar" style={{ width: `${Math.max(5, Math.round(c.value / monthBreakdown.totalExpense * 100))}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="breakdown-cat-amount">{mask(fmt(c.value))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="charts-grid">
            {/* Expense by Category */}
            <div className="chart-card">
              <h3>Expenses by Category</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={stats.categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} dataKey="value"
                    label={({ name, percent }) => percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}>
                    {stats.categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => ['$' + v.toLocaleString(), 'Amount']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Starting Balance Popup */}
      {showBalancePopup && (
        <div className="popup-overlay">
          <div className="popup-card">
            <h3><i className="fas fa-wallet"></i> Welcome! Set Your Starting Balance</h3>
            <p>Enter your current account balance to start tracking.</p>
            <div className="popup-input-group">
              <label>Starting Balance (HKD)</label>
              <input
                type="number"
                value={balanceInput}
                onChange={e => setBalanceInput(e.target.value)}
                placeholder="e.g. 50000"
                autoFocus
              />
            </div>
            <div className="popup-buttons">
              <button className="btn-primary" onClick={async () => {
                const val = parseFloat(balanceInput) || 0
                await setDoc(doc(db, 'userSettings', user.uid), { startingBalance: val }, { merge: true })
                setStartingBalance(val)
                setShowBalancePopup(false)
              }}>
                Save
              </button>
              <button className="btn-secondary" onClick={() => {
                setStartingBalance(0)
                setShowBalancePopup(false)
              }}>
                Skip (Start from $0)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
