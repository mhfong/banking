import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useMask } from '../contexts/MaskContext'
import { useHotkeys } from '../hooks/useHotkeys'
import { useIBKRData } from '../contexts/IBKRDataContext'
import { useHotkeysConfig } from '../contexts/HotkeysContext'
import MaskToggle from '../components/MaskToggle'
import CountUp from '../components/CountUp'
import { db } from '../firebase'
import { collection, query, onSnapshot, getDocs, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore'
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, ReferenceLine } from 'recharts'
import '../styles/dashboard.css'

const COLORS = ['#539bf5','#57ab5a','#e5534b','#c69026','#986ee2','#6cb6ff','#e0823d','#96d0ff','#dcbdfb','#f69d50','#768390','#8ddb8c']

const CAT_ICONS = {
  Food: 'fa-utensils', Transport: 'fa-bus', Bills: 'fa-receipt', Gambling: 'fa-dice',
  Home: 'fa-home', Travel: 'fa-plane', 'Card Collecting': 'fa-clone', Income: 'fa-briefcase',
  Investment: 'fa-chart-line', Tax: 'fa-file-invoice-dollar', Other: 'fa-ellipsis-h',
}

const CAT_COLORS = {
  Food: '#e5534b', Transport: '#6cb6ff', Bills: '#c69026', Gambling: '#986ee2',
  Home: '#57ab5a', Travel: '#e0823d', 'Card Collecting': '#dcbdfb', Income: '#57ab5a',
  Investment: '#539bf5', Tax: '#f69d50', Other: '#768390',
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { masked, mask } = useMask()
  const { data: ibkrData, loading: ibkrLoading } = useIBKRData()
  const [transactions, setTransactions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [projectionGoals, setProjectionGoals] = useState([])
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [goalLabelInput, setGoalLabelInput] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [startingBalance, setStartingBalance] = useState(null)
  const [showBalancePopup, setShowBalancePopup] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [tradingTargetOverride, setTradingTargetOverride] = useState(null)
  const [projPeriod, setProjPeriod] = useState({ startMonth: '2025-01', futureMonths: 12 })
  const [editingGoalIdx, setEditingGoalIdx] = useState(null)
  const [editGoalLabel, setEditGoalLabel] = useState('')
  const [editGoalValue, setEditGoalValue] = useState('')

  // Load starting balance from user settings
  useEffect(() => {
    if (!user) return
    async function loadBalance() {
      const docRef = doc(db, 'userSettings', user.uid)
      const snap = await getDoc(docRef)
      if (snap.exists() && snap.data().startingBalance !== undefined) {
        setStartingBalance(snap.data().startingBalance)
        // Read monthlyTarget (%) from Settings page
        if (snap.data().monthlyTarget != null) {
          setTradingTargetOverride({ mode: 'pct', value: parseFloat(snap.data().monthlyTarget) })
        } else {
          // Legacy tradingTarget support
          const tt = snap.data().tradingTarget
          if (tt && typeof tt === 'object') {
            if (tt.mode === 'pct') setTradingTargetOverride({ mode: 'pct', value: tt.value })
            else if (tt.mode === 'amount') setTradingTargetOverride({ mode: 'amount', value: tt.value })
          } else if (typeof tt === 'number') {
            setTradingTargetOverride({ mode: 'amount', value: tt })
          }
        }
        if (snap.data().transactionsLastUpdated) {
          setLastUpdated(new Date(snap.data().transactionsLastUpdated))
        }
        if (snap.data().projectionGoals) {
          setProjectionGoals(snap.data().projectionGoals)
        }
        if (snap.data().projPeriod) {
          setProjPeriod(snap.data().projPeriod)
        }
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

  // Hotkeys for adding goals
  useHotkeys([
{
      key: '+',
      modifiers: ['ctrl'],
      callback: (e) => {
        setShowGoalForm(true)
        setEditingGoalIdx(null)
        setGoalInput('')
        setGoalLabelInput('')
      }
    },
    {
      key: 'Escape',
      callback: (e) => {
        if (showGoalForm) {
          setShowGoalForm(false)
          e.preventDefault()
        }
      }
    }
  ])

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
    const EXCLUDED_FROM_EXPENSE = ['Transfer', 'Investment']
    const EXCLUDED_FROM_INCOME = ['Transfer', 'Investment']
    const realExpenses = transactions.filter(t => t.type === 'expense' && !EXCLUDED_FROM_EXPENSE.includes(t.category) && !t.excludeFromChart)
    const incomes = transactions.filter(t => t.type === 'income' && !EXCLUDED_FROM_INCOME.includes(t.category) && !t.excludeFromChart)
    const totalExpense = realExpenses.reduce((s, t) => s + t.amount, 0)
    const totalIncome = incomes.reduce((s, t) => s + t.amount, 0)

    // Monthly breakdown (real expenses only)
    const monthly = {}
    transactions.forEach(t => {
      const m = t.date?.substring(0, 7)
      if (!m) return
      if (!monthly[m]) monthly[m] = { income: 0, expense: 0 }
      if (t.type === 'income' && !EXCLUDED_FROM_INCOME.includes(t.category) && !t.excludeFromChart) monthly[m].income += t.amount
      else if (t.type === 'expense' && !EXCLUDED_FROM_EXPENSE.includes(t.category) && !t.excludeFromChart) monthly[m].expense += t.amount
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

    // HSBC Bank balance = starting balance + salary income - all expenses
    // Account Balance = bank balance = starting + ALL income - ALL expense (real cash flows)
    const allIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const allExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const accountBalance = Math.round((STARTING_BALANCE + allIncome - allExpense) * 100) / 100
    // Net Balance = Account Balance + IBKR NLV
    // Investment deposit: Account Balance goes down, NLV goes up → Net Balance unchanged
    // Investment withdrawal: Account Balance goes up, NLV goes down → Net Balance unchanged
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
      currentMonthByCategory: (() => {
        const currentMonth = new Date().toISOString().substring(0, 7)
        const EXCLUDED = ['Transfer', 'Investment']
        const thisMonthExp = transactions.filter(t => t.type === 'expense' && t.date?.startsWith(currentMonth) && !EXCLUDED.includes(t.category) && !t.excludeFromChart)
        const byCat = {}
        thisMonthExp.forEach(t => { byCat[t.category || 'Other'] = (byCat[t.category || 'Other'] || 0) + t.amount })
        return byCat
      })(),
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
    const income = payload.find(p => p.name === 'Income')
    const expense = payload.find(p => p.name === 'Expense')
    const net = (income?.value || 0) - (expense?.value || 0)
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{label}</div>
        {income && <div className="chart-tooltip-row"><span className="chart-tooltip-dot" style={{ background: '#57ab5a' }} /><span>Income</span><span className="chart-tooltip-val" style={{ color: '#57ab5a' }}>${income.value.toLocaleString()}</span></div>}
        {expense && <div className="chart-tooltip-row"><span className="chart-tooltip-dot" style={{ background: '#e5534b' }} /><span>Expense</span><span className="chart-tooltip-val" style={{ color: '#e5534b' }}>${expense.value.toLocaleString()}</span></div>}
        <div className="chart-tooltip-divider" />
        <div className="chart-tooltip-row"><span /><span>Net</span><span className="chart-tooltip-val" style={{ color: net >= 0 ? '#57ab5a' : '#e5534b' }}>{net >= 0 ? '+' : '-'}${Math.abs(net).toLocaleString()}</span></div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1><i className="fas fa-tachometer-alt"></i> Dashboard</h1>
        <MaskToggle />
      </div>
      {lastUpdated && <div className="dash-last-updated">Last Updated: {lastUpdated.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</div>}

      {stats && (
        <>
          {/* Key Stats */}
          <div className="stats-grid">
            <div className="stat-card income" style={{ animationDelay: '0s' }}>
              <span className="stat-label">Net Balance</span>
              <span className={`stat-value ${stats.netWorth < 0 ? 'negative' : ''}`}>{masked ? '***' : <CountUp value={Math.round(stats.netWorth)} prefix={stats.netWorth < 0 ? '-$' : '$'} />}</span>
            </div>
            <div className="stat-card expense" style={{ animationDelay: '0.08s' }}>
              <span className="stat-label">Account Balance</span>
              <span className={`stat-value ${stats.accountBalance < 0 ? 'negative' : ''}`}>{masked ? '***' : <CountUp value={Math.round(Math.abs(stats.accountBalance))} prefix={stats.accountBalance < 0 ? '-$' : '$'} />}</span>
            </div>
            <div className="stat-card balance" style={{ animationDelay: '0.16s' }}>
              <span className="stat-label">Avg Monthly Expense</span>
              <span className="stat-value" style={{ color: 'var(--red)' }}>{masked ? '***' : <><span>-</span><CountUp value={Math.round(stats.avgExpense)} /></>}</span>
            </div>
            <div className="stat-card savings" style={{ animationDelay: '0.24s' }}>
              <span className="stat-label">Avg Monthly Saving</span>
              <span className="stat-value" style={{ color: stats.avgSaving >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {masked ? '***' : <CountUp value={Math.round(Math.abs(stats.avgSaving))} prefix={stats.avgSaving >= 0 ? '+$' : '-$'} />}
              </span>
            </div>
          </div>



          {/* Charts Row */}
          <div className="charts-grid">
          {/* Monthly Income vs Expense Chart */}
          <div className="chart-card chart-animated">
            <h3><i className="fas fa-chart-bar"></i> Monthly Income vs Expenses</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stats.monthlyData} margin={{ top: 10, right: 10, left: -30, bottom: 5 }}>
                <defs>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e5534b" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#e5534b" stopOpacity={0.4} />
                  </linearGradient>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#57ab5a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#57ab5a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#444c56" opacity={0.15} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#768390' }} axisLine={{ stroke: '#444c56' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#768390' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(83, 155, 245, 0.06)' }} />
                <Area type="monotone" dataKey="income" name="Income" fill="url(#incomeGrad)" stroke="none" />
                <Bar dataKey="expense" name="Expense" fill="url(#expenseGrad)" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(data) => setSelectedMonth(prev => prev === data.month ? null : data.month)} animationDuration={800} animationEasing="ease-out" />
                <Line type="monotone" dataKey="income" name="Income" stroke="#57ab5a" strokeWidth={2.5} dot={{ r: 3, fill: '#57ab5a', strokeWidth: 0 }} activeDot={{ r: 5, stroke: '#22272e', strokeWidth: 2 }} animationDuration={1000} />
                <ReferenceLine y={stats.avgExpense} stroke="#e5534b" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Avg', fill: '#e5534b', fontSize: 10, position: 'right' }} />
              </ComposedChart>
            </ResponsiveContainer>
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
                        <div className="breakdown-cat-bar" style={{ width: `${Math.max(5, Math.round(c.value / monthBreakdown.totalExpense * 100))}%`, background: CAT_COLORS[c.name] || '#768390' }} />
                      </div>
                      <span className="breakdown-cat-amount">{mask(fmt(c.value))}</span>
                    </div>
                  ))}
                </div>
                <button className="breakdown-details-btn" onClick={() => {
                  const fullMonth = '20' + selectedMonth
                  const [y, m] = fullMonth.split('-')
                  const from = `${y}-${m}-01`
                  const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
                  const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
                  navigate(`/transactions?from=${from}&to=${to}`)
                }}>
                  <i className="fas fa-external-link-alt"></i> View Details
                </button>
              </div>
            )}
          </div>
          </div>

          {/* Net Balance Projection */}
          <div className="chart-card chart-animated proj-fintech-card" style={{ animationDelay: '0.2s' }}>
            <div className="proj-fintech-header">
              <h3><i className="fas fa-rocket"></i> Net Balance Projection</h3>
            </div>
            {(() => {
              const nlvHKD = ibkrData.summary?.netLiquidationValue || 0
              const currentNet = stats.netWorth
              const avgSaving = stats.avgSaving
              const autoTarget = Math.round(nlvHKD * 0.015)
              const monthlyTarget = tradingTargetOverride !== null
                ? (tradingTargetOverride.mode === 'pct' ? Math.round(nlvHKD * tradingTargetOverride.value / 100) : tradingTargetOverride.value)
                : autoTarget

              const calcInterest = (balHKD) => {
                const usd = balHKD / 7.8
                return usd > 10000 ? (usd - 10000) * 0.0483 / 12 * 7.8 : 0
              }

              // Build unified dataset: history (from Start month) + current month + future
              const allData = []
              const now = new Date()
              const currentYM = now.toISOString().substring(0, 7) // e.g. '2026-04'
              
              // Compute historical Net Balance by working backwards from currentNet
              // currentNet is the real current Net Balance
              // For each past month, subtract that month's net (income - expense) from monthlyData
              // So: pastMonth NB = currentNet - sum of all nets from that month+1 to current month
              if (stats.monthlyData && stats.monthlyData.length > 0) {
                // monthlyData has month like '25-01', convert to '2025-01' for comparison
                const fullMonthlyData = stats.monthlyData.map(m => ({
                  ...m,
                  fullMonth: '20' + m.month // '25-01' -> '2025-01'
                }))
                
                // Filter months from startMonth up to (but not including) current month
                const startYM = projPeriod.startMonth || '2025-01'
                const histMonths = fullMonthlyData.filter(m => m.fullMonth >= startYM && m.fullMonth < currentYM)
                
                // Sum nets from each month after a given month up to current month (exclusive)
                // We need cumulative net from month i+1 to the current month's monthlyData entry
                // Current month's monthlyData net is partial, so we include it too
                const currentMonthData = fullMonthlyData.find(m => m.fullMonth === currentYM)
                const currentMonthNet = currentMonthData ? currentMonthData.net : 0
                
                // Build suffix sums: for each history month, NB = currentNet - sum of nets after that month
                // Months after histMonth up to and including currentMonth
                const allRelevantMonths = fullMonthlyData.filter(m => m.fullMonth >= startYM && m.fullMonth <= currentYM)
                
                for (let i = 0; i < histMonths.length; i++) {
                  // Sum all nets from month i+1 onwards (including current month partial)
                  const sumAfter = allRelevantMonths
                    .filter(m => m.fullMonth > histMonths[i].fullMonth)
                    .reduce((sum, m) => sum + m.net, 0)
                  const pastNB = currentNet - sumAfter
                  
                  // Format as 'Jan 25', 'Feb 26' etc.
                  const [hy, hm] = histMonths[i].fullMonth.split('-')
                  const histLabel = new Date(parseInt(hy), parseInt(hm) - 1).toLocaleDateString('en-US', { month: 'short' }) + ' ' + hy.slice(2)
                  
                  allData.push({
                    month: histLabel,
                    actual: Math.round(pastNB),
                    saving: null,
                    trading: null,
                    isHistory: true
                  })
                }
              }
              
              // Add current month as "Now" with actual currentNet
              const currentLabel = now.toLocaleDateString('en-US', { month: 'short' }) + ' ' + now.getFullYear().toString().slice(2)
              allData.push({
                month: currentLabel,
                actual: Math.round(currentNet),
                saving: Math.round(currentNet),
                trading: Math.round(currentNet),
                isHistory: false,
                isNow: true
              })
              
              // Add future projections
              let balSave = currentNet
              let balTrade = currentNet
              
              for (let i = 1; i <= projPeriod.futureMonths; i++) {
                balSave += avgSaving + calcInterest(balSave)
                balTrade += avgSaving + monthlyTarget + calcInterest(balTrade)
                
                const d = new Date(now)
                d.setMonth(d.getMonth() + i)
                const label = d.toLocaleDateString('en-US', { month: 'short' }) + ' ' + d.getFullYear().toString().slice(2)
                
                allData.push({
                  month: label,
                  actual: null,
                  saving: Math.round(balSave),
                  trading: Math.round(balTrade),
                  isHistory: false,
                  isNow: false
                })
              }
              
              const months = allData
              
              // Generate available start months for the dropdown
              const availableStartMonths = stats.monthlyData
                ? stats.monthlyData.map(m => {
                    const full = '20' + m.month
                    const [y, mo] = full.split('-')
                    const lbl = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'short' }) + ' ' + y.slice(2)
                    return { value: full, label: lbl }
                  }).filter(m => m.value < currentYM)
                : []

              // Find the last projected month (not today marker)
              const futureMonths = months.filter(m => !m.isHistory && !m.isNow)
              const savingFinal = futureMonths.length > 0 ? futureMonths[futureMonths.length - 1].saving : currentNet
              const tradingFinal = futureMonths.length > 0 ? futureMonths[futureMonths.length - 1].trading : currentNet
              const pctIncrease = currentNet > 0 ? ((tradingFinal - currentNet) / currentNet * 100).toFixed(1) : 0

              const savingPct = currentNet > 0 ? ((savingFinal - currentNet) / currentNet * 100).toFixed(1) : 0

              const GOAL_COLORS = ['#c69026', '#986ee2', '#e0823d', '#6cb6ff', '#dcbdfb']

              // Motivational message
              const sortedGoals = [...projectionGoals].sort((a, b) => a.value - b.value)
              const nearestGoal = sortedGoals.find(g => g.value > currentNet)
              const nearestPct = nearestGoal ? Math.round(currentNet / nearestGoal.value * 100) : null
              let motivationMsg = ''
              let motivationIcon = ''
              if (nearestPct !== null) {
                if (nearestPct >= 90) { motivationMsg = `Almost there! ${nearestGoal.label} is within reach`; motivationIcon = '' }
                else if (nearestPct >= 75) { motivationMsg = ''; motivationIcon = '' }
                else if (nearestPct >= 50) { motivationMsg = `Halfway to ${nearestGoal.label}!`; motivationIcon = '' }
                else { motivationMsg = `Building towards ${nearestGoal.label}`; motivationIcon = '' }
              }
              const monthlyGrowth = avgSaving + monthlyTarget + calcInterest(currentNet)

              // Pre-compute goal milestone info for each month
              const goalMilestones = projectionGoals.map((g, i) => {
                const gRemaining = g.value - currentNet
                const gMonths = monthlyGrowth > 0 ? Math.ceil(Math.max(0, gRemaining) / monthlyGrowth) : null
                const gReached = currentNet >= g.value
                return { ...g, index: i, months: gMonths, reached: gReached, color: GOAL_COLORS[i % GOAL_COLORS.length] }
              })

              // Add milestone dot data to months array
              // Find the index of the "Now" entry
              const nowIdx = months.findIndex(m => m.isNow)
              const monthsWithGoals = months.map((m, idx) => {
                const entry = { ...m }
                goalMilestones.forEach((gm) => {
                  // gm.months is months from now to reach goal
                  // The crossing point in the array is nowIdx + gm.months
                  const crossIdx = nowIdx + gm.months
                  if (!gm.reached && gm.months !== null && crossIdx === idx && crossIdx < months.length) {
                    entry[`goal_${gm.index}`] = gm.value
                    entry[`goalLabel_${gm.index}`] = gm.label
                    entry[`goalColor_${gm.index}`] = gm.color
                    entry[`goalMonths_${gm.index}`] = gm.months
                  }
                })
                return entry
              })

              // Enhanced tooltip with goal info and historical support
              const ProjectionTooltip = ({active, payload, label}) => {
                if (!active || !payload?.length) return null
                const data = payload[0]?.payload
                const goalsHere = goalMilestones.filter(gm => !gm.reached && gm.months !== null && data[`goal_${gm.index}`])
                
                return (
                  <div className="chart-tooltip">
                    <div className="chart-tooltip-label">{label}</div>
                    {data?.isHistory && data?.actual != null && (
                      <div className="chart-tooltip-row"><span className="chart-tooltip-dot" style={{ background: '#539bf5' }} /><span>Actual</span><span className="chart-tooltip-val" style={{ color: '#539bf5' }}>${Math.round(data.actual).toLocaleString()}</span></div>
                    )}
                    {data?.isNow && data?.actual != null && (
                      <div className="chart-tooltip-row"><span className="chart-tooltip-dot" style={{ background: '#539bf5' }} /><span>Today</span><span className="chart-tooltip-val" style={{ color: '#539bf5' }}>${Math.round(data.actual).toLocaleString()}</span></div>
                    )}
                    {!data?.isHistory && data?.saving != null && <div className="chart-tooltip-row"><span className="chart-tooltip-dot" style={{ background: '#539bf5' }} /><span>Saving</span><span className="chart-tooltip-val" style={{ color: '#539bf5' }}>${Math.round(data.saving).toLocaleString()}</span></div>}
                    {!data?.isHistory && data?.trading != null && <div className="chart-tooltip-row"><span className="chart-tooltip-dot" style={{ background: '#57ab5a' }} /><span>+ Trading</span><span className="chart-tooltip-val" style={{ color: '#57ab5a' }}>${Math.round(data.trading).toLocaleString()}</span></div>}
                    {goalsHere.length > 0 && <div className="chart-tooltip-divider" />}
                    {goalsHere.map(gm => (
                      <div key={gm.index} className="chart-tooltip-row">
                        <span className="chart-tooltip-dot" style={{ background: gm.color }} />
                        <span style={{ color: gm.color, fontWeight: 600 }}>Goal {gm.index + 1}: {gm.label}</span>
                        <span className="chart-tooltip-val" style={{ color: gm.color }}>{gm.months}mo - ${gm.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )
              }

              // Build partial goal line data: only draw from start to crossing point
              const goalLineData = goalMilestones.map(gm => {
                if (gm.reached) return null
                if (gm.months === null || gm.months > 12) {
                  // Goal not reachable in 12 months — draw full line
                  return months.map(m => ({ month: m.month, value: gm.value }))
                }
                // Only draw up to and including the crossing month
                return months.slice(0, gm.months + 1).map(m => ({ month: m.month, value: gm.value }))
              })

              return (
                <>
                  <div className="proj-hero-section">
                    <div className="proj-hero">
                      <div className="proj-hero-pct">{mask('$' + tradingFinal.toLocaleString())} <span className="proj-hero-pct-num">(+{pctIncrease}%)</span></div>
                      <div className="proj-hero-label">Max Potential Growth</div>
                    </div>
                    <div className="proj-hero-sub">
                      <div className="proj-hero-sub-val">{mask('$' + savingFinal.toLocaleString())} <span className="proj-hero-sub-pct">(+{savingPct}%)</span></div>
                      <div className="proj-hero-sub-label">Saving Only</div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={monthsWithGoals} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="projHistGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#539bf5" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#539bf5" stopOpacity={0.08} />
                        </linearGradient>
                        <linearGradient id="projSaveGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#539bf5" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#539bf5" stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="projTradeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#57ab5a" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#57ab5a" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444c56" opacity={0.15} vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#768390' }} axisLine={{ stroke: '#444c56' }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#768390' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} domain={['dataMin - 50000', 'dataMax + 100000']} />
                      <Tooltip content={<ProjectionTooltip />} />
                      {/* Historical data area - solid line */}
                      <Area type="monotone" dataKey="actual" name="Actual" fill="url(#projHistGrad)" stroke="#539bf5" strokeWidth={2.5} dot={false} isAnimationActive={true} animationDuration={1200} />
                      {/* Future saving area - dashed line for prediction */}
                      <Area type="monotone" dataKey="saving" name="Saving" fill="url(#projSaveGrad)" stroke="#539bf5" strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={true} animationDuration={1200} />
                      {/* Future trading area */}
                      <Area type="monotone" dataKey="trading" name="+ Trading" fill="url(#projTradeGrad)" stroke="#57ab5a" strokeWidth={2.5} strokeDasharray="6 3" dot={(props) => {
                        const { payload, cx, cy } = props
                        if (!payload || !cx || !cy) return null
                        const dots = []
                        goalMilestones.forEach(gm => {
                          if (payload[`goal_${gm.index}`]) {
                            dots.push(
                              <g key={`ms-${gm.index}`}>
                                <circle cx={cx} cy={cy} r={10} fill={gm.color} fillOpacity={0.15} stroke={gm.color} strokeWidth={1.5} />
                                <circle cx={cx} cy={cy} r={5} fill={gm.color} stroke="#22272e" strokeWidth={1.5} />
                              </g>
                            )
                          }
                        })
                        return dots.length > 0 ? <>{dots}</> : null
                      }} activeDot={{ r: 4, stroke: '#22272e', strokeWidth: 2 }} animationDuration={1500} />
                      {monthsWithGoals.length > 0 && monthsWithGoals.some(m => m.isNow) && (
                        <ReferenceLine 
                          x={monthsWithGoals.find(m => m.isNow)?.month}
                          stroke="#768390" 
                          strokeDasharray="3 3" 
                          strokeWidth={1.5}
                          label={{ value: 'Now', fill: '#768390', fontSize: 10, position: 'insideTopLeft', offset: 5 }}
                        />
                      )}
                      {goalMilestones.map((gm, i) => {
                        if (gm.reached) return null
                        return (
                          <ReferenceLine key={`goal-${i}`} y={gm.value} stroke={gm.color} strokeDasharray="8 4" strokeWidth={1.5}
                            label={({ viewBox }) => {
                              const labelText = `Goal ${i + 1}`
                              const textW = labelText.length * 6.5 + 12
                              return (
                                <g>
                                  <rect x={viewBox.x + 4} y={viewBox.y - 18} width={textW} height={16} rx={3} fill={gm.color} />
                                  <text x={viewBox.x + 4 + textW / 2} y={viewBox.y - 7} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600}>{labelText}</text>
                                </g>
                              )
                            }}
                          />
                        )
                      })}
                    </AreaChart>
                  </ResponsiveContainer>

                  {/* Period Controls - below graph */}
                  <div className="proj-period-bar">
                    <div className="proj-period-group">
                      <label>Start</label>
                      <select value={projPeriod.startMonth} onChange={async (e) => {
                        const newP = { ...projPeriod, startMonth: e.target.value }
                        setProjPeriod(newP)
                        await setDoc(doc(db, 'userSettings', user.uid), { projPeriod: newP }, { merge: true })
                      }} className="proj-period-select">
                        {availableStartMonths.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <span className="proj-period-arrow"><i className="fas fa-long-arrow-alt-right"></i></span>
                    <div className="proj-period-group">
                      <label>Forecast</label>
                      <select value={projPeriod.futureMonths} onChange={async (e) => {
                        const newP = { ...projPeriod, futureMonths: parseInt(e.target.value) }
                        setProjPeriod(newP)
                        await setDoc(doc(db, 'userSettings', user.uid), { projPeriod: newP }, { merge: true })
                      }} className="proj-period-select">
                        <option value={3}>3 mo</option>
                        <option value={6}>6 mo</option>
                        <option value={12}>12 mo</option>
                        <option value={24}>24 mo</option>
                      </select>
                    </div>
                  </div>

                  {/* Goals */}
                  <div className="proj-goals">
                    <div className="proj-goals-header">
                      <span className="proj-goals-title"><i className="fas fa-flag"></i> Goals</span>
                      <button className="proj-goals-add" onClick={() => setShowGoalForm(!showGoalForm)}><i className={`fas ${showGoalForm ? 'fa-times' : 'fa-plus'}`}></i></button>
                    </div>
                    {showGoalForm && (
                      <div className="proj-goal-form">
                        <input type="text" placeholder='Label (e.g. "100K USD")' value={goalLabelInput} onChange={e => setGoalLabelInput(e.target.value)} className="proj-goal-input" />
                        <input type="number" placeholder="Amount (HKD)" value={goalInput} onChange={e => setGoalInput(e.target.value)} className="proj-goal-input" />
                        <button className="proj-goal-save" onClick={async () => {
                          if (!goalInput || !goalLabelInput) return
                          const newGoals = [...projectionGoals, { label: goalLabelInput, value: parseFloat(goalInput) }]
                          setProjectionGoals(newGoals)
                          await setDoc(doc(db, 'userSettings', user.uid), { projectionGoals: newGoals }, { merge: true })
                          setGoalInput(''); setGoalLabelInput(''); setShowGoalForm(false)
                        }}>Add</button>
                      </div>
                    )}
                    {projectionGoals.length > 0 && (
                      <div className="proj-goals-list">
                        {projectionGoals.map((g, i) => {
                          const pct = Math.min(Math.round(currentNet / g.value * 100), 100)
                          const remaining = g.value - currentNet
                          const monthsToGoal = monthlyGrowth > 0 ? Math.ceil(Math.max(0, remaining) / monthlyGrowth) : null
                          const isReached = currentNet >= g.value
                          const isEditing = editingGoalIdx === i
                          return (
                            <div key={i} className={`proj-goal-card ${isReached ? 'reached' : ''}`} onClick={() => {
                              if (!isEditing) {
                                setEditingGoalIdx(i)
                                setEditGoalLabel(g.label)
                                setEditGoalValue(String(g.value))
                              }
                            }} style={{ cursor: isEditing ? 'default' : 'pointer' }}>
                              {isEditing ? (
                                <div className="proj-goal-edit-form" onClick={e => e.stopPropagation()}>
                                  <input type="text" value={editGoalLabel} onChange={e => setEditGoalLabel(e.target.value)} className="proj-goal-input" placeholder="Label" autoFocus />
                                  <input type="number" value={editGoalValue} onChange={e => setEditGoalValue(e.target.value)} className="proj-goal-input" placeholder="Amount (HKD)" />
                                  <div className="proj-goal-edit-actions">
                                    <button className="proj-goal-save" onClick={async () => {
                                      if (!editGoalLabel || !editGoalValue) return
                                      const newGoals = [...projectionGoals]
                                      newGoals[i] = { label: editGoalLabel, value: parseFloat(editGoalValue) }
                                      setProjectionGoals(newGoals)
                                      await setDoc(doc(db, 'userSettings', user.uid), { projectionGoals: newGoals }, { merge: true })
                                      setEditingGoalIdx(null)
                                    }}>Save</button>
                                    <button className="proj-goal-cancel" onClick={() => setEditingGoalIdx(null)}>Cancel</button>
                                    <button className="proj-goal-delete" onClick={async () => {
                                      const newGoals = projectionGoals.filter((_, j) => j !== i)
                                      setProjectionGoals(newGoals)
                                      await setDoc(doc(db, 'userSettings', user.uid), { projectionGoals: newGoals }, { merge: true })
                                      setEditingGoalIdx(null)
                                    }}><i className="fas fa-trash"></i></button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="proj-goal-card-top">
                                    <span className="proj-goal-label">{g.label}</span>
                                    <span className="proj-goal-val">{mask('$' + g.value.toLocaleString())}</span>
                                  </div>
                                  <div className="proj-goal-progress-track">
                                    <div className="proj-goal-progress-fill" style={{ width: `${pct}%`, background: isReached ? 'linear-gradient(90deg, #57ab5a, #8ddb8c)' : `linear-gradient(90deg, ${GOAL_COLORS[i % GOAL_COLORS.length]}, ${GOAL_COLORS[i % GOAL_COLORS.length]}88)` }} />
                                  </div>
                                  <div className="proj-goal-card-bottom">
                                    <span className="proj-goal-pct" style={{ color: isReached ? '#57ab5a' : GOAL_COLORS[i % GOAL_COLORS.length] }}>{isReached ? 'Reached!' : `${pct}%`}</span>
                                    {!isReached && monthsToGoal !== null && <span className="proj-goal-eta">~{monthsToGoal > 12 ? `${Math.floor(monthsToGoal/12)}y ${monthsToGoal%12}m` : `${monthsToGoal}m`} to go</span>}
                                    {!isReached && <span className="proj-goal-remaining">{mask('$' + Math.round(remaining).toLocaleString())} left</span>}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>


            {/* Expense by Category */}
            <div className="chart-card">
              <h3><i className="fas fa-chart-pie"></i> Expenses by Category</h3>
              <div className="cat-total-row">
                <span className="cat-total-label">Monthly Average</span>
                <span className="cat-total-value">{mask('$' + Math.round(stats.totalExpense / Math.max(stats.numMonths, 1)).toLocaleString())}</span>
              </div>
              <div className="cat-bars">
                {stats.categoryData.map((entry) => {
                  const monthlyAvg = Math.round(entry.value / Math.max(stats.numMonths, 1))
                  const currentMonth = Math.round(stats.currentMonthByCategory[entry.name] || 0)
                  const spendPct = monthlyAvg > 0 ? Math.round((currentMonth / monthlyAvg) * 100) : 0
                  const isWarning = spendPct >= 90
                  const isOver = spendPct > 100
                  const color = CAT_COLORS[entry.name] || '#768390'
                  const icon = CAT_ICONS[entry.name] || 'fa-star'
                  const barPct = Math.min(spendPct, 100)
                  return (
                    <div key={entry.name} className={`cat-bar-row ${isWarning ? 'cat-warning' : ''} ${isOver ? 'cat-over' : ''}`}>
                      <div className="cat-bar-icon" style={{ background: color + '20', color }}>
                        <i className={`fas ${icon}`}></i>
                      </div>
                      <div className="cat-bar-info">
                        <div className="cat-bar-header">
                          <span className="cat-bar-name">{entry.name}</span>
                          <span className="cat-bar-amounts">
                            <span className={`cat-bar-current ${isWarning ? 'warning' : ''}`}>{mask('$' + currentMonth.toLocaleString())}</span>
                            <span className="cat-bar-divider">/</span>
                            <span className="cat-bar-avg">{mask('$' + monthlyAvg.toLocaleString())}</span>
                          </span>
                        </div>
                        <div className="cat-bar-track">
                          <div className="cat-bar-fill" style={{ '--bar-width': `${Math.max(barPct, 2)}%`, background: isOver ? 'var(--red, #e5534b)' : isWarning ? '#f0883e' : color }} />
                          {monthlyAvg > 0 && <div className="cat-bar-avg-marker" />}
                        </div>
                        <div className="cat-bar-footer">
                          <span className={`cat-bar-pct ${isWarning ? 'warning' : ''}`}>{spendPct}% of avg</span>
                          {isWarning && !isOver && <span className="cat-bar-warn-badge"><i className="fas fa-exclamation-triangle"></i> Near limit</span>}
                          {isOver && <span className="cat-bar-over-badge"><i className="fas fa-exclamation-circle"></i> Over budget</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
        </>
      )
}

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
