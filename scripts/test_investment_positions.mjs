import assert from 'node:assert/strict'
import { extractPositions } from '../investment_positions.mjs'

const positions = extractPositions({
  OpenPositions: [
    {
      Symbol: 'TBILL',
      Description: 'US Treasury Bill',
      AssetClass: 'BOND',
      CurrencyPrimary: 'USD',
      Quantity: '150',
      MarkPrice: '99.53813',
      PositionValue: '14990',
      AverageCost: '99.53813',
      CostBasis: '14931',
      FifoPnlUnrealized: '59.76',
      FifoPnlRealized: '0',
      PercentOfNAV: '14.81',
      TodayPnL: '1.64',
    },
    { Symbol: 'CLOSED', Quantity: '0' },
  ],
})

assert.deepEqual(positions, [{
  symbol: 'TBILL',
  description: 'US Treasury Bill',
  assetClass: 'BOND',
  currency: 'USD',
  quantity: 150,
  marketPrice: 99.53813,
  marketValue: 14990,
  averagePrice: 99.53813,
  costBasis: 14931,
  unrealizedPnL: 59.76,
  realizedPnL: 0,
  todayPnL: 1.64,
  todayPct: null,
  portfolioPct: 14.81,
}])

console.log('investment position parsing passed')
