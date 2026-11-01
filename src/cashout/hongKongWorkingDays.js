import { isValid, parseISO } from 'date-fns'

const HOLIDAYS_BY_YEAR = Object.freeze({
  2025: Object.freeze([
    '2025-01-01',
    '2025-01-29',
    '2025-01-30',
    '2025-01-31',
    '2025-04-04',
    '2025-04-18',
    '2025-04-19',
    '2025-04-21',
    '2025-05-01',
    '2025-05-05',
    '2025-05-31',
    '2025-07-01',
    '2025-10-01',
    '2025-10-07',
    '2025-10-29',
    '2025-12-25',
    '2025-12-26',
  ]),
  2026: Object.freeze([
    '2026-01-01',
    '2026-02-17',
    '2026-02-18',
    '2026-02-19',
    '2026-04-03',
    '2026-04-04',
    '2026-04-06',
    '2026-04-07',
    '2026-05-01',
    '2026-05-25',
    '2026-06-19',
    '2026-07-01',
    '2026-09-26',
    '2026-10-01',
    '2026-10-19',
    '2026-12-25',
    '2026-12-26',
  ]),
  2027: Object.freeze([
    '2027-01-01',
    '2027-02-06',
    '2027-02-08',
    '2027-02-09',
    '2027-03-26',
    '2027-03-27',
    '2027-03-29',
    '2027-04-05',
    '2027-05-01',
    '2027-05-13',
    '2027-06-09',
    '2027-07-01',
    '2027-09-16',
    '2027-10-01',
    '2027-10-08',
    '2027-12-25',
    '2027-12-27',
  ]),
})

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = value => String(value).padStart(2, '0')

export function parseDateOnly(dateString) {
  const match = typeof dateString === 'string' ? dateString.match(DATE_ONLY_PATTERN) : null
  if (!match || !isValid(parseISO(dateString))) {
    throw new RangeError(`Invalid date-only value: ${dateString}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid date-only value: ${dateString}`)
  }

  return date
}

export function formatDateOnly(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDateDays(dateString, amount) {
  const date = parseDateOnly(dateString)
  date.setUTCDate(date.getUTCDate() + amount)
  return formatDateOnly(date)
}

export function compareDateOnly(left, right) {
  parseDateOnly(left)
  parseDateOnly(right)
  return left < right ? -1 : left > right ? 1 : 0
}

export function getMonthStart(dateString) {
  const date = parseDateOnly(dateString)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-01`
}

export function getNextMonthStart(dateString) {
  const date = parseDateOnly(dateString)
  date.setUTCMonth(date.getUTCMonth() + 1, 1)
  return formatDateOnly(date)
}

export function getDaysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

export function getHongKongHolidayCalendar(years) {
  const requestedYears = Array.isArray(years) ? years : years == null ? [] : [years]
  const normalizedYears = [...new Set(requestedYears.map(Number))]
    .filter(Number.isInteger)
    .sort((left, right) => left - right)
  const holidaySet = new Set()
  const missingYears = []

  for (const year of normalizedYears) {
    const holidays = HOLIDAYS_BY_YEAR[year]
    if (!holidays) {
      missingYears.push(year)
      continue
    }
    holidays.forEach(holiday => holidaySet.add(holiday))
  }

  return { holidaySet, missingYears }
}

export function isWorkingDay(dateString, holidaySet = new Set()) {
  const date = parseDateOnly(dateString)
  const dayOfWeek = date.getUTCDay()
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateString)
}

export function moveToPreviousWorkingDay(dateString, holidaySet = new Set()) {
  let adjustedDate = dateString
  while (!isWorkingDay(adjustedDate, holidaySet)) {
    adjustedDate = addDateDays(adjustedDate, -1)
  }
  return adjustedDate
}

export function getSalaryDate(year, monthIndex, settings = {}, holidaySet = new Set()) {
  const salaryDay = Number(settings.salaryDay ?? 28)
  if (!Number.isInteger(salaryDay) || salaryDay < 1 || salaryDay > 31) {
    throw new RangeError(`Invalid salary day: ${settings.salaryDay}`)
  }

  const day = Math.min(salaryDay, getDaysInMonth(year, monthIndex))
  const scheduledDate = `${year}-${pad(monthIndex + 1)}-${pad(day)}`
  return moveToPreviousWorkingDay(scheduledDate, holidaySet)
}

export function getReminderDate(expectedPaymentOn, daysBefore = 3, holidaySet = new Set()) {
  const calendarDays = Number(daysBefore)
  if (!Number.isInteger(calendarDays) || calendarDays < 0) {
    throw new RangeError(`Invalid reminder days: ${daysBefore}`)
  }
  return moveToPreviousWorkingDay(addDateDays(expectedPaymentOn, -calendarDays), holidaySet)
}