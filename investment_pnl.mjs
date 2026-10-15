function roundCents(value) {
  return Math.round(value * 100) / 100
}

export function convertPnLPointsToPercentage(points, netDeposited) {
  const denominator = Number(netDeposited)
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return points.map(point => ({ ...point, value: 0, dailyValue: 0 }))
  }

  return points.map(point => {
    const dollarValue = Number(point.value) || 0
    const dailyDollarValue = Number(point.dailyValue) || 0
    return {
      ...point,
      value: roundCents(dollarValue / denominator * 100),
      dailyValue: roundCents(dailyDollarValue / denominator * 100),
      dollarValue,
      dailyDollarValue,
    }
  })
}

export function calculateDailyTotalPnL(navRows, cashFlows = {}, targetFinalPnL = null) {
  let previousTotal = null
  let cumulativeCashFlow = 0

  const points = navRows.map(({ date, total }) => {
    const endingValue = Number(total) || 0
    const cashFlow = Number(cashFlows[date]) || 0
    cumulativeCashFlow += cashFlow

    const dailyPnL = previousTotal === null
      ? endingValue - cashFlow
      : endingValue - previousTotal - cashFlow

    previousTotal = endingValue

    return {
      date,
      dailyPnL: roundCents(dailyPnL),
      cumulativePnL: roundCents(endingValue - cumulativeCashFlow),
      endingValue: roundCents(endingValue),
      cashFlow: roundCents(cashFlow),
    }
  })

  if (targetFinalPnL == null || !points.length) return points

  const adjustment = roundCents(targetFinalPnL - points[points.length - 1].cumulativePnL)
  if (adjustment === 0) return points

  return points.map(point => ({
    ...point,
    cumulativePnL: roundCents(point.cumulativePnL + adjustment),
  }))
}

export function calculateDailyTotalPnLFromReturns(dailyReturns, cashFlows = {}, finalEndingValue = 0, finalTotalPnL = null) {
  if (!dailyReturns.length) return []

  const dailyPnLs = new Array(dailyReturns.length)
  const endingValues = new Array(dailyReturns.length)
  let endingValue = Number(finalEndingValue) || 0

  for (let index = dailyReturns.length - 1; index >= 0; index--) {
    const point = dailyReturns[index]
    const cashFlow = Number(cashFlows[point.date]) || 0
    const dailyReturn = (Number(point.pnl ?? point.dailyReturn) || 0) / 100
    const returnFactor = 1 + dailyReturn
    const previousValue = returnFactor > 0
      ? endingValue / returnFactor - cashFlow
      : endingValue - cashFlow

    endingValues[index] = endingValue
    dailyPnLs[index] = endingValue - previousValue - cashFlow
    endingValue = previousValue
  }

  const totalCashFlow = Object.values(cashFlows).reduce((total, value) => total + (Number(value) || 0), 0)
  let cumulativePnL = finalTotalPnL == null
    ? (Number(finalEndingValue) || 0) - totalCashFlow
    : Number(finalTotalPnL) || 0
  const cumulativePnLs = new Array(dailyReturns.length)

  for (let index = dailyReturns.length - 1; index >= 0; index--) {
    cumulativePnLs[index] = cumulativePnL
    cumulativePnL -= dailyPnLs[index]
  }

  return dailyReturns.map((point, index) => ({
    date: point.date,
    dailyPnL: roundCents(dailyPnLs[index]),
    cumulativePnL: roundCents(cumulativePnLs[index]),
    endingValue: roundCents(endingValues[index]),
    cashFlow: roundCents(cashFlows[point.date] || 0),
  }))
}
