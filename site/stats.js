// Live stats dashboard for the System tab. Data: nightly snapshots on the `data` branch of
// seretos-agents/ecosystem-statistics (index.json + daily/<date>.json). Per-repo numbers are
// fetched with each day but never rendered.
import { MESSAGES, translate } from './i18n.js';

export const STATS_BASE =
  'https://raw.githubusercontent.com/seretos-agents/ecosystem-statistics/refs/heads/data';
export const MAX_DAYS = 30;
export const STAGES = [
  'created_to_released',
  'released_to_started',
  'started_to_pr_opened',
  'pr_opened_to_ci_green',
  'ci_green_to_done',
];
export const GATES = ['plan-critic', 'test-critic', 'review', 'ci', 'rebase'];
export const HARD_CAP = 6; // design fact from the mockup legend; the data carries no cap

// ---------- fetch ----------

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`stats fetch failed: ${res.status} ${url}`);
  return res.json();
}

export async function fetchStats(fetchImpl) {
  const index = await getJson(fetchImpl, `${STATS_BASE}/index.json`);
  const listed = Array.isArray(index?.days) ? [...index.days].sort() : [];
  const wanted = listed.slice(-MAX_DAYS);
  const loaded = await Promise.all(
    wanted.map((date) =>
      getJson(fetchImpl, `${STATS_BASE}/daily/${date}.json`)
        .then((d) => ({ date, totals: d?.totals ?? {}, per_repo: d?.per_repo ?? {} }))
        .catch(() => null)),
  );
  const days = loaded.filter(Boolean);
  if (!days.length) throw new Error('no stats day could be loaded');
  return { days, listed: listed.length };
}

// ---------- pure transforms (never throw on missing keys) ----------

// Tolerant path accessor: anything missing or non-numeric is 0.
function num(obj, path) {
  let v = obj;
  for (const k of path.split('.')) v = v?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
const share = (a, b) => (b > 0 ? a / b : 0);
const totalsOf = (d) => d?.totals ?? {};
const latest = (days) => totalsOf(days[days.length - 1]);

function dayKpis(t) {
  const closed = t.throughput?.closed;
  const esc = t.escalations;
  return {
    churn: num(t, 'branch_churn.value'),
    rework: num(t, 'main_rework.value'),
    completed: share(
      num(t, 'throughput.closed.completed'),
      num(closed, 'completed') + num(closed, 'manual') + num(closed, 'not_planned') + num(closed, 'other'),
    ),
    autoAnswered: share(num(esc, 'auto_answered'), num(esc, 'auto_answered') + num(esc, 'escalated') + num(esc, 'in_progress')),
    releasedWithoutAsking: share(num(t, 'clarification.released_without_asking'), num(t, 'clarification.released')),
    chains: num(t, 'regression_chains.active'),
  };
}
export const KPI_KEYS = ['churn', 'rework', 'completed', 'autoAnswered', 'releasedWithoutAsking', 'chains'];

export function kpis(days) {
  const per = days.map((d) => dayKpis(totalsOf(d)));
  const last = dayKpis(latest(days));
  return KPI_KEYS.map((key) => ({ key, value: last[key], series: per.map((p) => p[key]) }));
}

export function churnSeries(days) {
  return days.map((d) => ({
    date: d.date,
    churn: num(totalsOf(d), 'branch_churn.value'),
    rework: num(totalsOf(d), 'main_rework.value'),
  }));
}

const thruOf = (t) => ({
  completed: num(t, 'throughput.closed.completed'),
  manual: num(t, 'throughput.closed.manual'),
  not_planned: num(t, 'throughput.closed.not_planned'),
  released: num(t, 'throughput.events.released'),
});

export function throughputSeries(days) {
  return days.map((d) => ({ date: d.date, ...thruOf(totalsOf(d)) }));
}

export function throughputMini(days) {
  return thruOf(latest(days));
}

export function cycleRows(days) {
  const t = latest(days);
  return STAGES.map((key) => ({
    key,
    labelKey: `stats.stage.${key}`,
    median: num(t, `throughput.stages.${key}.median`),
    p90: num(t, `throughput.stages.${key}.p90`),
  }));
}

function laneOf(days, lane) {
  const l = latest(days).rounds?.lanes?.[lane];
  return l && typeof l === 'object' ? l : {};
}

// Fixed GATES first; gates a lane has beyond them (e.g. prose: evidence, scenario-critic) follow, sorted.
export function roundsRows(days, lane) {
  const gates = laneOf(days, lane).gates ?? {};
  const extra = Object.keys(gates).filter((g) => !GATES.includes(g)).sort();
  return [...GATES, ...extra].map((gate) => ({
    gate,
    median: num(gates, `${gate}.used.median`),
    p90: num(gates, `${gate}.used.p90`),
    avg: num(gates, `${gate}.used.avg`),
  }));
}

export function laneSummary(days, lane) {
  const l = laneOf(days, lane);
  return { sessions: num(l, 'sessions'), infra_share: num(l, 'infra_share'), over_soft_cap_share: num(l, 'over_soft_cap_share') };
}

export function escalationFunnel(days) {
  const e = latest(days).escalations ?? {};
  const auto_answered = num(e, 'auto_answered');
  const escalated = num(e, 'escalated');
  const in_progress = num(e, 'in_progress');
  const byReason = e.by_reason && typeof e.by_reason === 'object' ? e.by_reason : {};
  const reasons = Object.entries(byReason)
    .filter(([, n]) => typeof n === 'number')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { auto_answered, escalated, in_progress, total: auto_answered + escalated + in_progress, reasons };
}

// `questions` is a scalar in today's data and a bucket map (questions-asked -> tickets) in the
// schema's richer form; a histogram exists only for the map.
export function clarification(days) {
  const c = latest(days).clarification ?? {};
  const q = c.questions;
  let questions = 0;
  let histogram = [];
  if (q && typeof q === 'object') {
    histogram = Object.entries(q)
      .filter(([, n]) => typeof n === 'number')
      .map(([bucket, n]) => ({ bucket: Number(bucket), n }))
      .filter((b) => Number.isFinite(b.bucket))
      .sort((a, b) => a.bucket - b.bucket);
    questions = histogram.reduce((s, b) => s + b.bucket * b.n, 0);
  } else {
    questions = num(c, 'questions');
  }
  return {
    frames: num(c, 'frames'),
    released: num(c, 'released'),
    released_without_asking: num(c, 'released_without_asking'),
    clarifications: num(c, 'clarifications'),
    questions,
    lane_splits: num(c, 'lane_splits'),
    re_cuts: num(c, 're_cuts'),
    histogram,
  };
}

export function chainsView(days) {
  const r = latest(days).regression_chains ?? {};
  const chains = Array.isArray(r.chains) ? r.chains : [];
  return { active: num(r, 'active'), detected: num(r, 'detected'), chains, empty: chains.length === 0 };
}

// One day must never claim a range: the count is the days actually fetched.
export function badge(listed, fetched) {
  return { key: fetched === 1 ? 'stats.sample.one' : 'stats.sample.many', n: fetched };
}

// ---------- formatting ----------

export function fmtPct(v) {
  const p = v * 100;
  return `${p >= 10 ? Number(p.toFixed(1)) : Number(p.toFixed(2))}%`;
}
export const fmtKpi = (key, v) => (key === 'chains' ? String(v) : fmtPct(v));

function fmtDur(days) {
  if (days <= 0) return '0';
  return days < 1 ? `${Number((days * 24).toFixed(1))}h` : `${Number(days.toFixed(1))}d`;
}
const fmtNum = (v) => String(Number(v.toFixed(2)));

// ---------- rendering ----------

const SVG = 'http://www.w3.org/2000/svg';

export async function initStats(doc, win, { fetch = win.fetch?.bind(win), dict = MESSAGES } = {}) {
  const section = doc.getElementById('stats');
  if (!section) return;
  const lang = () => doc.documentElement.lang || 'en';
  const t = (key) => translate(dict, lang(), key);
  const $ = (id) => doc.getElementById(id);

  const h = (tag, { cls, text, i18n, attrs = {}, style } = {}, children = []) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (i18n) {
      e.dataset.i18n = i18n;
      e.textContent = t(i18n);
    } else if (text != null) {
      e.textContent = text;
    }
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (style) e.setAttribute('style', style);
    e.append(...children);
    return e;
  };
  const s = (tag, attrs = {}, children = []) => {
    const e = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.append(...children);
    return e;
  };
  const svg = (w, hgt, children) =>
    s('svg', { viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, children);
  const empty = (key) => h('div', { cls: 'empty', i18n: key });

  let state = null; // { days, listed }
  let lane = 'dev';

  // polyline points for a series in a w x hgt box; one point becomes a flat line.
  const pts = (series, w, hgt, max) => {
    const top = max > 0 ? max : 1;
    const y = (v) => hgt - 2 - (v / top) * (hgt - 4);
    if (series.length === 1) return [`0,${y(series[0])}`, `${w},${y(series[0])}`].join(' ');
    return series.map((v, i) => `${(i / (series.length - 1)) * w},${y(v)}`).join(' ');
  };
  const line = (series, w, hgt, max, color) =>
    s('polyline', { points: pts(series, w, hgt, max), fill: 'none', stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' });

  const renderBadge = () => {
    const el = section.querySelector('.sample');
    if (!el || !state) return;
    const b = badge(state.listed, state.days.length);
    el.removeAttribute('data-i18n'); // the count is data: keep applyLanguage from overwriting it
    el.textContent = t(b.key).replace('{n}', String(b.n));
  };

  const axis = (id, days) => {
    const box = $(id)?.nextElementSibling;
    if (!box || !box.classList.contains('axis')) return;
    const first = days[0]?.date ?? '';
    const last = days[days.length - 1]?.date ?? '';
    box.replaceChildren(h('span', { text: first }), ...(last !== first ? [h('span', { text: last })] : []));
  };

  function renderKpis(days) {
    const tiles = kpis(days).map(({ key, value, series }) => {
      const max = Math.max(...series, 0);
      return h('div', { cls: `kt ${key === 'chains' ? 'you' : 'sysk'}`, attrs: { 'data-kpi': key } }, [
        h('div', { cls: 'kl', i18n: `stats.kpi.${key}` }),
        h('div', { cls: 'kv' }, [h('b', { text: fmtKpi(key, value) })]),
        svg(100, 28, [line(series, 100, 28, max, 'var(--sys)')]),
      ]);
    });
    $('kstrip').replaceChildren(...tiles);
  }

  function renderChurn(days) {
    const cs = churnSeries(days);
    const last = cs[cs.length - 1] ?? { churn: 0, rework: 0 };
    $('lg-churn').textContent = fmtPct(last.churn);
    $('lg-rework').textContent = fmtPct(last.rework);
    const max = Math.max(...cs.flatMap((p) => [p.churn, p.rework]), 0);
    $('p-churn').replaceChildren(svg(300, 150, [
      line(cs.map((p) => p.churn), 300, 150, max, 'var(--sys)'),
      line(cs.map((p) => p.rework), 300, 150, max, 'var(--you)'),
    ]));
    axis('p-churn', days);
  }

  function renderThroughput(days) {
    const ts = throughputSeries(days);
    const max = Math.max(...ts.map((p) => p.completed + p.manual + p.not_planned), ...ts.map((p) => p.released), 0) || 1;
    const slot = 300 / ts.length;
    const bw = Math.min(slot * 0.7, 40);
    const y = (v) => 146 - (v / max) * 140;
    const bars = [];
    ts.forEach((p, i) => {
      const x = slot * i + (slot - bw) / 2;
      let base = 146;
      for (const [k, color] of [['completed', 'var(--sys)'], ['manual', 'var(--you)'], ['not_planned', 'var(--line2)']]) {
        const hh = (p[k] / max) * 140;
        if (hh > 0) bars.push(s('rect', { x, y: base - hh, width: bw, height: hh, fill: color }));
        base -= hh;
      }
    });
    const rel = ts.map((p, i) => `${slot * i + slot / 2},${y(p.released)}`).join(' ');
    const relEl = ts.length === 1
      ? s('rect', { x: 150 - 3, y: y(ts[0].released) - 3, width: 6, height: 6, fill: 'var(--ok-fg)' })
      : s('polyline', { points: rel, fill: 'none', stroke: 'var(--ok-fg)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' });
    $('p-thru').replaceChildren(svg(300, 150, [...bars, relEl]));
    axis('p-thru', days);
    const m = throughputMini(days);
    $('m-thru').replaceChildren(...['completed', 'manual', 'not_planned', 'released'].map((k) =>
      h('div', {}, [h('b', { text: String(m[k]) }), h('span', { i18n: `stats.thru.${k}` })])));
  }

  const hrow = (label, med, p90, max, valueText) =>
    h('div', { cls: 'hr' }, [
      label,
      h('div', { cls: 'trk' }, [
        h('div', { cls: 'p90', style: `left:0;width:${(p90 / max) * 100}%` }),
        h('div', { cls: 'med', style: `left:0;width:${(med / max) * 100}%` }),
      ]),
      h('div', { cls: 'v' }, valueText),
    ]);

  function renderCycle(days) {
    const rows = cycleRows(days);
    const max = Math.max(...rows.map((r) => r.p90), ...rows.map((r) => r.median), 0) || 1;
    $('h-cycle').replaceChildren(...rows.map((r) =>
      hrow(h('div', { cls: 'n', i18n: r.labelKey }), r.median, r.p90, max,
        [h('b', { text: fmtDur(r.median) }), doc.createTextNode(` · p90 ${fmtDur(r.p90)}`)])));
  }

  // Gates with no rounds in this lane are omitted (a gate the lane never ran is not a zero-round gate).
  function renderRounds(days) {
    const rows = roundsRows(days, lane).filter((r) => r.median || r.p90 || r.avg);
    const max = Math.max(HARD_CAP, ...rows.map((r) => r.p90)) || 1;
    const body = rows.length
      ? rows.map((r) => {
          const row = hrow(h('div', { cls: 'n', i18n: `stats.gate.${r.gate}` }), r.median, r.p90, max,
            [h('b', { text: fmtNum(r.median) }), doc.createTextNode(` · p90 ${fmtNum(r.p90)}`)]);
          row.querySelector('.trk').append(h('div', { cls: 'cap hard', style: `left:${(HARD_CAP / max) * 100}%` }));
          return row;
        })
      : [empty('stats.rounds.empty')];
    $('h-rounds').replaceChildren(...body);
    const sum = laneSummary(days, lane);
    $('m-rounds').replaceChildren(
      h('div', {}, [h('b', { text: String(sum.sessions) }), h('span', { i18n: 'stats.rounds.sessions' })]),
      h('div', {}, [h('b', { text: fmtPct(sum.infra_share) }), h('span', { i18n: 'stats.rounds.infra' })]),
      h('div', {}, [h('b', { text: fmtPct(sum.over_soft_cap_share) }), h('span', { i18n: 'stats.rounds.softcap' })]),
    );
    section.querySelectorAll('[data-lane]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lane === lane)));
  }

  function renderEscalations(days) {
    const f = escalationFunnel(days);
    const max = Math.max(f.total, 1);
    const step = (key, n, bg, fg) =>
      h('div', { cls: 'fs' }, [
        h('div', { cls: 'fb', style: `width:${Math.max((n / max) * 100, n > 0 ? 3 : 0)}%;background:${bg};color:${fg}` }, [
          h('span', { i18n: key })]),
        h('b', { text: String(n) }),
      ]);
    $('f-esc').replaceChildren(
      step('stats.esc.total', f.total, 'var(--sys-bg)', 'var(--sys-fg)'),
      step('stats.esc.auto', f.auto_answered, 'var(--ok-bg)', 'var(--ok-fg)'),
      step('stats.esc.escalated', f.escalated, 'var(--you-bg)', 'var(--you-fg)'),
    );
    $('c-esc').replaceChildren(...f.reasons.map(([reason, n]) =>
      h('span', { cls: 'chip', text: `${reason} ` }, [h('b', { text: String(n) })])));
  }

  function renderClarification(days) {
    const c = clarification(days);
    const asked = Math.max(c.released - c.released_without_asking, 0);
    const total = Math.max(c.released, 1);
    $('s-gk').replaceChildren(
      h('div', { style: `width:${(c.released_without_asking / total) * 100}%;background:var(--ok-bg);color:var(--ok-fg)` }, [
        h('span', { i18n: 'stats.gk.alone' }), h('b', { text: ` ${c.released_without_asking}` })]),
      h('div', { style: `width:${(asked / total) * 100}%;background:var(--you-bg);color:var(--you-fg)` }, [
        h('span', { i18n: 'stats.gk.asked' }), h('b', { text: ` ${asked}` })]),
    );
    const maxN = Math.max(...c.histogram.map((b) => b.n), 1);
    $('q-gk').replaceChildren(...c.histogram.map((b) =>
      h('div', { cls: b.bucket >= 3 ? 'warn' : '' }, [
        h('em', { text: String(b.n) }),
        h('i', { style: `height:${(b.n / maxN) * 100}%` }),
        h('span', { text: String(b.bucket) }),
      ])));
    const chip = (key, n) => h('span', { cls: 'chip' }, [h('span', { i18n: key }), doc.createTextNode(' '), h('b', { text: String(n) })]);
    $('c-gk').replaceChildren(
      chip('stats.gk.chip.questions', c.questions),
      chip('stats.gk.chip.laneSplits', c.lane_splits),
      chip('stats.gk.chip.reCuts', c.re_cuts),
    );
  }

  function renderChains(days) {
    const v = chainsView(days);
    $('m-chain').replaceChildren(
      h('div', {}, [h('b', { text: String(v.active) }), h('span', { i18n: 'stats.chain.active' })]),
      h('div', {}, [h('b', { text: String(v.detected) }), h('span', { i18n: 'stats.chain.detected' })]),
    );
    $('l-chain').replaceChildren(...(v.empty
      ? [empty('stats.chain.empty')]
      : v.chains.map((c) => {
          const n = Math.max(1, Math.min(num(c, 'length'), 12));
          const parts = [];
          for (let i = 0; i < n; i++) {
            if (i) parts.push(h('span', { cls: 'ln' }));
            parts.push(h('span', { cls: 'dot' }));
          }
          return h('div', { cls: 'chain' }, [...parts, h('small', { text: String(c.ticket ?? '') })]);
        })));
  }

  section.querySelectorAll('[data-lane]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lane = btn.dataset.lane;
      if (state) renderRounds(state.days);
      else section.querySelectorAll('[data-lane]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  try {
    state = await fetchStats(fetch);
  } catch {
    $('kstrip').replaceChildren(empty('stats.error'));
    return;
  }
  const { days } = state;
  renderBadge();
  renderKpis(days);
  renderChurn(days);
  renderThroughput(days);
  renderCycle(days);
  renderRounds(days);
  renderEscalations(days);
  renderClarification(days);
  renderChains(days);
  // The badge text is data-driven and not data-i18n tagged: re-render it when the language changes.
  if (typeof win.MutationObserver === 'function') {
    new win.MutationObserver(renderBadge).observe(doc.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
}
