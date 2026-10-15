import assert from 'node:assert/strict'
import { calculateDailyTotalPnL, calculateDailyTotalPnLFromReturns, convertPnLPointsToPercentage } from '../investment_pnl.mjs'

const points = calculateDailyTotalPnL([
  { date: '2026-01-01', total: 1000 },
  { date: '2026-01-02', total: 1100 },
  { date: '2026-01-03', total: 1050 },
], {
  '2026-01-01': 1000,
})

assert.deepEqual(points.map(point => point.dailyPnL), [0, 100, -50])
assert.deepEqual(points.map(point => point.cumulativePnL), [0, 100, 50])

const adjusted = calculateDailyTotalPnL([
  { date: '2026-01-01', total: 1500 },
  { date: '2026-01-02', total: 1600 },
], {
  '2026-01-01': 1000,
}, 100)

assert.deepEqual(adjusted.map(point => point.cumulativePnL), [0, 100])

const reconstructed = calculateDailyTotalPnLFromReturns([
  { date: '2026-01-02', pnl: 10 },
  { date: '2026-01-03', pnl: -5 },
], {
  '2026-01-02': 1000,
}, 1045, 45)

assert.deepEqual(reconstructed.map(point => point.endingValue), [1100, 1045])
assert.deepEqual(reconstructed.map(point => point.dailyPnL), [100, -55])
assert.deepEqual(reconstructed.map(point => point.cumulativePnL), [100, 45])

const percentagePoints = convertPnLPointsToPercentage([
  { date: '2026-01-01', value: 50, dailyValue: 25 },
  { date: '2026-01-02', value: -25, dailyValue: -75 },
], 1000)

assert.deepEqual(percentagePoints.map(point => point.value), [5, -2.5])
assert.deepEqual(percentagePoints.map(point => point.dailyValue), [2.5, -7.5])
assert.deepEqual(percentagePoints.map(point => point.dollarValue), [50, -25])
assert.deepEqual(percentagePoints.map(point => point.dailyDollarValue), [25, -75])
console.log('investment PNL calculations passed')
