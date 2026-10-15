const POSITION_TAGS = new Set([
  'POS',
  'POST',
  'POSITION',
  'POSITIONS',
  'OPENPOSITION',
  'OPENPOSITIONS',
])

function getField(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') return row[name]
  }
  return null
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePosition(row) {
  const symbol = String(getField(row, ['Symbol', 'LocalSymbol', 'UnderlyingSymbol']) || '').trim()
  const quantity = toNumber(getField(row, ['Quantity', 'Position']))
  const marketPrice = toNumber(getField(row, ['MarkPrice', 'MarketPrice', 'ClosePrice']))
  const marketValue = toNumber(getField(row, ['PositionValue', 'MarketValue']))
  const averagePrice = toNumber(getField(row, ['AverageCost', 'AvgCost', 'AveragePrice']))
  const costBasis = toNumber(getField(row, ['CostBasis', 'CostBasisMoney']))
  const unrealizedPnL = toNumber(getField(row, ['FifoPnlUnrealized', 'UnrealizedPnL', 'UnrealizedPnl']))
  const realizedPnL = toNumber(getField(row, ['FifoPnlRealized', 'RealizedPnL', 'RealizedPnl']))

  return {
    symbol,
    description: String(getField(row, ['Description', 'AssetDescription']) || symbol),
    assetClass: getField(row, ['AssetClass', 'AssetCategory']) || null,
    currency: getField(row, ['CurrencyPrimary', 'Currency']) || null,
    quantity,
    marketPrice,
    marketValue,
    averagePrice,
    costBasis,
    unrealizedPnL,
    realizedPnL,
    todayPnL: toNullableNumber(getField(row, ['TodayPnL', 'TodayPnl', 'DailyPnL', 'DailyPnl', 'DayPnL', 'DayPnl'])),
    todayPct: toNullableNumber(getField(row, ['TodayPct', 'TodayPercent', 'DailyPnLPercent', 'DailyPnlPercent', 'PercentChange', 'ChangePercent'])),
    portfolioPct: toNullableNumber(getField(row, ['PercentOfNAV', 'PercentOfPortfolio', 'PortfolioPercent'])),
  }
}

export function extractPositions(sections = {}) {
  const rows = Object.entries(sections)
    .filter(([tag]) => POSITION_TAGS.has(String(tag).toUpperCase()) || /position/i.test(tag))
    .flatMap(([, sectionRows]) => Array.isArray(sectionRows) ? sectionRows : [])

  return rows
    .map(normalizePosition)
    .filter(position => position.symbol && position.quantity !== 0)
}
