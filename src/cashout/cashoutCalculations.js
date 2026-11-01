import {
  addDateDays,
  compareDateOnly,
  formatDateOnly,
  getDaysInMonth,
  getHongKongHolidayCalendar,
  getMonthStart,
  getNextMonthStart,
  getSalaryDate,
  parseDateOnly,
} from './hongKongWorkingDays.js'

const DEFAULT_HORIZON_MONTHS = 3

const asAmount = value => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

const getCardId = card => card?.id ?? card?.cardId
const isActiveCard = card => card?.active !== false

const isOnOrBefore = (left, right) => compareDateOnly(left, right) <= 0
const isOnOrAfter = (left, right) => compareDateOnly(left, right) >= 0

function getCashoutsForCard(card, cashouts, asOf) {
  const cardId = getCardId(card)
  return (cashouts ?? []).filter(cashout => (
    cashout.cardId === cardId
    && (!cashout.borrowedOn || isOnOrBefore(cashout.borrowedOn, asOf))
  ))
}

function getPaymentMap(payments, asOf) {
  const paymentMap = new Map()
  for (const payment of payments ?? []) {
    if (asOf && payment.paidOn && !isOnOrBefore(payment.paidOn, asOf)) {
      continue
    }
    paymentMap.set(
      payment.cashoutId,
      (paymentMap.get(payment.cashoutId) ?? 0) + asAmount(payment.amount),
    )
  }
  return paymentMap
}

function getCashoutRemaining(cashout, paymentMap) {
  return Math.max(0, asAmount(cashout.amount) - (paymentMap.get(cashout.id) ?? 0))
}

function getFullyPaidDate(cashout, payments, asOf) {
  let paidAmount = 0
  const relevantPayments = (payments ?? [])
    .filter(payment => payment.cashoutId === cashout.id)
    .filter(payment => !asOf || !payment.paidOn || isOnOrBefore(payment.paidOn, asOf))
    .sort((left, right) => compareDateOnly(left.paidOn, right.paidOn))

  for (const payment of relevantPayments) {
    paidAmount += asAmount(payment.amount)
    if (paidAmount >= asAmount(cashout.amount)) {
      return payment.paidOn
    }
  }

  return null
}

function getEffectiveMonthlyBorrowLimit(card, limitChanges, asOf) {
  const cardId = getCardId(card)
  const effectiveChange = (limitChanges ?? [])
    .filter(change => change.cardId === cardId && isOnOrBefore(change.effectiveOn, asOf))
    .sort((left, right) => compareDateOnly(left.effectiveOn, right.effectiveOn))
    .at(-1)

  return effectiveChange
    ? asAmount(effectiveChange.monthlyBorrowLimit)
    : asAmount(card.monthlyBorrowLimit)
}

function getLatestCashout(cashouts, asOf) {
  return cashouts
    .filter(cashout => isOnOrBefore(cashout.borrowedOn, asOf))
    .sort((left, right) => compareDateOnly(left.borrowedOn, right.borrowedOn))
    .at(-1)
}

function getLatestOutstandingCashout(cashouts, paymentMap, asOf) {
  return getLatestCashout(
    cashouts.filter(cashout => getCashoutRemaining(cashout, paymentMap) > 0),
    asOf,
  )
}

function getNextStatementDate(asOf, nextStatementDate) {
  parseDateOnly(asOf)
  if (!nextStatementDate) {
    throw new RangeError('Card next statement date is required. Edit the card with its next known statement date.')
  }
  parseDateOnly(nextStatementDate)
  return nextStatementDate
}

function getNextRenewalDate(asOf) {
  return asOf.endsWith('-01') ? asOf : getNextMonthStart(asOf)
}

function getPaymentTotals(cashouts, payments, asOf) {
  const paymentMap = getPaymentMap(payments, asOf)
  const outstanding = cashouts.reduce(
    (total, cashout) => total + getCashoutRemaining(cashout, paymentMap),
    0,
  )
  return { paymentMap, outstanding }
}

export function calculateCardCapacity({
  card,
  cashouts = [],
  payments = [],
  limitChanges = [],
  asOf,
}) {
  parseDateOnly(asOf)
  const cardCashouts = getCashoutsForCard(card, cashouts, asOf)
  const { paymentMap, outstanding } = getPaymentTotals(cardCashouts, payments, asOf)
  const availableCredit = asAmount(card.totalCreditLimit) - outstanding
  const cycleStart = getMonthStart(asOf)
  const borrowedThisCycle = cardCashouts.reduce((total, cashout) => {
    if (isOnOrAfter(cashout.borrowedOn, cycleStart) && isOnOrBefore(cashout.borrowedOn, asOf)) {
      return total + asAmount(cashout.amount)
    }
    return total
  }, 0)
  const effectiveMonthlyBorrowLimit = getEffectiveMonthlyBorrowLimit(card, limitChanges, asOf)
  const monthlyRoom = effectiveMonthlyBorrowLimit - borrowedThisCycle
  const maxNewBorrow = Math.max(0, Math.min(availableCredit, monthlyRoom))
  const previousCashoutRecord = getLatestOutstandingCashout(cardCashouts, paymentMap, asOf)
    ?? getLatestCashout(cardCashouts, asOf)
  const previousCashout = previousCashoutRecord
    ? {
      ...previousCashoutRecord,
      paidAmount: paymentMap.get(previousCashoutRecord.id) ?? 0,
      remaining: getCashoutRemaining(previousCashoutRecord, paymentMap),
      fullyPaidOn: getFullyPaidDate(previousCashoutRecord, payments, asOf),
    }
    : null
  let status = 'available'

  if (availableCredit <= 0) {
    status = 'credit-limit'
  } else if (monthlyRoom <= 0) {
    status = 'monthly-limit'
  } else if (previousCashout?.remaining > 0) {
    status = 'awaiting-payment'
  }

  return {
    outstanding,
    availableCredit,
    borrowedThisCycle,
    effectiveMonthlyBorrowLimit,
    monthlyRoom,
    maxNewBorrow,
    previousCashout,
    status,
  }
}

export function getSafeBorrowDate({
  asOf,
  card,
  cashouts = [],
  payments = [],
  limitChanges = [],
}) {
  const capacity = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf })
  if (capacity.availableCredit <= 0) {
    return { date: null, reason: 'The card has no available credit.' }
  }
  if (capacity.previousCashout?.remaining > 0) {
    return { date: null, reason: 'The previous cashout is still outstanding.' }
  }

  const nextStatementDate = getNextStatementDate(asOf, card.nextStatementDate)
  const candidateDates = [
    getNextRenewalDate(asOf),
    capacity.previousCashout?.fullyPaidOn ?? asOf,
    addDateDays(nextStatementDate, 1),
    asOf,
  ]
  const date = candidateDates.reduce((latest, candidate) => (
    compareDateOnly(candidate, latest) > 0 ? candidate : latest
  ))
  const futureCapacity = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf: date })

  if (futureCapacity.maxNewBorrow <= 0) {
    return { date: null, reason: `No monthly borrowing room is available on ${date}.` }
  }

  return { date, reason: `Safe to borrow from ${date}.` }
}

function getCashoutBalances(cashouts, payments, asOf) {
  const paymentMap = getPaymentMap(payments, asOf)
  return new Map(cashouts.map(cashout => [cashout.id, getCashoutRemaining(cashout, paymentMap)]))
}

function getForecastYears(today, horizonEnd, cashouts) {
  const years = new Set([Number(today.slice(0, 4)), Number(horizonEnd.slice(0, 4))])
  for (const cashout of cashouts) {
    if (cashout.expectedPaymentOn) years.add(Number(cashout.expectedPaymentOn.slice(0, 4)))
    if (cashout.borrowedOn) years.add(Number(cashout.borrowedOn.slice(0, 4)))
  }
  return [...years]
}

function addMonth(dateString) {
  return getNextMonthStart(dateString)
}

function addCalendarMonths(dateString, months) {
  const date = parseDateOnly(dateString)
  const targetMonthIndex = date.getUTCMonth() + months
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12)
  const targetMonth = targetMonthIndex % 12
  const targetDay = Math.min(date.getUTCDate(), getDaysInMonth(targetYear, targetMonth))
  return formatDateOnly(new Date(Date.UTC(targetYear, targetMonth, targetDay)))
}

function addEvent(eventMap, date, event) {
  if (!eventMap.has(date)) {
    eventMap.set(date, {
      date,
      salary: 0,
      reservedBudget: 0,
      actualPayments: 0,
      plannedPayments: 0,
      contingentBorrowing: 0,
      paymentObligations: [],
      actualPaymentDetails: [],
      contingentDetails: [],
      limitChanges: [],
    })
  }

  const row = eventMap.get(date)
  if (event.salary) row.salary += event.salary
  if (event.reservedBudget) row.reservedBudget += event.reservedBudget
  if (event.actualPayment) row.actualPayments += event.actualPayment
  if (event.plannedPayment) row.plannedPayments += event.plannedPayment
  if (event.contingentBorrowing) row.contingentBorrowing += event.contingentBorrowing
  if (event.paymentObligation) row.paymentObligations.push(event.paymentObligation)
  if (event.actualPaymentDetail) row.actualPaymentDetails.push(event.actualPaymentDetail)
  if (event.contingentDetail) row.contingentDetails.push(event.contingentDetail)
  if (event.limitChange) row.limitChanges.push(event.limitChange)
}

function getCardById(cards, cardId) {
  return (cards ?? []).find(card => getCardId(card) === cardId)
}

function getFutureLimitRisk({ cashouts, payments, cards, limitChanges, today, horizonEnd }) {
  const plannedCashouts = cashouts.filter(cashout => (
    cashout.borrowedOn
    && isOnOrAfter(cashout.borrowedOn, today)
    && compareDateOnly(cashout.borrowedOn, horizonEnd) <= 0
  )).sort((left, right) => (
    compareDateOnly(left.borrowedOn, right.borrowedOn)
    || String(left.id ?? '').localeCompare(String(right.id ?? ''))
  ))
  const missingCardIds = new Set()
  const acceptedPlannedCashoutIds = new Set()

  for (const cashout of plannedCashouts) {
    const card = getCardById(cards, cashout.cardId)
    if (!card || !isActiveCard(card)) {
      missingCardIds.add(cashout.cardId)
      continue
    }

    const priorCashouts = cashouts.filter(candidate => (
      candidate.id !== cashout.id
      && candidate.cardId === cashout.cardId
      && (
        !candidate.borrowedOn
        || compareDateOnly(candidate.borrowedOn, cashout.borrowedOn) < 0
        || (
          compareDateOnly(candidate.borrowedOn, cashout.borrowedOn) === 0
          && acceptedPlannedCashoutIds.has(candidate.id)
        )
      )
    ))
    const capacity = calculateCardCapacity({
      card,
      cashouts: priorCashouts,
      payments,
      limitChanges,
      asOf: cashout.borrowedOn,
    })
    if (asAmount(cashout.amount) > capacity.maxNewBorrow) {
      const borrowAmount = asAmount(cashout.amount)
      const shortfall = borrowAmount - capacity.maxNewBorrow
      return {
        futureLimitRisk: true,
        futureLimitFailure: {
          kind: 'future-limit',
          date: cashout.borrowedOn,
          cashoutId: cashout.id,
          cardId: cashout.cardId,
          cardName: card.name,
          borrowAmount,
          availableBorrow: capacity.maxNewBorrow,
          effectiveMonthlyBorrowLimit: capacity.effectiveMonthlyBorrowLimit,
          monthlyRoom: capacity.monthlyRoom,
          availableCredit: capacity.availableCredit,
          shortfall,
          reason: `The planned borrow on ${cashout.borrowedOn} for ${card.name ?? cashout.cardId} exceeds the available effective borrowing room.`,
        },
        missingCardIds: [...missingCardIds],
      }
    }
    acceptedPlannedCashoutIds.add(cashout.id)
  }

  return { futureLimitRisk: false, futureLimitFailure: null, missingCardIds: [...missingCardIds] }
}

function getSalaryEvents({ today, horizonEnd, settings, holidaySet }) {
  const events = []
  let month = getMonthStart(today)

  while (compareDateOnly(month, horizonEnd) <= 0) {
    const date = parseDateOnly(month)
    const salaryDate = getSalaryDate(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      settings,
      holidaySet,
    )
    if (isOnOrAfter(salaryDate, today) && isOnOrBefore(salaryDate, horizonEnd)) {
      events.push({
        date: salaryDate,
        salary: asAmount(settings.salaryAmount),
        reservedBudget: asAmount(settings.protectedMonthlyBudget),
      })
    }
    month = addMonth(month)
  }

  return events
}

export function calculateLoopSummary({
  cards = [],
  cashouts = [],
  payments = [],
  limitChanges = [],
  settings = {},
  today,
}) {
  parseDateOnly(today)
  const currentCashouts = cashouts.filter(cashout => (
    !cashout.borrowedOn || isOnOrBefore(cashout.borrowedOn, today)
  ))
  const paymentMap = getPaymentMap(payments, today)
  const grossBorrowed = currentCashouts.reduce((total, cashout) => total + asAmount(cashout.amount), 0)
  const paidBack = payments.reduce((total, payment) => {
    if (payment.paidOn && !isOnOrBefore(payment.paidOn, today)) return total
    return total + asAmount(payment.amount)
  }, 0)
  const outstanding = currentCashouts.reduce(
    (total, cashout) => total + getCashoutRemaining(cashout, paymentMap),
    0,
  )
  const activeCards = cards.filter(isActiveCard)
  const capacities = activeCards.map(card => calculateCardCapacity({
    card,
    cashouts,
    payments,
    limitChanges,
    asOf: today,
  }))
  const availableCredit = capacities.reduce((total, capacity) => total + Math.max(0, capacity.availableCredit), 0)
  const monthlyRoom = capacities.reduce((total, capacity) => total + Math.max(0, capacity.monthlyRoom), 0)
  const dueSoonDays = Number(settings.dueSoonDays ?? settings.reminderDaysBefore ?? 7)
  const dueSoonEnd = addDateDays(today, Number.isFinite(dueSoonDays) ? dueSoonDays : 7)
  const dueSoonTotal = currentCashouts.reduce((total, cashout) => {
    const remaining = getCashoutRemaining(cashout, paymentMap)
    if (
      remaining > 0
      && cashout.expectedPaymentOn
      && isOnOrAfter(cashout.expectedPaymentOn, today)
      && isOnOrBefore(cashout.expectedPaymentOn, dueSoonEnd)
    ) {
      return total + remaining
    }
    return total
  }, 0)
  const nextBorrowOptions = activeCards
    .map(card => {
      const safeDate = getSafeBorrowDate({ card, cashouts, payments, limitChanges, asOf: today })
      if (!safeDate.date) return null
      const futureCapacity = calculateCardCapacity({
        card,
        cashouts,
        payments,
        limitChanges,
        asOf: safeDate.date,
      })
      return {
        cardId: getCardId(card),
        cardName: card.name,
        date: safeDate.date,
        amount: futureCapacity.maxNewBorrow,
        maxNewBorrow: futureCapacity.maxNewBorrow,
        reason: safeDate.reason,
      }
    })
    .filter(Boolean)
    .sort((left, right) => (
      compareDateOnly(left.date, right.date) || right.maxNewBorrow - left.maxNewBorrow
    ))

  return {
    grossBorrowed,
    paidBack,
    outstanding,
    availableCredit,
    monthlyRoom,
    dueSoonTotal,
    bestNextBorrow: nextBorrowOptions[0] ?? null,
    capacities,
  }
}

export function buildCashflowForecast({
  cashouts = [],
  payments = [],
  settings = {},
  limitChanges = [],
  cards = [],
  today,
  horizonMonths = DEFAULT_HORIZON_MONTHS,
}) {
  parseDateOnly(today)
  const horizon = Number(horizonMonths)
  if (!Number.isInteger(horizon) || horizon < 0) {
    throw new RangeError(`Invalid forecast horizon: ${horizonMonths}`)
  }
  const horizonEnd = addCalendarMonths(today, horizon)
  const { holidaySet, missingYears } = getHongKongHolidayCalendar(
    getForecastYears(today, horizonEnd, cashouts),
  )
  const eventMap = new Map()
  const balances = getCashoutBalances(cashouts, payments, today)

  for (const event of getSalaryEvents({ today, horizonEnd, settings, holidaySet })) {
    addEvent(eventMap, event.date, event)
  }

  for (const payment of payments) {
    if (
      payment.paidOn
      && isOnOrAfter(payment.paidOn, today)
      && isOnOrBefore(payment.paidOn, horizonEnd)
    ) {
      const amount = asAmount(payment.amount)
      addEvent(eventMap, payment.paidOn, {
        actualPayment: amount,
        actualPaymentDetail: {
          paymentId: payment.id,
          cashoutId: payment.cashoutId,
          amount,
        },
      })
    }
  }

  for (const cashout of cashouts) {
    const remaining = balances.get(cashout.id) ?? 0
    if (remaining <= 0 || !cashout.expectedPaymentOn) continue
    const paymentTotalAtDue = (payments ?? [])
      .filter(payment => payment.cashoutId === cashout.id)
      .filter(payment => isOnOrBefore(payment.paidOn, cashout.expectedPaymentOn))
      .reduce((total, payment) => total + asAmount(payment.amount), 0)
    const plannedPayment = Math.max(0, asAmount(cashout.amount) - paymentTotalAtDue)
    const paymentDate = isOnOrBefore(cashout.expectedPaymentOn, today)
      ? today
      : cashout.expectedPaymentOn
    if (
      plannedPayment > 0
      && isOnOrAfter(paymentDate, today)
      && isOnOrBefore(paymentDate, horizonEnd)
    ) {
      addEvent(eventMap, paymentDate, {
        plannedPayment,
        paymentObligation: {
          cashoutId: cashout.id,
          cardId: cashout.cardId,
          amount: plannedPayment,
          expectedPaymentOn: cashout.expectedPaymentOn,
        },
      })
    }
  }

  for (const cashout of cashouts) {
    if (
      cashout.borrowedOn
      && compareDateOnly(cashout.borrowedOn, today) > 0
      && isOnOrBefore(cashout.borrowedOn, horizonEnd)
    ) {
      addEvent(eventMap, cashout.borrowedOn, {
        contingentBorrowing: asAmount(cashout.amount),
        contingentDetail: {
          cashoutId: cashout.id,
          cardId: cashout.cardId,
          amount: asAmount(cashout.amount),
        },
      })
    }
  }

  for (const change of limitChanges) {
    if (
      change.effectiveOn
      && isOnOrAfter(change.effectiveOn, today)
      && isOnOrBefore(change.effectiveOn, horizonEnd)
    ) {
      addEvent(eventMap, change.effectiveOn, { limitChange: change })
    }
  }

  const futureLimit = getFutureLimitRisk({
    cashouts,
    payments,
    cards,
    limitChanges,
    today,
    horizonEnd,
  })
  const orderedRows = [...eventMap.values()].sort((left, right) => compareDateOnly(left.date, right.date))
  let projectedCash = asAmount(settings.startingCashReserve)
  let firstFailure = null

  for (const row of orderedRows) {
    row.projectedCashBeforeDate = projectedCash
    projectedCash += row.salary - row.reservedBudget
    row.projectedCashBeforePayments = projectedCash
    const outflows = [
      ...row.actualPaymentDetails.map(payment => ({ ...payment, kind: 'actual' })),
      ...row.paymentObligations.map(payment => ({ ...payment, kind: 'planned' })),
    ]
    if (!firstFailure && projectedCash < 0) {
      firstFailure = {
        date: row.date,
        kind: 'cash-buffer',
        reason: 'Projected cash is negative before payments.',
        projectedCashBeforePayments: projectedCash,
        shortfall: -projectedCash,
      }
    }
    let cashBeforePayment = projectedCash
    for (const payment of outflows) {
      const projectedCashAfterPayment = cashBeforePayment - payment.amount
      if (!firstFailure && projectedCashAfterPayment < 0) {
        firstFailure = {
          date: row.date,
          cashoutId: payment.cashoutId,
          cardId: payment.cardId,
          paymentAmount: payment.amount,
          projectedCashBeforePayment: cashBeforePayment,
          shortfall: -projectedCashAfterPayment,
        }
      }
      cashBeforePayment = projectedCashAfterPayment
    }
    projectedCash = cashBeforePayment
    row.projectedCash = projectedCash
    const rowFutureLimitFailure = futureLimit.futureLimitFailure?.date === row.date
      ? futureLimit.futureLimitFailure
      : null
    const rowFailure = [firstFailure, futureLimit.futureLimitFailure]
      .find(failure => failure?.date === row.date)
    row.risk = rowFailure
      ? 'will-fail'
      : row.contingentBorrowing > 0
        ? 'at-risk'
        : 'safe'
    row.riskMetadata = {
      hasContingentBorrowing: row.contingentBorrowing > 0,
      hasPaymentFailure: firstFailure?.date === row.date,
      hasFutureLimitFailure: Boolean(rowFutureLimitFailure),
      futureLimitFailure: rowFutureLimitFailure,
      missingYears,
    }
    row.futureLimitFailure = rowFutureLimitFailure
  }

  const hasContingentBorrowing = orderedRows.some(row => row.contingentBorrowing > 0)
  const primaryFailure = firstFailure ?? futureLimit.futureLimitFailure
  return {
    rows: orderedRows,
    firstFailure: primaryFailure,
    futureLimitFailure: futureLimit.futureLimitFailure,
    shortfall: primaryFailure?.shortfall ?? 0,
    projectedCash: orderedRows.at(-1)?.projectedCash ?? asAmount(settings.startingCashReserve),
    hasContingentBorrowing,
    futureLimitRisk: futureLimit.futureLimitRisk,
    missingCardIds: futureLimit.missingCardIds,
    missingYears,
    riskMetadata: {
      hasContingentBorrowing,
      futureLimitRisk: futureLimit.futureLimitRisk,
      futureLimitFailure: futureLimit.futureLimitFailure,
      missingCardIds: futureLimit.missingCardIds,
      missingYears,
    },
  }
}

export function getLoopStatus(forecast, _limitChanges = []) {
  const normalizedForecast = Array.isArray(forecast) ? { rows: forecast } : forecast ?? { rows: [] }
  const rows = normalizedForecast.rows ?? []
  const futureLimitFailure = normalizedForecast.futureLimitFailure ?? (
    normalizedForecast.futureLimitRisk
      ? {
        kind: 'future-limit',
        date: normalizedForecast.futureLimitDate ?? null,
        cashoutId: normalizedForecast.futureLimitCashoutId ?? null,
        cardId: normalizedForecast.futureLimitCardId ?? null,
        cardName: normalizedForecast.futureLimitCardName ?? null,
        borrowAmount: normalizedForecast.futureLimitBorrowAmount ?? null,
        availableBorrow: normalizedForecast.futureLimitAvailableBorrow ?? null,
        shortfall: normalizedForecast.futureLimitShortfall ?? 0,
        reason: 'A planned future borrow exceeds the available effective borrowing room.',
      }
      : null
  )
  const firstFailure = normalizedForecast.firstFailure ?? futureLimitFailure ?? rows
    .flatMap(row => row.failure ? [row.failure] : [])
    .at(0) ?? null
  const shortfall = firstFailure?.shortfall ?? normalizedForecast.shortfall ?? 0

  if (firstFailure) {
    const message = firstFailure.kind === 'cash-buffer' || firstFailure.kind === 'future-limit'
      ? `${firstFailure.reason} Shortfall: ${shortfall}.`
      : `The payment on ${firstFailure.date} is short by ${shortfall}.`
    return {
      state: 'at-risk',
      title: 'At Risk',
      message,
      firstFailure,
      shortfall,
      futureLimitFailure,
    }
  }

  if (normalizedForecast.futureLimitRisk) {
    return {
      state: 'at-risk',
      title: 'At Risk',
      message: 'A planned future borrow exceeds the effective monthly borrowing limit.',
      firstFailure: futureLimitFailure,
      shortfall: futureLimitFailure?.shortfall ?? 0,
      futureLimitFailure,
    }
  }

  if (
    normalizedForecast.hasContingentBorrowing
    || normalizedForecast.missingYears?.length > 0
    || normalizedForecast.missingCardIds?.length > 0
  ) {
    const message = normalizedForecast.missingYears?.length > 0
      ? `The forecast is missing Hong Kong holiday data for ${normalizedForecast.missingYears.join(', ')}.`
      : normalizedForecast.missingCardIds?.length > 0
        ? 'A future cashout references a card that is not available in the forecast.'
        : 'The forecast depends on a future cashout that has not been confirmed.'
    return {
      state: 'at-risk',
      title: 'At Risk',
      message,
      firstFailure: null,
      shortfall: 0,
      futureLimitFailure,
    }
  }

  return {
    state: 'normal',
    title: 'Normal',
    message: 'Projected cash covers all planned payments.',
    firstFailure: null,
    shortfall: 0,
    futureLimitFailure,
  }
}