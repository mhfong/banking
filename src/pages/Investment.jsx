import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import data from '../data/ibkr_parsed.json'
import '../styles/investment.css'

const PERIODS = ['1W','MTD','1M','3M','YTD','1Y','All']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

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

const fmt = (v) => v >= 0 ? `+$${Math.abs(v).toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`
const fmtShort = (v) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return (v >= 0 ? '+' : '-') + '$' + (abs/1000).toFixed(1) + 'k'
  return (v >= 0 ? '+' : '-') + '$' + abs.toFixed(0)
}
const fmtPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'

export default function Investment() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('All')
  const { trades, dailyPnL, summary } = data

  const chartData = useMemo(() => filterByPeriod(dailyPnL, period), [dailyPnL, period])

  // Calendar state
  const pnlMap = useMemo(() => {
    const m = {}
    dailyPnL.forEach(d => { m[d.date] = { pnl: d.pnl, cumulative: d.cumulative } })
    return m
  }, [dailyPnL])

  const dates = dailyPnL.map(d => d.date).sort()
  const latestDate = dates.length ? new Date(dates[dates.length - 1]) : new Date()
  const [calYear, setCalYear] = useState(latestDate.getFullYear())
  const [calMonth, setCalMonth] = useState(latestDate.getMonth())

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y-1) } else setCalMonth(m => m-1) }
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y+1) } else setCalMonth(m => m+1) }

  // US market holidays 2025-2026
  const marketHolidays = useMemo(() => new Set([
    // 2025
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18',
    '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01',
    '2025-11-27', '2025-12-25',
    // 2026
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
    '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
    '2026-11-26', '2026-12-25',
  ]), [])

  function isMarketClosed(year, month, day) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    if (marketHolidays.has(dateStr)) return true
    const d = new Date(year, month, day)
    const dow = d.getDay()
    return dow === 0 || dow === 6 // Weekend
  }

  const { cells, monthlyTotal, calStats } = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    let total = 0, wins = 0, losses = 0, best = -Infinity, worst = Infinity
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const pnlData = pnlMap[dateStr] ?? null
      const pnl = pnlData ? pnlData.pnl : null
      const cumBefore = pnlData ? pnlData.cumulative - pnlData.pnl : null
      const pctChange = pnl !== null && cumBefore && Math.abs(cumBefore) > 0 ? (pnl / Math.abs(summary.netDeposited)) * 100 : null
      const closed = isMarketClosed(calYear, calMonth, d)
      cells.push({ day: d, pnl, pctChange, closed })
      if (pnl !== null) {
        total += pnl
        if (pnl > 0) wins++
        if (pnl < 0) losses++
        if (pnl > best) best = pnl
        if (pnl < worst) worst = pnl
      }
    }
    const tradeDays = wins + losses
    return {
      cells, monthlyTotal: Math.round(total * 100) / 100,
      calStats: { wins, losses, winRate: tradeDays ? Math.round(wins/tradeDays*100) : 0, best: best === -Infinity ? 0 : best, worst: worst === Infinity ? 0 : worst }
    }
  }, [calYear, calMonth, pnlMap])

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="chart-tooltip">
        <div className="tooltip-date">{d.date}</div>
        <div style={{ color: d.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>Day: {fmt(d.pnl)}</div>
        <div style={{ color: d.cumulative >= 0 ? 'var(--green)' : 'var(--red)' }}>Total: {fmt(d.cumulative)}</div>
      </div>
    )
  }

  return (
    <div className="investment-page">
      {/* Header */}
      <div className="inv-header">
        <h1><i className="fas fa-chart-line"></i> Investment</h1>
      </div>

      <div className={`inv-return ${summary.totalReturn >= 0 ? 'positive' : 'negative'}`}>
        {fmtPct(summary.totalReturn)}
      </div>

      <div className="inv-stats">
        <div className="inv-stat-card highlight">
          <div className="inv-stat-label">Net Liquidation Value</div>
          <div className="inv-stat-value">${summary.netLiquidationValue.toLocaleString()}</div>
        </div>
        <div className="inv-stat-card">
          <div className="inv-stat-label">Total P&L</div>
          <div className={`inv-stat-value ${summary.totalPnL >= 0 ? 'positive' : 'negative'}`}>{fmt(Math.round(summary.totalPnL))}</div>
        </div>
        <div className="inv-stat-card">
          <div className="inv-stat-label">Net Deposited</div>
          <div className="inv-stat-value">${summary.netDeposited.toLocaleString()}</div>
        </div>
      </div>

      <div className="period-toggles">
        {PERIODS.map(p => (
          <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
        ))}
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#768390' }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fontSize: 11, fill: '#768390' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <ReferenceLine y={0} stroke="#444c56" strokeDasharray="3 3" />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="cumulative" stroke="#539bf5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* P&L Calendar Section */}
      <div className="calendar-section">
        <div className="calendar-header-row">
          <h3><i className="fas fa-calendar-alt"></i> Monthly P&L Calendar</h3>
        </div>

        <div className="calendar-nav">
          <button onClick={prevMonth}><i className="fas fa-chevron-left"></i></button>
          <div className="calendar-selectors">
            <select className="month-select" value={calMonth} onChange={e => setCalMonth(parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="year-select" value={calYear} onChange={e => setCalYear(parseInt(e.target.value))}>
              {Array.from({length: 5}, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={nextMonth}><i className="fas fa-chevron-right"></i></button>
          <button className="today-btn" onClick={() => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()) }}>Today</button>
        </div>

        <div className="cal-monthly-total">
          <span className="cal-total-label">Monthly Total</span>
          <span className={`cal-total-value ${monthlyTotal >= 0 ? 'positive' : 'negative'}`}>
            {fmtShort(monthlyTotal)}
          </span>
        </div>

        <div className="calendar-grid">
          {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
          {cells.map((c, i) => c === null ? (
            <div key={`e${i}`} className="cal-cell empty" />
          ) : (
            <div key={c.day} className={`cal-cell ${c.pnl === null ? (c.closed ? 'closed' : '') : c.pnl > 0 ? 'profit' : c.pnl < 0 ? 'loss' : ''} ${c.pnl !== null ? 'clickable' : ''}`}
            onClick={() => {
              if (c.pnl !== null) {
                const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(c.day).padStart(2,'0')}`
                navigate(`/investment/trades?date=${dateStr}`)
              }
            }}
          >
              <span className="cal-day-num">{c.day}</span>
              {c.pnl !== null ? (
                <div className="cal-pnl-wrapper">
                  <span className="cal-day-pnl">{fmtShort(c.pnl)}</span>
                  {c.pctChange !== null && <span className="cal-day-pct">{c.pctChange >= 0 ? '+' : ''}{c.pctChange.toFixed(2)}%</span>}
                </div>
              ) : c.closed ? (
                <div className="cal-pnl-wrapper">
                  <span className="cal-closed-label">MARKET<br/>CLOSED</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="cal-summary">
          <div className="cal-stat">
            <div className="cal-stat-label">Win Days</div>
            <div className="cal-stat-value positive">{calStats.wins}</div>
          </div>
          <div className="cal-stat">
            <div className="cal-stat-label">Loss Days</div>
            <div className="cal-stat-value negative">{calStats.losses}</div>
          </div>
          <div className="cal-stat">
            <div className="cal-stat-label">Win Rate</div>
            <div className="cal-stat-value">{calStats.winRate}%</div>
          </div>
          <div className="cal-stat">
            <div className="cal-stat-label">Best Day</div>
            <div className="cal-stat-value positive">{fmtShort(calStats.best)}</div>
          </div>
          <div className="cal-stat">
            <div className="cal-stat-label">Worst Day</div>
            <div className="cal-stat-value negative">{fmtShort(calStats.worst)}</div>
          </div>
        </div>
      </div>

      {/* View Trades Button - bottom */}
      <div className="view-trades-section">
        <button className="view-trades-btn" onClick={() => navigate('/investment/trades')}>
          <span><i className="fas fa-list-alt"></i> View All Trades</span>
          <span className="trades-count-badge">{trades.length} trades</span>
          <span className="arrow"><i className="fas fa-chevron-right"></i></span>
        </button>
      </div>
    </div>
  )
}
