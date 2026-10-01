import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { MESSAGES, initI18n } from './i18n.js';
import {
  STATS_BASE,
  MAX_DAYS,
  STAGES,
  GATES,
  fetchStats,
  kpis,
  churnSeries,
  throughputSeries,
  throughputMini,
  cycleRows,
  roundsRows,
  escalationFunnel,
  clarification,
  chainsView,
  badge,
  initStats,
  fmtKpi,
} from './stats.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
// Verbatim snapshot of the ecosystem-statistics `data` branch; never fetched from the network.
const fx = (p) => JSON.parse(readFileSync(new URL(`./fixtures/stats/${p}`, import.meta.url), 'utf8'));
const INDEX = fx('index.json');
const DAILY = Object.fromEntries(INDEX.days.map((d) => [d, fx(`daily/${d}.json`)]));
const LATEST = INDEX.days[INDEX.days.length - 1]; // 2026-09-30
const day = (d) => ({ date: d, totals: DAILY[d].totals, per_repo: DAILY[d].per_repo });
const flush = () => new Promise((r) => setImmediate(r));
const resp = (body) => ({ ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body });

// Mocked fetch serving the fixture; rejects any URL it does not know.
// `daily` maps date -> daily object (may be synthetic); `overrides[url]` may throw.
function makeFetch(calls, { days = [LATEST], daily = DAILY, overrides = {} } = {}) {
  return (url) => {
    calls.push(url);
    if (url in overrides) return Promise.resolve().then(() => overrides[url]()).then((b) => resp(JSON.stringify(b)));
    if (url === `${STATS_BASE}/index.json`) return Promise.resolve(resp(JSON.stringify({ days, schema_version: 1 })));
    const m = url.match(/\/daily\/(\d{4}-\d{2}-\d{2})\.json$/);
    if (url.startsWith(STATS_BASE) && m && daily[m[1]]) return Promise.resolve(resp(JSON.stringify(daily[m[1]])));
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  };
}

function stubStorage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

async function setup({ fetchImpl, i18n = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/#system' });
  const win = dom.window;
  const doc = win.document;
  Object.defineProperty(win.navigator, 'language', { value: 'en-US', configurable: true });
  Object.defineProperty(win, 'localStorage', { value: stubStorage(), configurable: true });
  const calls = [];
  const f = fetchImpl ?? makeFetch(calls);
  await initStats(doc, win, { fetch: f });
  if (i18n) initI18n(doc, win);
  return { doc, win, calls };
}

// Synthetic day: the real latest daily with the date replaced and an optional mutation.
const synth = (d, mutate) => {
  const o = structuredClone(DAILY[LATEST]);
  o.date = d;
  if (mutate) mutate(o);
  return o;
};

// ---------------------------------------------------------------- 1. symptom

test('initStats renders KPI tiles and a one-day badge from the data branch', async () => {
  const { doc } = await setup();
  const tiles = doc.querySelectorAll('#kstrip .kt');
  assert.equal(tiles.length, 6);
  for (const t of tiles) assert.ok(t.querySelector('svg'), 'tile has a sparkline');
  // Rendered values are the kpis() values of the latest day, formatted (not just "some digit").
  const rendered = [...tiles].map((t) => [t.dataset.kpi, t.querySelector('b').textContent]);
  assert.deepEqual(rendered, kpis([day(LATEST)]).map((k) => [k.key, fmtKpi(k.key, k.value)]));
  assert.deepEqual(rendered.map((r) => r[1]), ['0.26%', '0.04%', '89.5%', '0%', '100%', '18']);
  const sample = doc.querySelector('#stats .sample');
  assert.ok(sample, '.sample badge exists');
  const expected = MESSAGES.en['stats.sample.one'].replace('{n}', '1');
  assert.equal(sample.textContent.trim(), expected);
  assert.ok(!/coming soon/i.test(sample.textContent));
  assert.ok(!/30/.test(sample.textContent), 'a single day never claims 30 days');
});

test('initStats renders the latest of several days, not the first', async () => {
  const calls = [];
  const { doc } = await setup({ fetchImpl: makeFetch(calls, { days: INDEX.days }) });
  const vals = [...doc.querySelectorAll('#kstrip .kt b')].map((b) => b.textContent);
  assert.deepEqual(vals, ['0.26%', '0.04%', '89.5%', '0%', '100%', '18']);
  const sample = doc.querySelector('#stats .sample').textContent.trim();
  assert.equal(sample, MESSAGES.en['stats.sample.many'].replace('{n}', '4'));
});

test('initStats shows the error state and does not throw when the index fetch rejects', async () => {
  const calls = [];
  const fetchImpl = makeFetch(calls, { overrides: { [`${STATS_BASE}/index.json`]: () => { throw new Error('boom'); } } });
  const { doc } = await setup({ fetchImpl });
  const empty = doc.querySelector('#kstrip .empty[data-i18n="stats.error"]');
  assert.ok(empty, 'error placeholder in #kstrip');
  assert.equal(doc.querySelectorAll('#kstrip .kt').length, 0);
});

test('initStats renders human-readable stage labels and the 4-stat mini from totals.throughput', async () => {
  const { doc } = await setup();
  const cycle = doc.querySelector('#h-cycle').textContent;
  for (const s of STAGES) {
    assert.ok(cycle.includes(MESSAGES.en[`stats.stage.${s}`]), `stage label for ${s} is shown`);
  }
  assert.ok(!/[a-z]_to_[a-z]/.test(cycle), 'no snake_case stage key leaks into the UI');
  const nums = [...doc.querySelectorAll('#m-thru > *')].map((c) => c.querySelector('b')?.textContent.trim());
  assert.deepEqual(nums, ['17', '2', '0', '8']); // completed, manual, not_planned, released on 2026-09-30
});

test('initStats shows the regression-chains empty state when there are no chains', async () => {
  const { doc } = await setup(); // 2026-09-30 has chains: []
  assert.ok(doc.querySelector('#l-chain .empty'), 'empty state rendered');
});

// ---------------------------------------------------------------- 2. fetch

const dates35 = Array.from({ length: 35 }, (_, i) => new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10));
const daily35 = Object.fromEntries(dates35.map((d) => [d, synth(d)]));

test('fetchStats fetches index once and caps to the 30 most recent days', { timeout: 5000 }, async () => {
  assert.equal(MAX_DAYS, 30);
  const calls = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const base = makeFetch(calls, { days: dates35, daily: daily35 });
  const fetchImpl = (url) => {
    const p = base(url);
    if (url.endsWith('/index.json')) return p;
    if (calls.length === 31) release(); // index + all 30 dailies requested
    return gate.then(() => p); // would hang (-> timeout) if dailies were fetched sequentially
  };
  const out = await fetchStats(fetchImpl);
  assert.equal(calls[0], `${STATS_BASE}/index.json`);
  assert.equal(calls.filter((u) => u.endsWith('/index.json')).length, 1);
  const wanted = dates35.slice(-30).map((d) => `${STATS_BASE}/daily/${d}.json`);
  assert.deepEqual(calls.slice(1).sort(), wanted.sort());
  assert.equal(out.days.length, 30);
  assert.deepEqual(out.days.map((d) => d.date), dates35.slice(-30));
  assert.equal(out.listed, 35);
});

test('fetchStats sorts an unsorted index ascending', async () => {
  const shuffled = ['2026-09-28', '2026-09-26', '2026-09-30', '2026-09-27'];
  const out = await fetchStats(makeFetch([], { days: shuffled }));
  assert.deepEqual(out.days.map((d) => d.date), ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-30']);
});

test('fetchStats drops a failed daily and keeps the rest', async () => {
  const bad = `${STATS_BASE}/daily/2026-09-27.json`;
  const f = makeFetch([], { days: INDEX.days, overrides: { [bad]: () => { throw new Error('404'); } } });
  const out = await fetchStats(f);
  assert.deepEqual(out.days.map((d) => d.date), ['2026-09-26', '2026-09-28', '2026-09-30']);
  assert.equal(out.listed, 4);
});

test('fetchStats rejects when every daily fails or the index fails', async () => {
  const overrides = Object.fromEntries(INDEX.days.map((d) => [`${STATS_BASE}/daily/${d}.json`, () => { throw new Error('x'); }]));
  await assert.rejects(fetchStats(makeFetch([], { days: INDEX.days, overrides })));
  await assert.rejects(fetchStats(makeFetch([], { overrides: { [`${STATS_BASE}/index.json`]: () => { throw new Error('x'); } } })));
});

// ---------------------------------------------------------------- 3. transforms

const ALL = INDEX.days.map(day); // 4 real days
const ONE = [day(LATEST)];
const EMPTY = [{ date: '2026-01-01', totals: {} }];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ~ ${b}`);

test('kpis returns the six tiles with one series point per day (1 and 4 days)', () => {
  for (const days of [ONE, ALL]) {
    const k = kpis(days);
    assert.deepEqual(k.map((t) => t.key), ['churn', 'rework', 'completed', 'autoAnswered', 'releasedWithoutAsking', 'chains']);
    for (const t of k) assert.equal(t.series.length, days.length, t.key);
  }
});

test('kpis values are computed from the latest day totals', () => {
  const v = Object.fromEntries(kpis(ONE).map((t) => [t.key, t.value]));
  close(v.churn, 0.0026); // branch_churn.value
  close(v.rework, 0.0004); // main_rework.value
  close(v.completed, 17 / 19); // closed.completed / (completed+manual+not_planned+other)
  close(v.autoAnswered, 0); // auto_answered / (auto_answered+escalated+in_progress)
  close(v.releasedWithoutAsking, 1); // released_without_asking / released = 8/8
  assert.equal(v.chains, 18); // regression_chains.active
  const v28 = Object.fromEntries(kpis([day('2026-09-28')]).map((t) => [t.key, t.value]));
  close(v28.autoAnswered, 2 / 36);
  close(v28.releasedWithoutAsking, 31 / 32);
  close(v28.completed, 45 / 66);
});

test('kpi series carry each day own value, ordered like the input days', () => {
  const by = Object.fromEntries(kpis(ALL).map((t) => [t.key, t.series]));
  const T = ALL.map((d) => d.totals);
  assert.deepEqual(by.chains, [65, 21, 64, 18]);
  assert.deepEqual(by.churn, T.map((t) => t.branch_churn.value));
  assert.deepEqual(by.rework, T.map((t) => t.main_rework.value));
  assert.deepEqual(by.completed, T.map((t) => { const c = t.throughput.closed; return c.completed / (c.completed + c.manual + c.not_planned + c.other); }));
  assert.deepEqual(by.autoAnswered, T.map((t) => { const e = t.escalations; return e.auto_answered / (e.auto_answered + e.escalated + e.in_progress); }));
  assert.deepEqual(by.releasedWithoutAsking, T.map((t) => t.clarification.released_without_asking / t.clarification.released));
  for (const k of Object.keys(by)) assert.ok(new Set(by[k]).size > 1, `${k} series varies across the fixture days`);
});

test('point-in-time kpi values take the latest (last) day when several days are given', () => {
  const latestOnly = kpis(ONE).map((t) => t.value);
  assert.deepEqual(kpis(ALL).map((t) => t.value), latestOnly);
  assert.notDeepEqual(kpis([day('2026-09-26')]).map((t) => t.value), latestOnly, 'fixture days differ');
});

test('churnSeries and throughputSeries give one point per day with the right fields', () => {
  for (const days of [ONE, ALL]) {
    assert.equal(churnSeries(days).length, days.length);
    assert.equal(throughputSeries(days).length, days.length);
  }
  assert.deepEqual(churnSeries(ALL).map((p) => p.date), INDEX.days);
  assert.deepEqual(churnSeries(ALL).map((p) => p.churn), ALL.map((d) => d.totals.branch_churn.value));
  assert.deepEqual(churnSeries(ALL).map((p) => p.rework), ALL.map((d) => d.totals.main_rework.value));
  assert.deepEqual(throughputSeries(ALL).map((p) => p.completed), ALL.map((d) => d.totals.throughput.closed.completed));
  assert.deepEqual(throughputSeries(ALL).map((p) => p.released), ALL.map((d) => d.totals.throughput.events.released));
  assert.deepEqual(throughputSeries(ALL).map((p) => p.manual), ALL.map((d) => d.totals.throughput.closed.manual));
  assert.deepEqual(throughputSeries(ALL).map((p) => p.not_planned), ALL.map((d) => d.totals.throughput.closed.not_planned));
  close(churnSeries(ONE)[0].churn, 0.0026);
  close(churnSeries(ONE)[0].rework, 0.0004);
  assert.deepEqual(throughputSeries([day('2026-09-28')])[0], {
    date: '2026-09-28', completed: 45, manual: 19, not_planned: 2, released: 33,
  });
});

test('throughputMini takes the four numbers from the latest day totals.throughput', () => {
  assert.deepEqual(throughputMini(ALL), { completed: 17, manual: 2, not_planned: 0, released: 8 });
});

test('cycleRows come back in STAGES order with human-readable labels in both languages', () => {
  const rows = cycleRows(ONE);
  assert.deepEqual(rows.map((r) => r.key), STAGES);
  for (const r of rows) {
    assert.equal(r.labelKey, `stats.stage.${r.key}`);
    for (const lang of ['en', 'de']) {
      const text = MESSAGES[lang][r.labelKey];
      assert.ok(text, `${lang} label for ${r.labelKey}`);
      assert.ok(!text.includes('_'), `${lang} label "${text}" is not snake_case`);
    }
  }
  const created = rows.find((r) => r.key === 'created_to_released');
  close(created.median, 0.365);
  close(created.p90, 21.2561);
  // latest day wins: 2026-09-26 (first) has a different created_to_released median
  assert.deepEqual(cycleRows(ALL), rows);
  assert.notDeepEqual(cycleRows([day('2026-09-26')]), rows);
});

test('roundsRows reads the selected lane of the latest day in GATES order', () => {
  const rows = roundsRows(ONE, 'dev');
  assert.deepEqual(rows.map((r) => r.gate), GATES);
  assert.deepEqual(rows.find((r) => r.gate === 'plan-critic'), { gate: 'plan-critic', median: 1, p90: 2, avg: 1.4667 });
  assert.deepEqual(roundsRows(ALL, 'dev'), rows, 'latest day wins over the first');
  assert.notDeepEqual(roundsRows([day('2026-09-26')], 'dev'), rows, 'fixture days differ');
  for (const g of GATES) for (const lang of ['en', 'de']) assert.ok(MESSAGES[lang][`stats.gate.${g}`], `${lang} gate label ${g}`);
});

test('roundsRows(dev) differs from roundsRows(prose) on a day whose lanes differ; a lane without data gives zero rows', () => {
  const d = synth('2026-10-01', (o) => {
    o.totals.rounds.lanes.prose.gates = { review: { used: { avg: 3.5, median: 4, p90: 6 } } };
  });
  const days = [{ date: d.date, totals: d.totals }];
  const dev = roundsRows(days, 'dev');
  const prose = roundsRows(days, 'prose');
  assert.notDeepEqual(dev, prose);
  assert.deepEqual(prose.find((r) => r.gate === 'review'), { gate: 'review', median: 4, p90: 6, avg: 3.5 });
  const zero = (rows) => {
    assert.equal(rows.length, GATES.length, 'one row per gate even without data');
    assert.deepEqual(rows.map((r) => r.gate), GATES);
    assert.ok(rows.every((r) => r.median === 0 && r.p90 === 0 && r.avg === 0));
  };
  zero(roundsRows(ONE, 'prose')); // 2026-09-30: prose gates are {}
  zero(roundsRows(ONE, 'nonexistent'));
});

test('escalationFunnel total is the sum of its parts and reasons are [reason, n] pairs', () => {
  const f = escalationFunnel([day('2026-09-28')]);
  assert.equal(f.auto_answered, 2);
  assert.equal(f.escalated, 4);
  assert.equal(f.in_progress, 30);
  assert.equal(f.total, f.auto_answered + f.escalated + f.in_progress);
  assert.deepEqual(f.reasons, [['blocked', 3], ['failed', 1]]);
  assert.deepEqual(escalationFunnel(ONE).reasons, []);
  assert.deepEqual(escalationFunnel([day('2026-09-28'), day(LATEST)]), escalationFunnel(ONE), 'latest day wins');
});

test('clarification returns the split counts from the latest day', () => {
  const c = clarification([day('2026-09-28')]);
  assert.equal(c.frames, 23);
  assert.equal(c.released, 32);
  assert.equal(c.released_without_asking, 31);
  assert.equal(c.clarifications, 1);
  assert.equal(c.questions, 1);
  assert.equal(c.lane_splits, 1);
  assert.equal(c.re_cuts, 2);
  assert.deepEqual(clarification([day('2026-09-28'), day(LATEST)]), clarification(ONE), 'latest day wins');
  assert.equal(clarification([day('2026-09-28'), day(LATEST)]).frames, 8);
});

test('clarification buckets a questions map into a numerically sorted histogram', () => {
  const d = synth('2026-10-01', (o) => { o.totals.clarification.questions = { 3: 1, 0: 5, 1: 2 }; });
  const c = clarification([{ date: d.date, totals: d.totals }]);
  assert.deepEqual(c.histogram.map((b) => [String(b.bucket), b.n]), [['0', 5], ['1', 2], ['3', 1]]);
});

test('clarification gives an empty histogram when questions is a plain number (real data today)', () => {
  const c = clarification(ONE);
  assert.deepEqual(c.histogram, []);
  assert.equal(c.questions, 0);
});

test('chainsView reports empty only when there are no chains', () => {
  const none = chainsView(ONE);
  assert.equal(none.empty, true);
  assert.equal(none.active, 18);
  assert.equal(none.detected, 0);
  const some = chainsView([day('2026-09-27')]);
  assert.equal(some.empty, false);
  assert.equal(some.chains.length, 3);
  assert.equal(some.detected, 3);
  const mixed = chainsView([day('2026-09-27'), day(LATEST)]); // latest has no chains
  assert.equal(mixed.empty, true);
  assert.equal(mixed.active, 18);
});

test('badge uses the one-day key for a single day and the plural key otherwise', () => {
  assert.deepEqual(badge(1, 1), { key: 'stats.sample.one', n: 1 });
  assert.deepEqual(badge(4, 4), { key: 'stats.sample.many', n: 4 });
  assert.equal(badge(35, 30).n, 30);
  for (const k of ['stats.sample.one', 'stats.sample.many']) for (const l of ['en', 'de']) assert.ok(MESSAGES[l][k], `${l} ${k}`);
});

test('every transform tolerates a day with empty totals and never yields NaN', () => {
  for (const t of kpis(EMPTY)) {
    assert.equal(t.value, 0, `${t.key} is exactly 0 for a 0 denominator`);
    assert.equal(t.series.length, 1);
  }
  assert.equal(churnSeries(EMPTY).length, 1);
  assert.equal(throughputSeries(EMPTY).length, 1);
  assert.deepEqual(throughputMini(EMPTY), { completed: 0, manual: 0, not_planned: 0, released: 0 });
  assert.equal(cycleRows(EMPTY).length, STAGES.length);
  assert.ok(cycleRows(EMPTY).every((r) => r.median === 0 && r.p90 === 0));
  assert.equal(roundsRows(EMPTY, 'dev').length, GATES.length);
  assert.ok(roundsRows(EMPTY, 'dev').every((r) => r.median === 0));
  assert.equal(escalationFunnel(EMPTY).total, 0);
  assert.equal(clarification(EMPTY).frames, 0);
  assert.equal(chainsView(EMPTY).empty, true);
});

// ---------------------------------------------------------------- 4. lane toggle

test('lane toggle re-renders rounds from the selected lane without refetching', async () => {
  const d = synth('2026-10-01', (o) => {
    o.totals.rounds.lanes.prose.gates = { review: { used: { avg: 3.5, median: 4, p90: 6 } } };
  });
  const calls = [];
  const fetchImpl = makeFetch(calls, { days: ['2026-10-01'], daily: { '2026-10-01': d } });
  const { doc } = await setup({ fetchImpl });
  const dev = doc.querySelector('[data-lane="dev"]');
  const prose = doc.querySelector('[data-lane="prose"]');
  assert.ok(dev && prose, 'lane buttons exist');
  assert.equal(dev.getAttribute('aria-pressed'), 'true');
  assert.equal(prose.getAttribute('aria-pressed'), 'false');
  const before = doc.querySelector('#h-rounds').textContent;
  assert.ok(before.includes(MESSAGES.en['stats.gate.plan-critic']), 'dev lane shows the plan-critic gate');
  const n = calls.length;
  prose.click();
  await flush();
  const after = doc.querySelector('#h-rounds').textContent;
  assert.notEqual(after, before);
  assert.ok(after.includes(MESSAGES.en['stats.gate.review']));
  // roundsRows returns a zero row for every gate; the renderer omits gates the lane never ran.
  assert.ok(!after.includes(MESSAGES.en['stats.gate.plan-critic']), 'renderer omits the all-zero plan-critic row');
  assert.equal(prose.getAttribute('aria-pressed'), 'true');
  assert.equal(dev.getAttribute('aria-pressed'), 'false');
  assert.equal(calls.length, n, 'no refetch on toggle');
});
