// Verify server-owned descriptive facts against the bound source snapshots.
// This never recomputes engine scores, rankings, or investment decisions.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
// Python's source contract sorts Unicode code points, not UTF-16 code units.
const compare = (a, b) => {
  const left = Array.from(a, c => c.codePointAt(0)), right = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
};
const values = (snapshot, field) => new Set(snapshot.candidates.map(row => row[field]));
const intersection = (left, right) => [...left].filter(value => right.has(value)).sort(compare);
const difference = (left, right) => [...left].filter(value => !right.has(value)).sort(compare);
export function sourceFacts(data) {
  const facts = {};
  const usable = snapshot => snapshot.status === 'valid' && snapshot.session === data.session;
  const comparable = (current, previous) => previous.status === 'valid' && current.contract === previous.contract;
  for (const name of ['TENX', 'MLG']) {
    const { current, previous } = data.engines[name];
    if (!usable(current) || !comparable(current, previous)) continue;
    const before = values(previous, 'symbol'), after = values(current, 'symbol');
    const entered = difference(after, before), exited = difference(before, after);
    if (entered.length || exited.length) facts[`${name.toLowerCase()}_changes`] = {
      kind: 'candidate_change', engine: name, entered, exited, count_delta: after.size - before.size,
      sources: [previous.source_id, current.source_id]
    };
  }
  const { current: tenx, previous: tenxPrevious } = data.engines.TENX;
  const { current: mlg, previous: mlgPrevious } = data.engines.MLG;
  if (usable(tenx) && usable(mlg)) {
    const symbols = intersection(values(tenx, 'symbol'), values(mlg, 'symbol'));
    const validPrevious = comparable(tenx, tenxPrevious) && comparable(mlg, mlgPrevious);
    const previousSymbols = validPrevious ? intersection(values(tenxPrevious, 'symbol'), values(mlgPrevious, 'symbol')) : null;
    facts.exposure = {
      kind: 'shared_exposure', symbols, sectors: intersection(values(tenx, 'sector'), values(mlg, 'sector')),
      previous_symbols: previousSymbols, changed: validPrevious && !same(symbols, previousSymbols),
      sources: [tenx.source_id, mlg.source_id, ...(validPrevious ? [tenxPrevious.source_id, mlgPrevious.source_id] : [])]
    };
  }
  const radar = data.engines.Radar.current;
  const market_available = usable(radar) && radar.market_state !== 'unavailable';
  if (market_available) facts.market = { kind: 'market', state: radar.market_state, sources: [radar.source_id] };
  return { market_available, facts };
}
export function assertSourceFacts(data) {
  try {
    if (!same(data.computed, sourceFacts(data))) throw new Error();
  } catch {
    throw new Error('BRIEFING_ARTIFACT_INVALID');
  }
}
