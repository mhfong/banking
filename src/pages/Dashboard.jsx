import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMask } from '../contexts/MaskContext'
import { db } from '../firebase'
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import '../styles/dashboard.css'

const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899']

const CATEGORIES = {
  income: ['Salary', 'Freelance', 'Investment', 'Other Income'],
  expense: ['Food', 'Transport', 'Housing', 'Entertainment', 'Shopping', 'Bills', 'Health', 'Other']
}

export default function Dashboard() {
  const { user } = useAuth()
  const { mask } = useMask()
  const [transactions, setTransactions] = useState([])
  const [period, setPeriod] = useState('month') // month, 3months, year

  useEffect(() => {
    if (!user) return

    let startDate
    const now = new Date()
    if (period === 'month') startDate = startOfMonth(now)
    else if (period === '3months') startDate = startOfMonth(subMonths(now, 2))
    else startDate = startOfMonth(subMonths(now, 11))

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      where('date', '>=', Timestamp.fromDate(startDate)),
      orderBy('date', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate()
      }))
      setTransactions(data)
    })

    return unsubscribe
  }, [user, period])

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const balance = totalIncome - totalExpense
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) : 0

  // Chart data - daily totals
  const dailyData = transactions.reduce((acc, t) => {
    const day = format(t.date, 'MM/dd')
    if (!acc[day]) acc[day] = { date: day, income: 0, expense: 0 }
    if (t.type === 'income') acc[day].income += t.amount
    else acc[day].expense += t.amount
    return acc
  }, {})
  const chartData = Object.values(dailyData).reverse()

  // Expense by category
  const expenseByCategory = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount
      return acc
    }, {})
  const pieData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value }))

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Welcome back, {user?.displayName || 'User'}</h1>
        <div className="period-selector">
          <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>This Month</button>
          <button className={period === '3months' ? 'active' : ''} onClick={() => setPeriod('3months')}>3 Months</button>
          <button className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Year</button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card income">
          <span className="stat-label">Total Income</span>
          <span className="stat-value">{mask('$' + totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 }))}</span>
        </div>
        <div className="stat-card expense">
          <span className="stat-label">Total Expenses</span>
          <span className="stat-value">{mask('$' + totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 }))}</span>
        </div>
        <div className="stat-card balance">
          <span className="stat-label">Net Balance</span>
          <span className="stat-value" style={{ color: balance >= 0 ? '#10b981' : '#f43f5e' }}>
            {mask('$' + balance.toLocaleString('en-US', { minimumFractionDigits: 2 }))}
          </span>
        </div>
        <div className="stat-card savings">
          <span className="stat-label">Savings Rate</span>
          <span className="stat-value">{mask(savingsRate + '%')}</span>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Income vs Expenses</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6' }}
                />
                <Area type="monotone" dataKey="income" stackId="1" stroke="#10b981" fill="#10b98133" />
                <Area type="monotone" dataKey="expense" stackId="2" stroke="#f43f5e" fill="#f43f5e33" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">No transactions yet. Add some on the Transactions page!</div>
          )}
        </div>

        <div className="chart-card">
          <h3>Expenses by Category</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(value) => ['$' + value.toLocaleString('en-US', { minimumFractionDigits: 2 }), 'Amount']}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">No expenses recorded yet.</div>
          )}
        </div>
      </div>

      <div className="recent-transactions">
        <h3>Recent Transactions</h3>
        {transactions.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 10).map(t => (
                <tr key={t.id}>
                  <td>{format(t.date, 'MMM dd, yyyy')}</td>
                  <td>{t.description}</td>
                  <td><span className="category-badge">{t.category}</span></td>
                  <td className={t.type === 'income' ? 'amount-income' : 'amount-expense'}>
                    {mask((t.type === 'income' ? '+' : '-') + '$' + t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p><i className="fas fa-university"></i> No transactions yet</p>
            <p>Head to the Transactions page to start tracking your finances!</p>
          </div>
        )}
      </div>
    </div>
  )
}
