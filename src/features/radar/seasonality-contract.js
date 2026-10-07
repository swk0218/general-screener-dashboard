const fields = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key));

export function seasonalityWindow(now = new Date()) {
  const end = Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/New_York' }).format(now)) - 1;
  return { start: end - 19, end };
}

export function seasonalityIsCurrent(value, now = new Date()) {
  const window = seasonalityWindow(now);
  return value?.start_year === window.start && value?.end_year === window.end
    && Date.parse(value.computed_at_utc) <= now.getTime();
}

export function validateSeasonality(value, { now = new Date(), allowHistorical = false } = {}) {
  if (!fields(value, ['schema', 'symbol', 'start_year', 'end_year', 'lookback_years', 'price_basis', 'source', 'computed_at_utc', 'months'])
    || value.schema !== 'radar_monthly_seasonality_v1' || value.symbol !== 'SPY'
    || !Number.isInteger(value.start_year) || value.start_year < 1994
    || !Number.isInteger(value.end_year) || value.end_year - value.start_year !== 19
    || value.lookback_years !== 20 || value.price_basis !== 'dividend_adjusted_close'
    || value.source !== 'FMP' || typeof value.computed_at_utc !== 'string'
    || !Number.isFinite(Date.parse(value.computed_at_utc))
    || Date.parse(value.computed_at_utc) > now.getTime()
    || (!allowHistorical && !seasonalityIsCurrent(value, now))
    || value.end_year >= Number(value.computed_at_utc.slice(0, 4))
    || !Array.isArray(value.months) || value.months.length !== 12) {
    throw new Error('INVALID_SEASONALITY');
  }
  value.months.forEach((row, index) => {
    if (!fields(row, ['month', 'mean_return', 'n']) || row.month !== index + 1
      || row.n !== 20 || typeof row.mean_return !== 'number'
      || !Number.isFinite(row.mean_return) || row.mean_return < -1 || row.mean_return > 10) {
      throw new Error('INVALID_SEASONALITY');
    }
  });
  return value;
}

export function seasonalityPercent(value) {
  const rounded = Math.round(value * 10000) / 100;
  return `${rounded > 0 ? '+' : ''}${Object.is(rounded, -0) ? '0.00' : rounded.toFixed(2)}%`;
}

export function seasonalityMonth(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'America/New_York' }).format(now));
}
