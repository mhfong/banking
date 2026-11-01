import { describe, expect, it } from 'vitest'
import {
  buildCashflowForecast,
  calculateCardCapacity,
  calculateLoopSummary,
  getLoopStatus,
  getSafeBorrowDate,
} from '../cashoutCalculations.js'

const card = {
  id: 'card-1',
  name: 'Primary card',
  totalCreditLimit: 20000,
  monthlyBorrowLimit: 20000,
  nextStatementDate: '2026-10-15',
  active: true,
}

const cashouts = [
  {
    id: 'cashout-0',
    cardId: 'card-1',
    amount: 5000,
    borrowedOn: '2026-09-05',
    expectedPaymentOn: '2026-10-05',
    expectedPaymentAmount: 5000,
    status: 'paid',
  },
  {
    id: 'cashout-1',
    cardId: 'card-1',
    amount: 10000,
    borrowedOn: '2026-10-05',
    expectedPaymentOn: '2026-11-05',
    expectedPaymentAmount: 10000,
    status: 'open',
  },
  {
    id: 'cashout-2',
    cardId: 'card-1',
    amount: 2000,
    borrowedOn: '2026-10-10',
    expectedPaymentOn: '2026-10-20',
    expectedPaymentAmount: 2000,
    status: 'paid',
  },
]

const payments = [
  { id: 'payment-0', cashoutId: 'cashout-0', amount: 5000, paidOn: '2026-09-20' },
  { id: 'payment-1', cashoutId: 'cashout-1', amount: 2500, paidOn: '2026-10-19' },
  { id: 'payment-2', cashoutId: 'cashout-2', amount: 2000, paidOn: '2026-10-18' },
]

const limitChanges = [
  {
    id: 'limit-change-1',
    cardId: 'card-1',
    effectiveOn: '2026-11-01',
    monthlyBorrowLimit: 8000,
  },
]

const settings = {
  salaryAmount: 10000,
  salaryDay: 28,
  salaryAdjustment: 'previousWorkingDay',
  protectedMonthlyBudget: 10000,
  startingCashReserve: 0,
  reminderDaysBefore: 3,
}

describe('cashout capacity calculations', () => {
  it('separates available credit from remaining monthly room after a partial payment', () => {
    const result = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf: '2026-10-19' })

    expect(result.availableCredit).toBe(12500)
    expect(result.monthlyRoom).toBe(8000)
    expect(result.maxNewBorrow).toBe(8000)
  })

  it('excludes future-dated cashouts from current capacity and summary balances', () => {
    const futureCashout = {
      id: 'cashout-future',
      cardId: 'card-1',
      amount: 5000,
      borrowedOn: '2026-10-25',
      expectedPaymentOn: '2026-11-25',
      status: 'planned',
    }
    const result = calculateCardCapacity({
      card,
      cashouts: [futureCashout],
      payments: [],
      asOf: '2026-10-19',
    })
    const summary = calculateLoopSummary({
      cards: [card],
      cashouts: [futureCashout],
      payments: [],
      settings,
      today: '2026-10-19',
    })

    expect(result.outstanding).toBe(0)
    expect(result.availableCredit).toBe(20000)
    expect(summary.outstanding).toBe(0)
    expect(summary.availableCredit).toBe(20000)
  })

  it('applies an announced lower limit on its effective date', () => {
    const result = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf: '2026-11-01' })

    expect(result.effectiveMonthlyBorrowLimit).toBe(8000)
    expect(result.monthlyRoom).toBe(8000)
  })

  it('counts gross borrowed, paid, and outstanding amounts independently', () => {
    const summary = calculateLoopSummary({
      cards: [card],
      cashouts,
      payments,
      limitChanges,
      settings,
      today: '2026-10-19',
    })

    expect(summary.grossBorrowed).toBe(17000)
    expect(summary.paidBack).toBe(9500)
    expect(summary.outstanding).toBe(7500)
    expect(summary.availableCredit).toBe(12500)
    expect(summary.monthlyRoom).toBe(8000)
  })

  it('excludes archived cards from capacity and next-borrow recommendations', () => {
    const activeCard = {
      ...card,
      id: 'active-card',
      totalCreditLimit: 1000,
      monthlyBorrowLimit: 1000,
    }
    const archivedCard = {
      ...card,
      id: 'archived-card',
      name: 'Archived card',
      totalCreditLimit: 50000,
      monthlyBorrowLimit: 50000,
      active: false,
    }

    const summary = calculateLoopSummary({
      cards: [archivedCard, activeCard],
      cashouts: [],
      payments: [],
      settings,
      today: '2026-10-19',
    })

    expect(summary.capacities).toHaveLength(1)
    expect(summary.availableCredit).toBe(1000)
    expect(summary.monthlyRoom).toBe(1000)
    expect(summary.bestNextBorrow.cardId).toBe('active-card')
  })

  it('resets monthly room on the first of the next month', () => {
    const result = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf: '2026-11-01' })

    expect(result.borrowedThisCycle).toBe(0)
    expect(result.monthlyRoom).toBe(8000)
  })

  it('restores available credit by the exact payment amount without reopening monthly room', () => {
    const beforePayment = calculateCardCapacity({
      card,
      cashouts,
      payments: payments.filter(payment => payment.id !== 'payment-1'),
      limitChanges,
      asOf: '2026-10-19',
    })
    const afterPayment = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf: '2026-10-19' })

    expect(afterPayment.availableCredit - beforePayment.availableCredit).toBe(2500)
    expect(afterPayment.monthlyRoom).toBe(beforePayment.monthlyRoom)
  })

  it('chooses the latest restriction when recommending a safe borrow date', () => {
    const result = getSafeBorrowDate({
      card,
      cashouts,
      payments: [
        ...payments,
        { id: 'payment-1-completion', cashoutId: 'cashout-1', amount: 7500, paidOn: '2026-10-19' },
      ],
      limitChanges,
      asOf: '2026-10-19',
    })

    expect(result.date).toBe('2026-11-01')
  })

  it('uses the card next statement date when recommending a safe borrow date', () => {
    const result = getSafeBorrowDate({
      card: { ...card, nextStatementDate: '2026-11-13' },
      cashouts: [],
      payments: [],
      limitChanges: [],
      asOf: '2026-10-19',
    })

    expect(result.date).toBe('2026-11-14')
  })

  it('rejects cards that do not have an explicit next statement date', () => {
    expect(() => getSafeBorrowDate({
      card: { ...card, nextStatementDate: undefined },
      cashouts: [],
      payments: [],
      limitChanges: [],
      asOf: '2026-10-19',
    })).toThrow(/next statement date/i)
  })

  it('does not recommend a new borrow while the previous cashout is unpaid', () => {
    const result = getSafeBorrowDate({
      card,
      cashouts,
      payments: payments.filter(payment => payment.id !== 'payment-2'),
      limitChanges,
      asOf: '2026-10-19',
    })

    expect(result.date).toBeNull()
    expect(result.reason).toMatch(/outstanding|paid/i)
  })

  it('blocks borrowing when an older cashout is unpaid behind a newer paid cashout', () => {
    const result = getSafeBorrowDate({
      asOf: '2026-10-19',
      card: { ...card, totalCreditLimit: 10000, monthlyBorrowLimit: 10000 },
      cashouts: [
        {
          id: 'cashout-older',
          cardId: 'card-1',
          amount: 1000,
          borrowedOn: '2026-09-01',
          expectedPaymentOn: '2026-10-01',
          expectedPaymentAmount: 1000,
          status: 'open',
        },
        {
          id: 'cashout-newer',
          cardId: 'card-1',
          amount: 1000,
          borrowedOn: '2026-10-01',
          expectedPaymentOn: '2026-11-01',
          expectedPaymentAmount: 1000,
          status: 'paid',
        },
      ],
      payments: [
        {
          id: 'payment-newer',
          cashoutId: 'cashout-newer',
          amount: 1000,
          paidOn: '2026-10-02',
        },
      ],
      limitChanges: [],
    })

    expect(result).toEqual({
      date: null,
      reason: 'The previous cashout is still outstanding.',
    })
  })
})

describe('cashout forecasts and loop status', () => {
  it('reports the first payment date and shortfall when salary arrives too late', () => {
    const result = buildCashflowForecast({
      cashouts: [
        {
          id: 'cashout-failure',
          cardId: 'card-1',
          amount: 10000,
          borrowedOn: '2026-10-01',
          expectedPaymentOn: '2026-11-05',
          expectedPaymentAmount: 10000,
          status: 'open',
        },
      ],
      payments: [],
      settings,
      cards: [card],
      today: '2026-10-19',
      horizonMonths: 2,
    })

    expect(result.firstFailure.date).toBe('2026-11-05')
    expect(result.firstFailure.shortfall).toBe(10000)
  })

  it('classifies a payment that drives projected cash below zero as will fail', () => {
    const result = buildCashflowForecast({
      cashouts: [
        {
          id: 'cashout-negative-cash',
          cardId: 'card-1',
          amount: 5000,
          borrowedOn: '2026-10-01',
          expectedPaymentOn: '2026-10-20',
          status: 'open',
        },
      ],
      payments: [],
      settings: { ...settings, salaryAmount: 0, protectedMonthlyBudget: 0, startingCashReserve: 1000 },
      cards: [card],
      today: '2026-10-19',
      horizonMonths: 1,
    })

    const status = getLoopStatus(result)

    expect(result.firstFailure).toMatchObject({
      date: '2026-10-20',
      shortfall: 4000,
    })
    expect(result.rows.find(row => row.date === '2026-10-20').projectedCash).toBe(-4000)
    expect(status.state).toBe('at-risk')
    expect(status.shortfall).toBe(4000)
  })

  it('classifies a negative cash buffer before payments with an explicit reason', () => {
    const result = buildCashflowForecast({
      cashouts: [],
      payments: [],
      settings: {
        salaryAmount: 0,
        protectedMonthlyBudget: 1000,
        startingCashReserve: 0,
        salaryDay: 28,
      },
      cards: [],
      today: '2026-10-19',
      horizonMonths: 1,
    })
    const status = getLoopStatus(result)

    expect(result.firstFailure).toMatchObject({
      date: '2026-10-28',
      kind: 'cash-buffer',
      reason: 'Projected cash is negative before payments.',
      shortfall: 1000,
    })
    expect(result.rows.find(row => row.date === '2026-10-28')).toMatchObject({
      projectedCashBeforePayments: -1000,
      projectedCash: -1000,
      risk: 'will-fail',
    })
    expect(status).toMatchObject({
      state: 'at-risk',
      shortfall: 1000,
      firstFailure: result.firstFailure,
    })
    expect(status.message).toContain('Projected cash is negative before payments.')
    expect(status.message).not.toContain('The payment on')
  })

  it('keeps a one-month horizon inside the intended calendar month at month end', () => {
    const result = buildCashflowForecast({
      cashouts: [],
      payments: [],
      settings: { ...settings, salaryAmount: 0, protectedMonthlyBudget: 0 },
      limitChanges: [
        { id: 'limit-at-horizon-end', cardId: 'card-1', effectiveOn: '2026-11-30', monthlyBorrowLimit: 9000 },
        { id: 'limit-after-horizon', cardId: 'card-1', effectiveOn: '2026-12-01', monthlyBorrowLimit: 8000 },
      ],
      cards: [card],
      today: '2026-10-31',
      horizonMonths: 1,
    })

    expect(result.rows.map(row => row.date)).toContain('2026-11-30')
    expect(result.rows.map(row => row.date)).not.toContain('2026-12-01')
  })

  it('returns a safe status when planned payments fit within projected cash', () => {
    const result = buildCashflowForecast({
      cashouts: [
        {
          id: 'cashout-safe',
          cardId: 'card-1',
          amount: 10000,
          borrowedOn: '2026-10-01',
          expectedPaymentOn: '2026-11-05',
          expectedPaymentAmount: 10000,
          status: 'open',
        },
      ],
      payments: [],
      settings: { ...settings, startingCashReserve: 10000 },
      cards: [card],
      today: '2026-10-19',
      horizonMonths: 2,
    })

    const status = getLoopStatus(result, [])

    expect(status.state).toBe('normal')
    expect(status.title).toBe('Normal')
    expect(status.firstFailure).toBeNull()
  })

  it('marks a future contingent cashout as at risk', () => {
    const result = buildCashflowForecast({
      cashouts: [
        {
          id: 'cashout-planned',
          cardId: 'card-1',
          amount: 5000,
          borrowedOn: '2026-10-25',
          expectedPaymentOn: '2026-12-05',
          expectedPaymentAmount: 5000,
          status: 'open',
        },
      ],
      payments: [],
      settings: { ...settings, startingCashReserve: 10000 },
      cards: [card],
      today: '2026-10-19',
      horizonMonths: 2,
    })

    const status = getLoopStatus(result, [])

    expect(result.rows.find(row => row.date === '2026-10-25').contingentBorrowing).toBe(5000)
    expect(status.state).toBe('at-risk')
    expect(status.title).toBe('At Risk')
  })

  it('marks an insufficient effective future limit as will fail', () => {
    const result = buildCashflowForecast({
      cashouts: [
        {
          id: 'cashout-limit-risk',
          cardId: 'card-1',
          amount: 9000,
          borrowedOn: '2026-11-02',
          expectedPaymentOn: '2026-12-05',
          expectedPaymentAmount: 9000,
          status: 'open',
        },
      ],
      payments: [],
      settings: { ...settings, startingCashReserve: 10000 },
      cards: [{ ...card, monthlyBorrowLimit: 20000 }],
      limitChanges: [{ cardId: 'card-1', effectiveOn: '2026-11-01', monthlyBorrowLimit: 8000 }],
      today: '2026-10-19',
      horizonMonths: 2,
    })

    const status = getLoopStatus(result, [{ cardId: 'card-1', effectiveOn: '2026-11-01', monthlyBorrowLimit: 8000 }])

    expect(result.futureLimitRisk).toBe(true)
    expect(result.futureLimitFailure).toMatchObject({
      kind: 'future-limit',
      date: '2026-11-02',
      cashoutId: 'cashout-limit-risk',
      cardId: 'card-1',
      cardName: 'Primary card',
      borrowAmount: 9000,
      availableBorrow: 8000,
      shortfall: 1000,
    })
    expect(result.firstFailure).toMatchObject(result.futureLimitFailure)
    expect(status.state).toBe('at-risk')
    expect(status.title).toBe('At Risk')
    expect(status.firstFailure).toMatchObject(result.futureLimitFailure)
    expect(status.shortfall).toBe(1000)
    expect(status.message).toContain('2026-11-02')
    expect(status.message).toContain('Primary card')
    expect(status.message).toContain('1000')
    expect(result.rows.find(row => row.date === '2026-11-02').risk).toBe('will-fail')
  })

  it('keeps a secondary future-limit failure when an earlier payment failure is primary', () => {
    const result = buildCashflowForecast({
      cashouts: [
        {
          id: 'cashout-payment-failure',
          cardId: 'card-1',
          amount: 5000,
          borrowedOn: '2026-10-01',
          expectedPaymentOn: '2026-10-20',
          status: 'open',
        },
        {
          id: 'cashout-future-limit',
          cardId: 'card-1',
          amount: 9000,
          borrowedOn: '2026-11-02',
          expectedPaymentOn: '2026-12-05',
          status: 'open',
        },
      ],
      payments: [],
      settings: { ...settings, salaryAmount: 0, protectedMonthlyBudget: 0, startingCashReserve: 1000 },
      cards: [{ ...card, monthlyBorrowLimit: 20000 }],
      limitChanges: [{ cardId: 'card-1', effectiveOn: '2026-11-01', monthlyBorrowLimit: 8000 }],
      today: '2026-10-19',
      horizonMonths: 2,
    })
    const status = getLoopStatus(result)
    const futureLimitRow = result.rows.find(row => row.date === '2026-11-02')

    expect(result.firstFailure).toMatchObject({
      date: '2026-10-20',
      cashoutId: 'cashout-payment-failure',
      shortfall: 4000,
    })
    expect(result.futureLimitFailure).toMatchObject({
      kind: 'future-limit',
      date: '2026-11-02',
      cashoutId: 'cashout-future-limit',
      cardId: 'card-1',
      borrowAmount: 9000,
      availableBorrow: 8000,
      shortfall: 1000,
    })
    expect(futureLimitRow.futureLimitFailure).toMatchObject(result.futureLimitFailure)
    expect(status).toMatchObject({
      state: 'at-risk',
      firstFailure: result.firstFailure,
      futureLimitFailure: result.futureLimitFailure,
      shortfall: 4000,
    })
  })

  it('evaluates same-day planned borrows cumulatively and deterministically', () => {
    const sameDayCashouts = [
      {
        id: 'cashout-b',
        cardId: 'card-1',
        amount: 6000,
        borrowedOn: '2026-11-02',
        expectedPaymentOn: '2026-12-05',
        status: 'open',
      },
      {
        id: 'cashout-a',
        cardId: 'card-1',
        amount: 6000,
        borrowedOn: '2026-11-02',
        expectedPaymentOn: '2026-12-05',
        status: 'open',
      },
    ]
    const buildResult = cashouts => buildCashflowForecast({
      cashouts,
      payments: [],
      settings: { ...settings, salaryAmount: 0, protectedMonthlyBudget: 0 },
      cards: [{ ...card, monthlyBorrowLimit: 10000 }],
      limitChanges: [],
      today: '2026-10-19',
      horizonMonths: 2,
    })

    const result = buildResult(sameDayCashouts)
    const reversedResult = buildResult([...sameDayCashouts].reverse())

    expect(result.futureLimitFailure).toMatchObject({
      cashoutId: 'cashout-b',
      availableBorrow: 4000,
      shortfall: 2000,
    })
    expect(reversedResult.futureLimitFailure).toMatchObject(result.futureLimitFailure)
  })
})