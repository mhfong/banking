import { describe, expect, it } from 'vitest'
import {
  getHongKongHolidayCalendar,
  getReminderDate,
  getSalaryDate,
  isWorkingDay,
  moveToPreviousWorkingDay,
} from '../hongKongWorkingDays.js'

const { holidaySet } = getHongKongHolidayCalendar([2026])

describe('Hong Kong working-day helpers', () => {
  it('returns supported holidays and reports missing calendar years', () => {
    const calendar = getHongKongHolidayCalendar([2026, 2099])

    expect(calendar.holidaySet.has('2026-10-01')).toBe(true)
    expect(calendar.missingYears).toEqual([2099])
  })

  it('recognizes weekends and public holidays as non-working days', () => {
    expect(isWorkingDay('2026-10-01', holidaySet)).toBe(false)
    expect(isWorkingDay('2026-10-02', holidaySet)).toBe(true)
    expect(moveToPreviousWorkingDay('2026-10-01', holidaySet)).toBe('2026-09-30')
  })

  it('keeps a normal 28th salary date unchanged', () => {
    expect(getSalaryDate(2026, 9, { salaryDay: 28, salaryAdjustment: 'previousWorkingDay' }, holidaySet))
      .toBe('2026-10-28')
  })

  it('moves a weekend salary date backward to Friday', () => {
    expect(getSalaryDate(2026, 1, { salaryDay: 28, salaryAdjustment: 'previousWorkingDay' }, holidaySet))
      .toBe('2026-02-27')
  })

  it('moves a public-holiday salary date backward to the previous working day', () => {
    expect(getSalaryDate(2026, 9, { salaryDay: 1, salaryAdjustment: 'previousWorkingDay' }, holidaySet))
      .toBe('2026-09-30')
  })

  it('always moves a weekend salary date backward, even with no adjustment setting', () => {
    expect(getSalaryDate(2026, 1, { salaryDay: 28, salaryAdjustment: 'none' }, holidaySet))
      .toBe('2026-02-27')
  })

  it('subtracts calendar days before applying the backward working-day adjustment', () => {
    expect(getReminderDate('2026-10-06', 3, holidaySet)).toBe('2026-10-02')
    expect(getReminderDate('2026-10-04', 3, holidaySet)).toBe('2026-09-30')
  })
})