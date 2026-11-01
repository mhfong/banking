import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getUpcomingPaymentReminders,
  notifyUpcomingPayments,
  requestBrowserNotificationPermission,
} from '../reminders.js'
import { getHongKongHolidayCalendar } from '../hongKongWorkingDays.js'

const { holidaySet } = getHongKongHolidayCalendar([2026])

const cards = [
  { id: 'card-1', name: 'Primary card' },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cashout payment reminders', () => {
  it('subtracts calendar days and adjusts the reminder backward over a weekend', () => {
    const reminders = getUpcomingPaymentReminders({
      cards,
      cashouts: [{
        id: 'cashout-1',
        cardId: 'card-1',
        amount: 5000,
        expectedPaymentOn: '2026-10-06',
        status: 'open',
      }],
      payments: [],
      today: '2026-10-02',
      daysBefore: 3,
      holidaySet,
    })

    expect(reminders).toEqual([
      expect.objectContaining({
        cashoutId: 'cashout-1',
        cardName: 'Primary card',
        reminderDate: '2026-10-02',
        expectedPaymentOn: '2026-10-06',
        amount: 5000,
        status: 'due-soon',
      }),
    ])
  })

  it('adjusts a reminder backward over a public holiday after subtraction', () => {
    const reminders = getUpcomingPaymentReminders({
      cards,
      cashouts: [{
        id: 'cashout-holiday',
        cardId: 'card-1',
        amount: 5000,
        expectedPaymentOn: '2026-10-04',
        status: 'open',
      }],
      payments: [],
      today: '2026-09-30',
      daysBefore: 3,
      holidaySet,
    })

    expect(reminders[0].reminderDate).toBe('2026-09-30')
  })

  it('excludes fully paid cashouts and uses the remaining balance for partial payments', () => {
    const reminders = getUpcomingPaymentReminders({
      cards,
      cashouts: [
        {
          id: 'cashout-paid',
          cardId: 'card-1',
          amount: 4000,
          expectedPaymentOn: '2026-10-06',
          status: 'paid',
        },
        {
          id: 'cashout-partial',
          cardId: 'card-1',
          amount: 6000,
          expectedPaymentOn: '2026-10-06',
          status: 'open',
        },
      ],
      payments: [
        { id: 'payment-paid', cashoutId: 'cashout-paid', amount: 4000, paidOn: '2026-09-30' },
        { id: 'payment-partial', cashoutId: 'cashout-partial', amount: 1000, paidOn: '2026-09-30' },
      ],
      today: '2026-10-02',
      daysBefore: 3,
      holidaySet,
    })

    expect(reminders).toEqual([
      expect.objectContaining({
        cashoutId: 'cashout-partial',
        amount: 5000,
      }),
    ])
  })
})

describe('browser payment notifications', () => {
  it('does not attempt a notification when permission is denied or unsupported', () => {
    const notification = vi.fn()
    vi.stubGlobal('Notification', notification)
    const reminders = [{
      cashoutId: 'cashout-1',
      cardName: 'Primary card',
      amount: 5000,
      expectedPaymentOn: '2026-10-06',
    }]

    expect(notifyUpcomingPayments(reminders, 'denied')).toEqual([])
    expect(notifyUpcomingPayments(reminders, 'unsupported')).toEqual([])
    expect(notification).not.toHaveBeenCalled()
  })

  it('returns unsupported permission without throwing when the browser API is absent', async () => {
    expect(await requestBrowserNotificationPermission()).toBe('unsupported')
  })
})