function roundCents(value) {
  return Math.round(value * 100) / 100
}

export function isDateInWindow(date, window = {}) {
  if (!date || (!window.start && !window.end)) return false
  if (window.start && date < window.start) return false
  if (window.end && date > window.end) return false
  return true
}

export function upsertDateSeries(existingRecords = [], latestRecords = []) {
  const recordsByDate = new Map()

  for (const record of existingRecords) {
    if (record?.date) recordsByDate.set(record.date, record)
  }

  for (const record of latestRecords) {
    if (record?.date) recordsByDate.set(record.date, record)
  }

  return Array.from(recordsByDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function mergeDepositHistory(existingDeposits = [], windowDeposits = [], sourceWindow = {}) {
  const mergedByDate = new Map()
  const addAmount = (date, amount) => {
    mergedByDate.set(date, roundCents((mergedByDate.get(date) || 0) + amount))
  }

  for (const deposit of existingDeposits) {
    if (!deposit?.date) continue
    addAmount(deposit.date, Number(deposit.amount) || 0)
  }

  for (const deposit of windowDeposits) {
    if (!deposit?.date) continue
    addAmount(deposit.date, Number(deposit.amount) || 0)
  }

  return Array.from(mergedByDate, ([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function summarizeDeposits(deposits = []) {
  let totalDeposited = 0
  let totalWithdrawn = 0

  for (const deposit of deposits) {
    const amount = Number(deposit?.amount) || 0
    if (amount >= 0) totalDeposited += amount
    else totalWithdrawn -= amount
  }

  totalDeposited = roundCents(totalDeposited)
  totalWithdrawn = roundCents(totalWithdrawn)

  return {
    totalDeposited,
    totalWithdrawn,
    netDeposited: roundCents(totalDeposited - totalWithdrawn),
  }
}

export function alignDailyTotalPnL(points = [], targetFinalPnL) {
  if (!points.length || !Number.isFinite(Number(targetFinalPnL))) return points

  const currentFinalPnL = Number(points[points.length - 1].cumulativePnL) || 0
  const adjustment = roundCents(Number(targetFinalPnL) - currentFinalPnL)
  if (adjustment === 0) return points

  return points.map(point => ({
    ...point,
    cumulativePnL: roundCents((Number(point.cumulativePnL) || 0) + adjustment),
  }))
}