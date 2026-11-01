import {
  compareDateOnly,
  getReminderDate,
  parseDateOnly,
} from './hongKongWorkingDays.js'

function asAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function getPaidAmount(cashoutId, payments, today) {
  return (payments ?? []).reduce((total, payment) => {
    if (payment.cashoutId !== cashoutId) return total
    if (payment.paidOn && compareDateOnly(payment.paidOn, today) > 0) return total
    return total + asAmount(payment.amount)
  }, 0)
}

function formatAmount(value) {
  return `HK$${asAmount(value).toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`
}

export function getUpcomingPaymentReminders({
  cards = [],
  cashouts = [],
  payments = [],
  today,
  daysBefore = 3,
  holidaySet = new Set(),
}) {
  parseDateOnly(today)
  const cardsById = new Map(cards.map(card => [card.id, card]))
  const reminders = []

  for (const cashout of cashouts) {
    if (!cashout?.id || !cashout.expectedPaymentOn) continue
    if (compareDateOnly(cashout.expectedPaymentOn, today) < 0) continue

    const paidAmount = getPaidAmount(cashout.id, payments, today)
    const remainingAmount = Math.max(0, asAmount(cashout.amount) - paidAmount)
    if (cashout.status === 'paid' || remainingAmount <= 0) continue

    const reminderDate = getReminderDate(cashout.expectedPaymentOn, daysBefore, holidaySet)
    if (compareDateOnly(today, reminderDate) < 0) continue

    const card = cardsById.get(cashout.cardId)
    const isDueToday = compareDateOnly(cashout.expectedPaymentOn, today) === 0
    reminders.push({
      cashoutId: cashout.id,
      cardId: cashout.cardId ?? null,
      cardName: cashout.cardName ?? card?.name ?? cashout.cardId ?? 'Cashout',
      reminderDate,
      expectedPaymentOn: cashout.expectedPaymentOn,
      amount: remainingAmount,
      status: isDueToday ? 'due-today' : 'due-soon',
    })
  }

  return reminders.sort((left, right) => (
    compareDateOnly(left.expectedPaymentOn, right.expectedPaymentOn)
    || compareDateOnly(left.reminderDate, right.reminderDate)
    || left.cashoutId.localeCompare(right.cashoutId)
  ))
}

export async function requestBrowserNotificationPermission() {
  const NotificationApi = globalThis.Notification
  if (!NotificationApi || typeof NotificationApi.requestPermission !== 'function') {
    return 'unsupported'
  }

  try {
    const permission = await NotificationApi.requestPermission()
    return ['granted', 'denied', 'default'].includes(permission) ? permission : 'unsupported'
  } catch {
    return 'unsupported'
  }
}

export function notifyUpcomingPayments(reminders = [], permissionState) {
  if (permissionState !== 'granted' || !Array.isArray(reminders)) return []

  const NotificationApi = globalThis.Notification
  if (typeof NotificationApi !== 'function') return []
  if (
    typeof document !== 'undefined'
    && document.visibilityState
    && document.visibilityState !== 'visible'
  ) {
    return []
  }

  const sent = []
  for (const reminder of reminders) {
    if (!reminder?.cashoutId) continue

    try {
      new NotificationApi('Cashout payment reminder', {
        body: `${reminder.cardName ?? 'Cashout'}: ${formatAmount(reminder.amount)} due on ${reminder.expectedPaymentOn}.`,
        tag: `cashout-payment-${reminder.cashoutId}`,
      })
      sent.push(reminder)
    } catch {
      // Notification failures must not block the Cashout Cycle page.
    }
  }

  return sent
}