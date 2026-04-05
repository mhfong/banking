import { useState, useMemo } from 'react'
import data from '../data/ibkr_parsed.json'
import '../styles/pnl-calendar.css'

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const fmt = (v) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return (v >= 0 ? '+' : '-') + '$' + (abs/1000).toFixed(1) + 'k'
  return (v >= 0 ? '+' : '-') + '$' + abs.toFixed(0)
}

export default function PnLCalendar() {
  const pnlMap = useMemo(() => {
    const m = {}
    data.dailyPnL.forEach(d => { m[d.date] = d.pnl })
    return m
  }, [])

  const dates = data.dailyPnL.map(d => d.date).sort()
  const latestDate = dates.length ? new Date(dates[dates.length - 1]) : new Date()
  const [year, setYear] = useState(latestDate.getFullYear())
  const [month, setMonth] = useState(latestDate.getMonth())

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  const { cells, monthlyTotal, stats } = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    let total = 0, wins = 0, losses = 0, best = -Infinity, worst = Infinity
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const pnl = pnlMap[dateStr] ?? null
      cells.push({ day: d, pnl })
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
      stats: { wins, losses, winRate: tradeDays ? Math.round(wins/tradeDays*100) : 0, best: best === -Infinity ? 0 : best, worst: worst === Infinity ? 0 : worst }
    }
  }, [year, month, pnlMap])

  return (
    <div className="pnl-calendar-page">
      <h1>Daily P&L Calendar</h1>
      <div className="calendar-nav">
        <button onClick={prev}><i className="fas fa-chevron-left"></i></button>
        <h2>{MONTHS[month]} {year}</h2>
        <button onClick={next}><i className="fas fa-chevron-right"></i></button>
      </div>

      <div className="monthly-total">
        <div className="label">Monthly Total</div>
        <div className={`value ${monthlyTotal >= 0 ? 'positive' : 'negative'}`} style={{ color: monthlyTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {fmt(monthlyTotal)}
        </div>
      </div>

      <div className="calendar-grid">
        {DAYS.map(d => <div key={d} className="calendar-header">{d}</div>)}
        {cells.map((c, i) => c === null ? (
          <div key={`e${i}`} className="calendar-cell empty" />
        ) : (
          <div key={c.day} className={`calendar-cell ${c.pnl === null ? '' : c.pnl > 0 ? 'profit' : c.pnl < 0 ? 'loss' : ''}`}>
            <span className="day-num">{c.day}</span>
            {c.pnl !== null && <span className="day-pnl">{fmt(c.pnl)}</span>}
          </div>
        ))}
      </div>

      <div className="calendar-summary">
        <div className="cal-stat">
          <div className="cal-stat-label">Win Days</div>
          <div className="cal-stat-value positive">{stats.wins}</div>
        </div>
        <div className="cal-stat">
          <div className="cal-stat-label">Loss Days</div>
          <div className="cal-stat-value negative">{stats.losses}</div>
        </div>
        <div className="cal-stat">
          <div className="cal-stat-label">Win Rate</div>
          <div className="cal-stat-value">{stats.winRate}%</div>
        </div>
        <div className="cal-stat">
          <div className="cal-stat-label">Best Day</div>
          <div className="cal-stat-value positive">{fmt(stats.best)}</div>
        </div>
        <div className="cal-stat">
          <div className="cal-stat-label">Worst Day</div>
          <div className="cal-stat-value negative">{fmt(stats.worst)}</div>
        </div>
      </div>
    </div>
  )
}
