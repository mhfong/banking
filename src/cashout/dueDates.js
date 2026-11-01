import {
  addDateDays,
  compareDateOnly,
  parseDateOnly,
} from './hongKongWorkingDays.js'

function getLatestRecord(records, dateKey) {
  return records
    .filter(record => record?.[dateKey])
    .sort((left, right) => compareDateOnly(right[dateKey], left[dateKey]))[0] ?? null
}

export function getMonthlyDueDate({
  cardId,
  month,
  cashouts = [],
  dueDates = [],
}) {
  const manualDueDate = getLatestRecord(
    dueDates.filter(dueDate => (
      dueDate?.cardId === cardId
      && dueDate.dueOn?.slice(0, 7) === month
    )),
    'dueOn',
  )
  if (manualDueDate) {
    return { id: manualDueDate.id ?? null, dueOn: manualDueDate.dueOn }
  }

  const cashout = getLatestRecord(
    cashouts.filter(cashout => (
      cashout?.cardId === cardId
      && cashout.expectedPaymentOn?.slice(0, 7) === month
    )),
    'expectedPaymentOn',
  )
  return { id: null, dueOn: cashout?.expectedPaymentOn ?? '' }
}

export function getDueDatePrompts({
  cards = [],
  cashouts = [],
  dueDates = [],
  today,
}) {
  parseDateOnly(today)
  const latestDueDates = new Map()

  for (const cashout of cashouts) {
    if (!cashout?.cardId || !cashout.expectedPaymentOn) continue
    const current = latestDueDates.get(cashout.cardId)
    if (!current || compareDateOnly(cashout.expectedPaymentOn, current) > 0) {
      latestDueDates.set(cashout.cardId, cashout.expectedPaymentOn)
    }
  }

  for (const dueDate of dueDates) {
    if (!dueDate?.cardId || !dueDate.dueOn) continue
    const current = latestDueDates.get(dueDate.cardId)
    if (!current || compareDateOnly(dueDate.dueOn, current) > 0) {
      latestDueDates.set(dueDate.cardId, dueDate.dueOn)
    }
  }

  return cards
    .filter(card => card?.id && card.active !== false)
    .map(card => ({
      card,
      currentDueOn: latestDueDates.get(card.id),
    }))
    .filter(({ currentDueOn }) => currentDueOn && compareDateOnly(currentDueOn, today) <= 0)
    .map(({ card, currentDueOn }) => ({
      cardId: card.id,
      cardName: card.name || 'Unnamed card',
      currentDueOn,
      suggestedDueOn: addDateDays(currentDueOn, 2),
    }))
    .sort((left, right) => (
      compareDateOnly(left.currentDueOn, right.currentDueOn)
      || left.cardName.localeCompare(right.cardName)
      || left.cardId.localeCompare(right.cardId)
    ))
}