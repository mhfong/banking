import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import data from '../data/ibkr_parsed.json'
import '../styles/performance.css'

const PERIODS = ['1W','MTD','1M','3M','YTD','1Y','All']

function filterByPeriod(dailyPnL, period) {
  if (!dailyPnL.length) return dailyPnL
  const now = new Date(dailyPnL[dailyPnL.length - 1].date)
  let cutoff
  switch(period) {
    case '1W': cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); break
    case 'MTD': cutoff = new Date(now.getFullYear(), now.getMonth(), 1); break
    case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break
    case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break
    case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break
    case '1Y': cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break
    default: return dailyPnL
  }
  const cutStr = cutoff.toISOString().slice(0,10)
  const filtered = dailyPnL.filter(d => d.date >= cutStr)
  if (!filtered.length) return dailyPnL
  const base = filtered[0].cumulative - filtered[0].pnl
  return filtered.map(d => ({ ...d, cumulative: Math.round((d.cumulative - base)*100)/100 }))
}

const fmt = (v) => v >= 0 ? `+$${v.toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`
const fmtPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'

export default function Performance() {
  const [period, setPeriod] = useState('All')
  const { trades, dailyPnL, summary } = data

  const chartData = useMemo(() => filterByPeriod(dailyPnL, period), [dailyPnL, period])

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: 'var(--bg-secondary)', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.8rem' }}>
        <div style={{ color: 'var(--text-secondary)' }}>{d.date}</div>
        <div style={{ color: d.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>Day: {fmt(d.pnl)}</div>
        <div style={{ color: d.cumulative >= 0 ? 'var(--green)' : 'var(--red)' }}>Total: {fmt(d.cumulative)}</div>
      </div>
    )
  }

  return (
    <div className="performance-page">
      <h1>Portfolio Performance</h1>
      <div className={`perf-return ${summary.totalReturn >= 0 ? 'positive' : 'negative'}`}>
        {fmtPct(summary.totalReturn)}
      </div>

      <div className="period-toggles">
        {PERIODS.map(p => (
          <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
        ))}
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#768390' }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fontSize: 11, fill: '#768390' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <ReferenceLine y={0} stroke="#444c56" strokeDasharray="3 3" />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="cumulative" stroke="#539bf5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Deposited</div>
          <div className="stat-value">${summary.totalDeposited.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ending Cash</div>
          <div className="stat-value">${summary.endingCash.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total PNL</div>
          <div className={`stat-value ${summary.totalPnL >= 0 ? 'positive' : 'negative'}`}>{fmt(summary.totalPnL)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Commissions</div>
          <div className="stat-value negative">{fmt(summary.totalCommissions)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Withdrawn</div>
          <div className="stat-value">${summary.totalWithdrawn.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Interest Earned</div>
          <div className="stat-value positive">+${summary.totalInterest.toLocaleString()}</div>
        </div>
      </div>

      <div className="trades-table-container">
        <h3>Recent Trades</h3>
        <table className="trades-table">
          <thead>
            <tr><th>Date</th><th>Symbol</th><th>Type</th><th>Qty</th><th>Price</th><th>Net (HKD)</th></tr>
          </thead>
          <tbody>
            {trades.slice(0, 50).map((t, i) => (
              <tr key={i}>
                <td>{t.date}</td>
                <td>{t.symbol}</td>
                <td style={{ color: t.type === 'Buy' ? 'var(--red)' : 'var(--green)' }}>{t.type}</td>
                <td>{Math.abs(t.quantity)}</td>
                <td>{t.currency} {t.price.toFixed(2)}</td>
                <td style={{ color: t.netHKD >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(Math.round(t.netHKD))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
