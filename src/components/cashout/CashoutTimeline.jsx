import { useMemo, useState } from 'react'
import {
  addDateDays,
  getDaysInMonth,
  getMonthStart,
  getNextMonthStart,
  parseDateOnly,
} from '../../cashout/hongKongWorkingDays.js'

const weekdayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const markerMetadata = {
  borrow: { label: 'Borrow Date', shortLabel: 'B' },
  due: { label: 'Due Date', shortLabel: 'D' },
  payment: { label: 'Payment Date', shortLabel: 'P' },
}

function getPreviousMonthStart(monthStart) {
  return getMonthStart(addDateDays(monthStart, -1))
}

function getMonthGridDates(monthStart) {
  const monthDate = parseDateOnly(monthStart)
  const mondayOffset = (monthDate.getUTCDay() + 6) % 7
  const daysInMonth = getDaysInMonth(monthDate.getUTCFullYear(), monthDate.getUTCMonth())
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  const firstGridDate = addDateDays(monthStart, -mondayOffset)

  return Array.from({ length: cellCount }, (_, index) => addDateDays(firstGridDate, index))
}

function getCalendarMarkers(cards, cashouts, payments, dueDates) {
  const cardsById = new Map(cards.map(card => [card.id, card]))
  const cashoutsById = new Map(cashouts.map(cashout => [cashout.id, cashout]))
  const markers = []
  const dueMarkerKeys = new Set()

  function addMarker(marker) {
    if (marker.type === 'due') {
      const key = `${marker.cardId}:${marker.date}`
      if (dueMarkerKeys.has(key)) return
      dueMarkerKeys.add(key)
    }
    markers.push(marker)
  }

  cashouts.forEach(cashout => {
    const card = cardsById.get(cashout.cardId)
    if (!card) return

    const cardName = card.name || 'Unnamed card'
    if (cashout.borrowedOn) {
      addMarker({
        id: `borrow-${cashout.id}`,
        date: cashout.borrowedOn,
        type: 'borrow',
        cardId: card.id,
        cardName,
      })
    }
    if (cashout.expectedPaymentOn) {
      addMarker({
        id: `due-${cashout.id}`,
        date: cashout.expectedPaymentOn,
        type: 'due',
        cardId: card.id,
        cardName,
      })
    }
  })

  payments.forEach(payment => {
    const cashout = cashoutsById.get(payment.cashoutId)
    const card = cashout ? cardsById.get(cashout.cardId) : null
    if (!card || !payment.paidOn) return

    addMarker({
      id: `payment-${payment.id ?? payment.cashoutId}-${payment.paidOn}`,
      date: payment.paidOn,
      type: 'payment',
      cardId: card.id,
      cardName: card.name || 'Unnamed card',
    })
  })

  dueDates.forEach(dueDate => {
    const card = cardsById.get(dueDate.cardId)
    if (!card || !dueDate.dueOn) return

    addMarker({
      id: `due-date-${dueDate.id ?? `${dueDate.cardId}-${dueDate.dueOn}`}`,
      date: dueDate.dueOn,
      type: 'due',
      cardId: card.id,
      cardName: card.name || 'Unnamed card',
    })
  })

  return markers
}

function groupMarkersByDate(markers) {
  return markers.reduce((groups, marker) => {
    const dateMarkers = groups.get(marker.date) ?? []
    dateMarkers.push(marker)
    groups.set(marker.date, dateMarkers)
    return groups
  }, new Map())
}

function CalendarMarker({ marker }) {
  const metadata = markerMetadata[marker.type]
  const accessibleLabel = `${marker.cardName} ${metadata.label} on ${marker.date}`

  return (
    <span
      className={`cashout-cycle-calendar-marker cashout-cycle-calendar-marker-${marker.type}`}
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-card-id={marker.cardId}
      data-date={marker.date}
    >
      <span className="cashout-cycle-calendar-marker-type">{metadata.shortLabel}</span>
      <span className="cashout-cycle-calendar-marker-name">{marker.cardName}</span>
    </span>
  )
}

export default function CashoutTimeline({ cards = [], cashouts = [], dueDates = [], payments = [], today }) {
  const [monthStart, setMonthStart] = useState(() => getMonthStart(today))
  const monthKey = monthStart.slice(0, 7)
  const monthLabel = monthFormatter.format(parseDateOnly(monthStart))
  const monthDates = useMemo(() => getMonthGridDates(monthStart), [monthStart])
  const markers = useMemo(() => getCalendarMarkers(cards, cashouts, payments, dueDates), [cards, cashouts, dueDates, payments])
  const markersByDate = useMemo(() => groupMarkersByDate(markers), [markers])

  if (cards.length === 0) {
    return (
      <div className="cashout-cycle-calendar-empty" role="status">
        <i className="fas fa-calendar-alt" aria-hidden="true"></i>
        <span>No cards to calendar yet.</span>
      </div>
    )
  }

  return (
    <div className="cashout-cycle-calendar" data-month={monthKey}>
      <div className="cashout-cycle-calendar-toolbar">
        <div className="cashout-cycle-calendar-month">
          <span>Cashout dates</span>
          <strong>{monthLabel}</strong>
        </div>
        <div className="cashout-cycle-calendar-controls">
          <button
            type="button"
            className="cashout-cycle-calendar-control"
            aria-label="Previous month"
            title="Previous month"
            onClick={() => setMonthStart(getPreviousMonthStart(monthStart))}
          >
            <i className="fas fa-chevron-left" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            className="cashout-cycle-calendar-control cashout-cycle-calendar-control-today"
            aria-label="Return calendar to today"
            title="Return calendar to today"
            onClick={() => setMonthStart(getMonthStart(today))}
          >
            Today
          </button>
          <button
            type="button"
            className="cashout-cycle-calendar-control"
            aria-label="Next month"
            title="Next month"
            onClick={() => setMonthStart(getNextMonthStart(monthStart))}
          >
            <i className="fas fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div className="cashout-cycle-calendar-key" aria-label="Calendar date types">
        <span><strong className="borrow">B</strong> Borrow Date</span>
        <span><strong className="due">D</strong> Due Date</span>
        <span><strong className="payment">P</strong> Payment Date</span>
      </div>

      <div className="cashout-cycle-calendar-scroll">
        <div className="cashout-cycle-calendar-grid" role="grid" aria-label={`${monthLabel} cashout dates`}>
          {weekdayLabels.map(label => (
            <div className="cashout-cycle-calendar-weekday" role="columnheader" key={label}>
              {label}
            </div>
          ))}
          {monthDates.map(date => {
            const isOutsideMonth = date.slice(0, 7) !== monthKey
            const isToday = date === today
            const dayClassName = [
              'cashout-cycle-calendar-day',
              isOutsideMonth && 'cashout-cycle-calendar-day-outside',
              isToday && 'cashout-cycle-calendar-day-today',
            ].filter(Boolean).join(' ')

            return (
              <div
                className={dayClassName}
                role="gridcell"
                aria-label={`${date}${isToday ? ', Today' : ''}`}
                data-date={date}
                key={date}
              >
                <time dateTime={date}>{Number(date.slice(8))}</time>
                <div className="cashout-cycle-calendar-day-markers">
                  {(markersByDate.get(date) ?? []).map(marker => (
                    <CalendarMarker
                      marker={marker}
                      key={marker.id}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
