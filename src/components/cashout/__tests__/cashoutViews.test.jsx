import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CashflowForecast from '../CashflowForecast.jsx'
import CashoutStatusBanner from '../CashoutStatusBanner.jsx'
import CashoutSummary from '../CashoutSummary.jsx'
import CashoutTimeline from '../CashoutTimeline.jsx'
import CashoutCardForm from '../CashoutCardForm.jsx'
import CashoutDueDatePrompt from '../CashoutDueDatePrompt.jsx'
import CardCapacityGrid from '../CardCapacityGrid.jsx'

const timelineSource = readFileSync(fileURLToPath(new URL('../CashoutTimeline.jsx', import.meta.url)), 'utf8')
const timelineStyleSource = readFileSync(fileURLToPath(new URL('../../../styles/cashout-cycle.css', import.meta.url)), 'utf8')
const cashoutCycleSource = readFileSync(fileURLToPath(new URL('../../../pages/CashoutCycle.jsx', import.meta.url)), 'utf8')
const settingsSource = readFileSync(fileURLToPath(new URL('../CashflowSettingsForm.jsx', import.meta.url)), 'utf8')

const card = {
  id: 'card-1',
  name: 'Primary card',
  issuer: 'Example Bank',
  totalCreditLimit: 20000,
  monthlyBorrowLimit: 10000,
  capacity: {
    outstanding: 5000,
    availableCredit: 15000,
    effectiveMonthlyBorrowLimit: 10000,
    borrowedThisCycle: 5000,
    monthlyRoom: 6000,
    maxNewBorrow: 6000,
    status: 'awaiting-payment',
  },
  safeBorrow: { date: '2026-11-01', reason: 'Safe to borrow from 2026-11-01.' },
}

const cashout = {
  id: 'cashout-1',
  cardId: 'card-1',
  amount: 5000,
  borrowedOn: '2026-10-01',
  expectedPaymentOn: '2026-10-20',
  expectedPaymentAmount: 5000,
  status: 'open',
}

const forecast = {
  rows: [{
    date: '2026-10-20',
    salary: 10000,
    reservedBudget: 2000,
    actualPayments: 0,
    plannedPayments: 5000,
    contingentBorrowing: 3000,
    paymentObligations: [{ cashoutId: 'cashout-1', cardId: 'card-1', amount: 5000 }],
    actualPaymentDetails: [],
    contingentDetails: [{ cashoutId: 'cashout-future', cardId: 'card-1', amount: 3000 }],
    projectedCash: 3000,
    risk: 'will-fail',
  }],
  firstFailure: {
    date: '2026-10-20',
    cashoutId: 'cashout-1',
    cardId: 'card-1',
    shortfall: 2000,
  },
  shortfall: 2000,
}

const status = {
  state: 'at-risk',
  title: 'At Risk',
  message: 'The payment cannot be funded from projected cash.',
  firstFailure: {
    date: '2026-10-20',
    cardId: 'card-1',
    cardName: 'Primary card',
    paymentAmount: 5000,
    shortfall: 2000,
  },
  shortfall: 2000,
}

describe('Cashout Cycle views', () => {
  it('keeps the primary overview in status, capacity, reminders, timeline order', () => {
    const statusIndex = cashoutCycleSource.indexOf('<CashoutStatusBanner')
    const capacityIndex = cashoutCycleSource.indexOf('<CardCapacityGrid')
    const remindersIndex = cashoutCycleSource.indexOf('<CashoutReminderList')
    const timelineIndex = cashoutCycleSource.indexOf('<CashoutTimeline')

    expect(statusIndex).toBeGreaterThanOrEqual(0)
    expect(capacityIndex).toBeGreaterThan(statusIndex)
    expect(remindersIndex).toBeGreaterThan(capacityIndex)
    expect(timelineIndex).toBeGreaterThan(remindersIndex)
  })

  it('does not render a standalone Loop summary section on the page', () => {
    expect(cashoutCycleSource).not.toContain('<CashoutSummary')
  })

  it('renders an explainable status banner and distinct summary metrics', () => {
    const markup = renderToStaticMarkup(createElement(
      'div',
      null,
      createElement(CashoutStatusBanner, { status, onReview: vi.fn() }),
      createElement(CashoutSummary, {
        summary: {
          grossBorrowed: 12000,
          paidBack: 7000,
          outstanding: 5000,
          availableCredit: 15000,
          monthlyRoom: 6000,
          dueSoonTotal: 5000,
          bestNextBorrow: { cardName: 'Primary card', date: '2026-11-01', amount: 6000 },
        },
        status,
        onAddCashout: vi.fn(),
      }),
    ))

    expect(markup).toContain('At Risk')
    expect(markup).toContain('The payment cannot be funded from projected cash.')
    expect(markup).toContain('2026-10-20')
    expect(markup).toContain('Primary card')
    expect(markup).toContain('HK$2,000')
    expect(markup).toContain('Gross borrowed')
    expect(markup).toContain('Paid back')
    expect(markup).toContain('Outstanding')
    expect(markup).toContain('Best next borrow')
    expect(markup).toContain('Review forecast')
  })

  it('labels a future-limit failure as a borrow in the status details', () => {
    const markup = renderToStaticMarkup(createElement(CashoutStatusBanner, {
      status: {
        ...status,
        message: 'The planned borrow exceeds available room.',
        firstFailure: {
          kind: 'future-limit',
          date: '2026-11-02',
          cashoutId: 'cashout-limit-risk',
          cardId: 'card-1',
          cardName: 'Primary card',
          borrowAmount: 9000,
          availableBorrow: 8000,
          shortfall: 1000,
        },
        shortfall: 1000,
      },
      onReview: vi.fn(),
    }))

    expect(markup).toContain('<dt>Borrow</dt>')
    expect(markup).toContain('cashout-limit-risk')
    expect(markup).toContain('HK$9,000')
    expect(markup).toContain('HK$8,000')
    expect(markup).toContain('HK$1,000')
  })

  it('renders secondary future-limit context when payment failure remains primary', () => {
    const markup = renderToStaticMarkup(createElement(CashoutStatusBanner, {
      status: {
        ...status,
        firstFailure: status.firstFailure,
        futureLimitFailure: {
          kind: 'future-limit',
          date: '2026-11-02',
          cashoutId: 'cashout-future-limit',
          cardId: 'card-1',
          cardName: 'Primary card',
          borrowAmount: 9000,
          availableBorrow: 8000,
          shortfall: 1000,
        },
      },
      onReview: vi.fn(),
    }))

    expect(markup).toContain('Future limit failure')
    expect(markup).toContain('cashout-future-limit')
    expect(markup).toContain('Allowed borrow')
    expect(markup).toContain('HK$8,000')
  })

  it('renders separate card capacity measures and readable states', () => {
    const markup = renderToStaticMarkup(createElement(CardCapacityGrid, { cards: [card] }))

    expect(markup).toContain('cashout-cycle-card-capacity-available')
    expect(markup).toContain('HK$5,000 available')
    expect(markup).toContain('50% used')
    expect(markup).toContain('HK$5,000 currently used')
    expect(markup).toContain('cashout-cycle-card-capacity-progress')
    expect(markup).toContain('cashout-cycle-card-capacity-limit')
    expect(markup).toContain('Limit <strong>HK$10,000</strong>')
    expect(markup).toContain('50% used')
    expect(markup).toContain('aria-valuenow="50"')
    expect(markup).not.toContain('cashout-cycle-card-capacity-stats')
    expect(markup).not.toContain('Maximum next borrow')
    expect(markup).toContain('Partial')
  })

  it('keeps long card names readable beside the capacity state', () => {
    const markup = renderToStaticMarkup(createElement(CardCapacityGrid, {
      cards: [{ ...card, name: 'DBS Eminent Platinum World Elite' }],
    }))

    expect(markup).toContain('DBS Eminent Platinum World Elite')
    expect(timelineStyleSource).toMatch(/\.cashout-cycle-card-capacity-header h3 \{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/)
  })

  it('renders each card capacity item as an edit trigger', () => {
    const markup = renderToStaticMarkup(createElement(CardCapacityGrid, {
      cards: [card],
      onEditCard: vi.fn(),
    }))

    expect(markup).toContain('cashout-cycle-card-capacity-trigger')
    expect(markup).toContain('aria-label="Edit Primary card capacity"')
  })

  it('bases card status on monthly borrowing usage instead of total credit', () => {
    const monthlyOnlyCard = {
      ...card,
      totalCreditLimit: 0,
      capacity: {
        ...card.capacity,
        availableCredit: 0,
        status: 'credit-limit',
      },
    }
    const markup = renderToStaticMarkup(createElement(CardCapacityGrid, { cards: [monthlyOnlyCard] }))

    expect(markup).toContain('Partial')
    expect(markup).not.toContain('No credit')
  })

  it('shows OVERLIMIT when the monthly borrowing room is exhausted', () => {
    const exhaustedCard = {
      ...card,
      capacity: {
        ...card.capacity,
        outstanding: 10000,
        borrowedThisCycle: 10000,
        monthlyRoom: 0,
      },
    }
    const markup = renderToStaticMarkup(createElement(CardCapacityGrid, { cards: [exhaustedCard] }))

    expect(markup).toContain('OVERLIMIT')
    expect(markup).not.toContain('No available credit')
    expect(markup).toContain('cashout-cycle-card-capacity-progress no-credit')
    expect(markup).toContain('aria-valuenow="100"')
    expect(markup).not.toContain('Locked')
  })

  it('counts an outstanding prior-month balance as used capacity', () => {
    const priorMonthBalanceCard = {
      ...card,
      capacity: {
        ...card.capacity,
        outstanding: 10000,
        borrowedThisCycle: 0,
        monthlyRoom: 10000,
      },
    }
    const markup = renderToStaticMarkup(createElement(CardCapacityGrid, { cards: [priorMonthBalanceCard] }))

    expect(markup).toContain('OVERLIMIT')
    expect(markup).not.toContain('No available credit')
    expect(markup).toContain('HK$0 available')
    expect(markup).toContain('aria-valuenow="100"')
  })

  it('renders a shared month calendar around today', () => {
    const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
      cards: [card],
      cashouts: [cashout],
      payments: [],
      today: '2026-11-01',
    }))

    expect(markup).toContain('cashout-cycle-calendar-grid')
    expect(markup).toContain('data-month="2026-11"')
    expect(markup).toContain('November 2026')
    expect(markup.match(/class="cashout-cycle-calendar-day(?: |")/g)).toHaveLength(42)
    expect(markup).toContain('Monday')
    expect(markup).toContain('Sunday')
    expect(markup).toContain('cashout-cycle-calendar-day-today')
  })

  it('marks only borrow, due, and payment dates for their cards', () => {
    const calendarCashout = { ...cashout, borrowedOn: '2026-11-01', expectedPaymentOn: '2026-11-20' }
    const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
      cards: [card],
      cashouts: [calendarCashout],
      payments: [{ id: 'payment-1', cashoutId: 'cashout-1', amount: 1000, paidOn: '2026-11-12' }],
      forecast,
      summary: { outstanding: 5000 },
      today: '2026-11-01',
      onSelectCashout: vi.fn(),
    }))

    expect(markup).toContain('Primary card Borrow Date on 2026-11-01')
    expect(markup).toContain('Primary card Due Date on 2026-11-20')
    expect(markup).toContain('Primary card Payment Date on 2026-11-12')
    expect(markup).toContain('>B</span>')
    expect(markup).toContain('>D</span>')
    expect(markup).toContain('>P</span>')
    expect(markup).not.toContain('Salary')
    expect(markup).not.toContain('Safe date')
    expect(markup).not.toContain('Failure')
    expect(markup).not.toContain('Record payment')
    expect(markup).not.toContain('cashout-cycle-timeline-lane')
  })

  it('keeps historical cashout Due Dates beside manual monthly Due Dates', () => {
    const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
      cards: [card],
      cashouts: [{ ...cashout, expectedPaymentOn: '2026-11-20' }],
      dueDates: [{ id: 'due-1', cardId: 'card-1', dueOn: '2026-11-22' }],
      payments: [],
      today: '2026-11-01',
    }))

    expect(markup).toContain('Primary card Due Date on 2026-11-20')
    expect(markup).toContain('Primary card Due Date on 2026-11-22')
  })

  it('shows the effective current-month Due Date in the edit-card form', () => {
    const editCard = {
      ...card,
      nextStatementDate: '2026-11-14',
      nextBorrowDate: '2026-11-15',
    }
    const markup = renderToStaticMarkup(createElement(CashoutCardForm, {
      cards: [editCard],
      cashouts: [{ ...cashout, expectedPaymentOn: '2026-11-20' }],
      dueDates: [{ id: 'due-1', cardId: 'card-1', dueOn: '2026-11-22' }],
      initialCardId: 'card-1',
      today: '2026-11-01',
    }))

    expect(markup).toContain('Due date for this month')
    expect(markup).toContain('name="dueDate"')
    expect(markup).toContain('value="2026-11-22"')
  })

  it('asks for the next Due Date with a two-day suggestion', () => {
    const markup = renderToStaticMarkup(createElement(CashoutDueDatePrompt, {
      prompt: {
        cardId: 'card-1',
        cardName: 'Primary card',
        currentDueOn: '2026-11-01',
        suggestedDueOn: '2026-11-03',
      },
      onCreateDueDate: vi.fn(),
      onDismiss: vi.fn(),
    }))

    expect(markup).toContain('Next Due Date')
    expect(markup).toContain('Primary card')
    expect(markup).toContain('value="2026-11-03"')
  })

  it('keeps card identity when multiple cards share a calendar date', () => {
    const secondaryCard = { ...card, id: 'card-2', name: 'Secondary card' }
    const calendarCashout = { ...cashout, borrowedOn: '2026-11-01' }
    const secondaryCashout = { ...cashout, id: 'cashout-2', cardId: 'card-2', borrowedOn: '2026-11-01' }
    const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
      cards: [card, secondaryCard],
      cashouts: [calendarCashout, secondaryCashout],
      payments: [],
      today: '2026-11-01',
    }))

    expect(markup).toContain('Primary card Borrow Date on 2026-11-01')
    expect(markup).toContain('Secondary card Borrow Date on 2026-11-01')
    expect(markup).toContain('data-card-id="card-1"')
    expect(markup).toContain('data-card-id="card-2"')
    expect(markup.match(/cashout-cycle-calendar-marker cashout-cycle-calendar-marker-borrow/g)).toHaveLength(2)
    expect(markup).not.toContain('cashout-cycle-calendar-card-')
  })

  it('renders accessible month navigation controls', () => {
    const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
      cards: [card],
      cashouts: [],
      payments: [],
      today: '2026-11-01',
    }))

    expect(markup).toContain('aria-label="Previous month"')
    expect(markup).toContain('aria-label="Next month"')
    expect(markup).toContain('aria-label="Return calendar to today"')
  })

  it('styles the calendar as a flexible seven-column surface', () => {
    expect(timelineStyleSource).toContain('.cashout-cycle-calendar-grid')
    expect(timelineStyleSource).toContain('grid-template-columns: repeat(7, minmax(0, 1fr));')
    expect(timelineStyleSource).toContain('min-width: 728px;')
    expect(timelineStyleSource).toContain('.cashout-cycle-calendar-marker')
    expect(timelineStyleSource).toContain('.cashout-cycle-calendar-marker-borrow')
    expect(timelineStyleSource).toContain('.cashout-cycle-calendar-marker-due')
    expect(timelineStyleSource).toContain('.cashout-cycle-calendar-marker-payment')
    expect(timelineStyleSource).not.toContain('.cashout-cycle-calendar-card-')
    expect(timelineStyleSource).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('does not retain timeline interaction and forecast props', () => {
    expect(timelineSource).not.toContain('getTimelinePreviewPosition')
    expect(timelineSource).not.toContain('onSelectCashout')
    expect(timelineSource).not.toContain('forecast')
    expect(timelineSource).not.toContain('summary')
    expect(timelineSource).not.toContain('timelineDragRef')
    expect(cashoutCycleSource).not.toContain('timelineCards')
    expect(cashoutCycleSource).not.toContain('onSelectCashout={cashoutId => openModal')
  })

  it('keeps archived card history visible as calendar markers', () => {
    const archivedCard = { ...card, id: 'archived-card', name: 'Archived card', active: false }
    const archivedCashout = {
      ...cashout,
      id: 'archived-cashout',
      cardId: 'archived-card',
      borrowedOn: '2026-11-01',
      expectedPaymentOn: '2026-11-20',
    }
    const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
      cards: [archivedCard],
      cashouts: [archivedCashout],
      payments: [],
      today: '2026-11-01',
    }))

    expect(markup).toContain('Archived card Borrow Date on 2026-11-01')
    expect(markup).toContain('Archived card Due Date on 2026-11-20')
    expect(markup).toContain('data-card-id="archived-card"')
  })

  it('keeps projected cash-only results separate from contingent borrowing', () => {
    const markup = renderToStaticMarkup(createElement(CashflowForecast, { rows: forecast.rows, status }))

    expect(markup).toContain('Protected budget')
    expect(markup).toContain('Planned payments')
    expect(markup).toContain('Actual payments')
    expect(markup).toContain('Cash-only projected cash')
    expect(markup).toContain('Contingent borrowing')
    expect(markup).toContain('First unsafe date')
    expect(markup).toContain('Shortfall')
    expect(markup).toContain('HK$3,000')
  })

  it('renders structured future-limit context in the forecast beside a primary payment failure', () => {
    const futureLimitFailure = {
      kind: 'future-limit',
      date: '2026-11-02',
      cashoutId: 'cashout-future-limit',
      cardId: 'card-1',
      cardName: 'Primary card',
      borrowAmount: 9000,
      availableBorrow: 8000,
      shortfall: 1000,
    }
    const markup = renderToStaticMarkup(createElement(CashflowForecast, {
      rows: [
        { date: '2026-10-20', risk: 'will-fail' },
        { date: '2026-11-02', risk: 'will-fail', futureLimitFailure },
      ],
      status: { ...status, futureLimitFailure },
    }))

    expect(markup).toContain('Future limit failure')
    expect(markup).toContain('2026-11-02')
    expect(markup).toContain('cashout-future-limit')
    expect(markup).toContain('Allowed borrow')
    expect(markup).toContain('HK$8,000')
    expect(markup).toContain('HK$1,000')
  })

  it('wires app-open reminders and keeps browser permission behind an explicit action', () => {
    expect(cashoutCycleSource).toContain('getUpcomingPaymentReminders')
    expect(cashoutCycleSource).toContain('requestBrowserNotificationPermission')
    expect(cashoutCycleSource).toContain('notifyUpcomingPayments')
    expect(cashoutCycleSource).toContain("addEventListener('visibilitychange'")
    expect(cashoutCycleSource).toContain('CashoutReminderList')
    expect(settingsSource).toContain('onRequestNotificationPermission')
    expect(settingsSource).toContain('Request browser permission')
  })

  it('wires monthly Due Dates through the page loader, editor, prompt, and calendar', () => {
    expect(cashoutCycleSource).toContain('getDueDatePrompts')
    expect(cashoutCycleSource).toContain('createDueDate')
    expect(cashoutCycleSource).toContain('dueDates={dueDates}')
    expect(cashoutCycleSource).toContain('<CashoutDueDatePrompt')
  })
})