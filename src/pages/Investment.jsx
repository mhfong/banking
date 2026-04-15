import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useMask } from '../contexts/MaskContext'
import { useIBKRData } from '../contexts/IBKRDataContext'
import MaskToggle from '../components/MaskToggle'
import CustomSelect from '../components/CustomSelect'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'

// Count-up hook: animates from 0 to target over duration ms
function useCountUp(target, duration = 800, decimals = 0) {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(null)
  useEffect(() => {
    if (target === null || target === undefined || isNaN(target)) return
    if (prevTarget.current === target) return
    prevTarget.current = target
    const start = Date.now()
    const from = 0
    const to = target
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(parseFloat((from + (to - from) * eased).toFixed(decimals)))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration, decimals])
  return value
}
import '../styles/investment.css'

const PERIODS = ['1W','MTD','1M','3M','YTD','1Y','All']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function filterByPeriod(dailyPnL, period) {
  if (!dailyPnL.length) return dailyPnL
  const withPct = dailyPnL.map(d => ({ ...d, pct: d.cumulative ?? d.cumulativeTWR ?? 0, pnl: d.pnl ?? d.dailyReturn ?? 0 }))
  if (period === 'All') return withPct
  const now = new Date(withPct[withPct.length - 1].date)
  let cutoff
  switch(period) {
    case '1W': cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); break
    case 'MTD': cutoff = new Date(now.getFullYear(), now.getMonth(), 1); break
    case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break
    case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break
    case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break
    case '1Y': cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break
    default: return withPct
  }
  const cutStr = cutoff.toISOString().slice(0,10)
  const filtered = withPct.filter(d => d.date >= cutStr)
  if (!filtered.length) return withPct
  const base = filtered[0].pct - filtered[0].pnl
  return filtered.map(d => ({ ...d, pct: Math.round((d.pct - base) * 100) / 100 }))
}

const fmt = (v) => v >= 0 ? `+$${Math.abs(v).toLocaleString()}` : `-$${Math.abs(v).toLocaleString()}`
const fmtShort = (v) => {
  const abs = Math.abs(v)
  if (abs >= 1000) return (v >= 0 ? '+' : '-') + '$' + (abs/1000).toFixed(1) + 'k'
  return (v >= 0 ? '+' : '-') + '$' + abs.toFixed(0)
}
const fmtPct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'

export default function Investment() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState('All')
  const { masked, mask } = useMask()
  const { data, loading: dataLoading } = useIBKRData()
  const [tradingTargetOverride, setTradingTargetOverride] = useState(null)

  useEffect(() => {
    if (!user) return
    async function loadTarget() {
      const snap = await getDoc(doc(db, 'userSettings', user.uid))
      if (snap.exists()) {
        const d = snap.data()
        // Support new monthlyTarget (%) field from Settings page
        if (d.monthlyTarget != null) {
          setTradingTargetOverride({ mode: 'pct', value: parseFloat(d.monthlyTarget) })
        } else {
          // Legacy tradingTarget support
          const tt = d.tradingTarget
          if (tt && typeof tt === 'object') {
            if (tt.mode === 'pct') setTradingTargetOverride({ mode: 'pct', value: tt.value })
            else if (tt.mode === 'amount') setTradingTargetOverride({ mode: 'amount', value: tt.value })
          } else if (typeof tt === 'number') {
            setTradingTargetOverride({ mode: 'amount', value: tt })
          }
        }
      }
    }
    loadTarget()
  }, [user])

  const { trades = [], dailyTWR: dailyPnL = [], summary = {} } = data || {}

  const chartData = useMemo(() => filterByPeriod(dailyPnL, period), [dailyPnL, period])

  // Calendar state
  // Build set of dates with actual trades (for clickable check)
  const tradeDates = useMemo(() => {
    const s = new Set()
    trades.filter(t => !t.symbol.includes('.')).forEach(t => s.add(t.date))
    return s
  }, [trades])

  // Build calendar PnL from IBKR FIFO Realized PNL
  const pnlMap = useMemo(() => {
    const fifo = data.fifoDailyPnL || []
    const m = {}
    for (const d of fifo) {
      if (Math.abs(d.pnl) >= 0.01) {
        m[d.date] = {
          pnl: d.pnl,
          cumulative: 0,
          pctChange: summary.netDeposited ? Math.round((d.pnl / summary.netDeposited) * 10000) / 100 : 0
        }
      }
    }
    return m
  }, [data.fifoDailyPnL, summary.netDeposited])

  const initMonth = searchParams.get('month')
  const [calYear, setCalYear] = useState(initMonth ? parseInt(initMonth.split('-')[0]) : new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(initMonth ? parseInt(initMonth.split('-')[1]) - 1 : new Date().getMonth())

  const todayStr = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  }, [])

  // Calculate annual PnL = sum of monthly PnL for selected year
  const annualPnL = useMemo(() => {
    let total = 0
    for (const [date, data] of Object.entries(pnlMap)) {
      if (date.startsWith(String(calYear))) {
        total += data.pnl
      }
    }
    return Math.round(total * 100) / 100
  }, [pnlMap, calYear])

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
    let total = 0, wins = 0, losses = 0, best = -Infinity, worst = Infinity, bestDay = null, worstDay = null
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      const pnlData = pnlMap[dateStr] ?? null
      const pnl = pnlData ? pnlData.pnl : null
      const pctChange = pnlData ? pnlData.pctChange : null
      const closed = isMarketClosed(calYear, calMonth, d)
      const hasTrades = tradeDates.has(dateStr)
      cells.push({ day: d, pnl, pctChange, closed, hasTrades })
      if (pnl !== null) {
        total += pnl
        if (pnl > 0) wins++
        if (pnl < 0) losses++
        if (pnl > best) { best = pnl; bestDay = d }
        if (pnl < worst) { worst = pnl; worstDay = d }
      }
    }
    const tradeDays = wins + losses
    return {
      cells, monthlyTotal: Math.round(total * 100) / 100,
      calStats: { wins, losses, winRate: tradeDays ? Math.round(wins/tradeDays*100) : 0, best: best === -Infinity ? 0 : best, worst: worst === Infinity ? 0 : worst, bestDay, worstDay }
    }
  }, [calYear, calMonth, pnlMap])

  // Calculate gradient stop offset for green/red split at 0 line
  const gradientOffset = useMemo(() => {
    if (!chartData.length) return 0.5
    const values = chartData.map(d => d.pct)
    const max = Math.max(...values)
    const min = Math.min(...values)
    if (max <= 0) return 0
    if (min >= 0) return 1
    const offset = max / (max - min)
    return isNaN(offset) ? 0.5 : offset
  }, [chartData])

  // Early returns AFTER all hooks
  if (dataLoading) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  if (!data || !data.summary || !data.summary.netLiquidationValue) {
    return (
      <div className="investment-page">
        <div className="inv-header">
          <h1><i className="fas fa-chart-line"></i> Investment</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <i className="fas fa-lock" style={{ fontSize: 40, marginBottom: 16, opacity: 0.3, display: 'block' }}></i>
          <p>No investment data linked to this account</p>
        </div>
      </div>
    )
  }

  // Count-up animated values for stat cards
  const animNLV = useCountUp(Math.round((summary?.netLiquidationValue || 0) * 10) / 10, 900, 1)
  const animPnL = useCountUp(Math.round(summary.totalPnL), 900, 0)
  const animDeposited = useCountUp(Math.round(summary?.netDeposited || 0), 900, 0)
  const animInterest = useCountUp(Math.round((summary?.totalInterest || 0) * 100) / 100, 900, 2)

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="chart-tooltip">
        <div className="tooltip-date">{d.date}</div>
        <div style={{ color: d.pct >= 0 ? 'var(--green)' : 'var(--red)' }}>{d.pct >= 0 ? '+' : ''}{d.pct.toFixed(2)}%</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Day: {masked ? '***' : fmt(d.pnl)}</div>
      </div>
    )
  }

  return (
    <div className="investment-page">
      {/* Header */}
      <div className="inv-header">
        <h1><i className="fas fa-chart-line"></i> Investment</h1>
        <MaskToggle />
      </div>

      <div className="inv-last-updated">Last Updated: {data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A'}</div>

      <div className="inv-stats">
        <div className="inv-stat-card highlight" style={{ animationDelay: '0s' }}>
          <div className="inv-stat-label">Net Liquidation Value</div>
          <div className="inv-stat-value">{mask('$' + animNLV.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}</div>
        </div>
        <div className="inv-stat-card" style={{ animationDelay: '0.08s' }}>
          <div className="inv-stat-label">Total PNL</div>
          <div className={`inv-stat-value ${summary.totalPnL >= 0 ? 'positive' : 'negative'}`}>{mask(fmt(animPnL))}</div>
        </div>
        <div className="inv-stat-card" style={{ animationDelay: '0.16s' }}>
          <div className="inv-stat-label">Net Deposited</div>
          <div className="inv-stat-value">{mask('$' + animDeposited.toLocaleString())}</div>
        </div>
        <div className="inv-stat-card" style={{ animationDelay: '0.24s' }}>
          <div className="inv-stat-label">Interest Earned</div>
          <div className="inv-stat-value positive">{mask('+$' + animInterest.toLocaleString())}</div>
        </div>
      </div>

      <div className="chart-section" style={{ animationDelay: '0.32s' }}>
        <div className={`chart-return ${(summary.twr || 0) >= 0 ? 'positive' : 'negative'}`}>
          {masked ? '***' : fmtPct(summary.twr || 0)}
        </div>
        <div className="chart-subtitle">Time-weighted return</div>

        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#57ab5a" stopOpacity={0.4} />
                  <stop offset={gradientOffset} stopColor="#57ab5a" stopOpacity={0.05} />
                  <stop offset={gradientOffset} stopColor="#e5534b" stopOpacity={0.05} />
                  <stop offset={1} stopColor="#e5534b" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor="#57ab5a" stopOpacity={1} />
                  <stop offset={gradientOffset} stopColor="#57ab5a" stopOpacity={1} />
                  <stop offset={gradientOffset} stopColor="#e5534b" stopOpacity={1} />
                  <stop offset={1} stopColor="#e5534b" stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={true} vertical={false} strokeDasharray="3 3" stroke="#444c56" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#768390' }} tickFormatter={d => {
                const [,m,day] = d.split('-')
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                return `${parseInt(day)} ${months[parseInt(m)-1]}`
              }} interval={Math.max(1, Math.floor(chartData.length / 6))} axisLine={{ stroke: '#444c56' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#768390' }} tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`} axisLine={false} tickLine={false} orientation="right" />
              <ReferenceLine y={0} stroke="#768390" strokeDasharray="3 3" strokeWidth={1} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="pct"
                stroke="url(#splitStroke)"
                strokeWidth={2}
                fill="url(#splitColor)"
                dot={{ r: 2, fill: 'url(#splitStroke)', strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#22272e' }}
                baseLine={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="period-toggles">
          {PERIODS.map(p => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* PNL Calendar Section */}
      <div className="calendar-section">
        <div className="calendar-header-row">
          <h3><i className="fas fa-calendar-alt"></i> PNL Calendar</h3>
        </div>

        <div className="calendar-nav">
          <button onClick={prevMonth}><i className="fas fa-chevron-left"></i></button>
          <div className="calendar-selectors">
            <CustomSelect
              className="select-month"
              value={calMonth}
              options={MONTHS.map((m, i) => ({ value: i, label: m }))}
              onChange={v => setCalMonth(v)}
            />
            <CustomSelect
              className="select-year"
              value={calYear}
              options={Array.from({length: 5}, (_, i) => ({ value: 2024 + i, label: String(2024 + i) }))}
              onChange={v => setCalYear(v)}
            />
          </div>
          <button onClick={nextMonth}><i className="fas fa-chevron-right"></i></button>
          <button className="today-btn" onClick={() => { setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()) }}>Today</button>
        </div>

        <div className="calendar-grid">
          {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
          {cells.map((c, i) => c === null ? (
            <div key={`e${i}`} className="cal-cell empty" />
          ) : (
            <div key={c.day} className={`cal-cell ${c.pnl === null ? (c.closed ? 'closed' : '') : c.pnl > 0 ? 'profit' : c.pnl < 0 ? 'loss' : ''} ${c.hasTrades ? 'clickable' : ''} ${`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(c.day).padStart(2,'0')}` === todayStr ? 'today' : ''} ${c.day === calStats.bestDay && c.pnl > 0 ? 'best-day' : ''} ${c.day === calStats.worstDay && c.pnl < 0 ? 'worst-day' : ''}`}
            onClick={() => {
              if (c.hasTrades) {
                const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(c.day).padStart(2,'0')}`
                navigate(`/investment/trades?date=${dateStr}`)
              }
            }}
          >
              <span className="cal-day-num">{c.day}</span>
              {c.pnl !== null ? (
                <div className="cal-pnl-wrapper">
                  <span className="cal-day-pnl">{masked ? '***' : fmtShort(c.pnl)}</span>
                  {!masked && c.pctChange !== null && <span className="cal-day-pct">{c.pctChange >= 0 ? '+' : ''}{c.pctChange.toFixed(2)}%</span>}
                </div>
              ) : c.closed ? (
                <div className="cal-pnl-wrapper">
                  <span className="cal-closed-label">MARKET<br/>CLOSED</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* Monthly Target Bar */}
        {(() => {
          const autoTarget = Math.round((data.summary?.netLiquidationValue || 0) * 0.015)
          const target = tradingTargetOverride !== null
            ? (tradingTargetOverride.mode === 'pct' ? Math.round((data.summary?.netLiquidationValue || 0) * tradingTargetOverride.value / 100) : tradingTargetOverride.value)
            : autoTarget
          const monthKey = `${calYear}-${String(calMonth+1).padStart(2,'0')}`
          
          // Realized PNL from trades
          const realizedPNL = monthlyTotal
          
          // Interest for this month (paid if available, otherwise accrued)
          const paidInterest = data.monthlyInterest?.[monthKey] || 0
          const accruedInterest = data.monthlyInterestAccrued?.[monthKey] || 0
          const monthInterest = Math.round((paidInterest || accruedInterest) * 100) / 100
          const isAccrued = !paidInterest && accruedInterest !== 0
          
          // Commission from trades this month
          const monthTrades = (data.fifoDailyPnL || []).filter(d => d.date.startsWith(monthKey))
          const totalCommission = monthTrades.reduce((s, t) => s + Math.abs(t.commission || 0), 0)
          
          const totalPNL = realizedPNL + monthInterest
          const pct = target > 0 ? Math.min(Math.max(totalPNL / target * 100, 0), 100) : 0
          const isAchieved = totalPNL >= target
          
          return (
            <div className={`target-bar-section ${isAchieved ? 'target-achieved' : ''}`}>
              <div className="target-bar-header">
                <span className="target-bar-label">Monthly Target</span>
                <span className="target-bar-values">
                  <span className={totalPNL >= 0 ? 'positive' : 'negative'}>{mask((totalPNL >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(totalPNL)).toLocaleString())}</span>
                  <span className="target-bar-divider">/</span>
                  <span>${target.toLocaleString()}</span>
                </span>
              </div>
              <div className="target-track">
                <div className={`target-fill ${isAchieved ? 'achieved' : ''}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="target-breakdown">
                <span><i className="fas fa-chart-bar"></i> PNL: {mask((realizedPNL >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(realizedPNL)).toLocaleString())}</span>
                <span><i className="fas fa-coins"></i> Interest: {mask((monthInterest >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(monthInterest)).toLocaleString())}{isAccrued ? ' *' : ''}</span>
                <span><i className="fas fa-percentage"></i> Comm: {mask('-$' + Math.abs(Math.round(totalCommission)).toLocaleString())}</span>
              </div>
            </div>
          )
        })()}

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
            <div className="cal-stat-label">Monthly PNL</div>
            <div className={`cal-stat-value ${monthlyTotal >= 0 ? 'positive' : 'negative'}`}>{mask(fmtShort(monthlyTotal))}</div>
          </div>
          <div className="cal-stat">
            <div className="cal-stat-label">Annual PNL</div>
            <div className={`cal-stat-value ${annualPnL >= 0 ? 'positive' : 'negative'}`}>{mask(fmtShort(annualPnL))}</div>
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
