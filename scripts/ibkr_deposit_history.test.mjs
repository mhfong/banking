import { describe, expect, it } from 'vitest'
import {
  alignDailyTotalPnL,
  mergeDepositHistory,
  summarizeDeposits,
  upsertDateSeries,
} from '../ibkr_deposit_history.mjs'

describe('IBKR deposit history', () => {
  it('preserves deposits before the current Flex window', () => {
    const merged = mergeDepositHistory(
      [
        { date: '2025-10-29', amount: 5000 },
        { date: '2025-10-29', amount: 5000 },
      ],
      [{ date: '2025-11-03', amount: 20000 }],
      { start: '2025-11-01', end: '2026-10-31' },
    )

    expect(merged).toEqual([
      { date: '2025-10-29', amount: 10000 },
      { date: '2025-11-03', amount: 20000 },
    ])
  })

  it('summarizes deposits and withdrawals across the preserved history', () => {
    expect(summarizeDeposits([
      { date: '2025-10-29', amount: 10000 },
      { date: '2025-11-03', amount: 20000 },
      { date: '2026-02-01', amount: -5000 },
    ])).toEqual({
      totalDeposited: 30000,
      totalWithdrawn: 5000,
      netDeposited: 25000,
    })
  })

  it('aligns the daily PNL series with the full-history final PNL', () => {
    expect(alignDailyTotalPnL([
      { date: '2026-10-30', cumulativePnL: 100 },
      { date: '2026-10-31', cumulativePnL: 150 },
    ], 50)).toEqual([
      { date: '2026-10-30', cumulativePnL: 0 },
      { date: '2026-10-31', cumulativePnL: 50 },
    ])
  })

  it('updates matching daily records while preserving dates outside the refresh', () => {
    expect(upsertDateSeries(
      [
        { date: '2025-10-29', value: 'historical' },
        { date: '2026-10-30', value: 'stale' },
      ],
      [
        { date: '2026-10-30', value: 'refreshed' },
        { date: '2026-10-31', value: 'new' },
      ],
    )).toEqual([
      { date: '2025-10-29', value: 'historical' },
      { date: '2026-10-30', value: 'refreshed' },
      { date: '2026-10-31', value: 'new' },
    ])
  })
})