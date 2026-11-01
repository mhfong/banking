import { describe, expect, it } from 'vitest'
import { formatNetDeposited } from './Investment.jsx'

describe('investment summary formatting', () => {
  it('preserves cents when formatting net deposited', () => {
    expect(formatNetDeposited(779009.8)).toBe('$779,009.80')
  })
})