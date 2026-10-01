// Driving tests for the System tab's process-line board (#35).
//
// State contract used here (the implementation must provide it):
//   state = { cards: [{ id, kind, column, badges: [i18nKey, ...] }], active: null | { pkg, kind, rows, runner } }
//   rows[i] = { status: 'idle'|'current'|'done'|'rejected'|'failed', round, ... }; runner = row index
//   card ids: '26' '27' '28' '29' '30' and the bundle '28+29'; kind: 'code' | 'prose'
// Frame ids the script must expose (via frameIndex):
//   'gate-ask'      last gatekeeper frame: #30 added, #29 gone, bundle card, #27 asks its question
//   '26-pc-r1'      #26 plan critic rejects round 1 (row 1)
//   '26-merged'     #26 finish (card in done with board.badge.merged, no longer active)
//   '30-sc-r1'      #30 (prose) scenario critic rejects round 1 (row 1)
//   'bundle-ci-r1'  bundle PR-CI row failed round 1 (row 6)
//   'bundle-ci-r2'  bundle PR-CI row done round 2 (row 6)
// DOM contract: #board gets five .col[data-col=<COLUMNS id>]; .proc[data-kind] > .ph + 7 .row; .runner;
//   .txt narration; .cnt; .paused; .ctrl > 3 buttons (prev, play/pause, next).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { MESSAGES, initI18n } from './i18n.js';
import {
  COLUMNS, PROCESS, SCRIPT, initialState, applyFrame, stateAt, frameIndex, initBoard,
} from './board.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function stubStorage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

// Loads the real page and stubs timers (and optionally matchMedia) on the window.
function load({ reduced } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/' });
  const win = dom.window;
  Object.defineProperty(win, 'localStorage', { value: stubStorage(), configurable: true });
  const timers = { set: [], cleared: [], fns: [] };
  win.setInterval = (fn, ms) => { timers.fns.push(fn); timers.set.push(ms); return timers.set.length; };
  win.clearInterval = (id) => { timers.cleared.push(id); };
  if (reduced !== undefined) win.matchMedia = () => ({ matches: reduced });
  return { doc: win.document, win, timers };
}

const card = (state, id) => state.cards.find((c) => c.id === id);
const idx = (id) => {
  const i = frameIndex(id);
  assert.ok(i >= 0, `frame id ${id} must exist`);
  return i;
};
const cleanText = (el) => el.textContent.replace(/\s+/g, ' ').trim();

test('state machine tracks #26 through rejections to merged', () => {
  assert.ok(SCRIPT.length > 0, 'SCRIPT has frames');
  const s0 = stateAt(0);
  for (const id of ['26', '27', '28', '29']) assert.equal(card(s0, id)?.column, 'backlog', `#${id} in backlog at frame 0`);
  assert.equal(s0.active, null);

  const gk = stateAt(idx('gate-ask'));
  assert.equal(card(gk, '30')?.kind, 'prose');
  assert.equal(card(gk, '29'), undefined);
  assert.ok(card(gk, '28+29'), 'bundle card exists');
  assert.equal(card(gk, '28'), undefined);
  assert.ok(card(gk, '27').badges.includes('board.badge.question'));

  const r1 = idx('26-pc-r1');
  const rej = stateAt(r1);
  assert.equal(rej.active.pkg, '26');
  assert.equal(rej.active.kind, 'code');
  assert.deepEqual({ status: rej.active.rows[1].status, round: rej.active.rows[1].round }, { status: 'rejected', round: 1 });
  assert.equal(rej.active.runner, 1);

  const back = stateAt(r1 + 1);
  assert.equal(back.active.runner, 0);
  assert.equal(back.active.rows[0].status, 'current');
  assert.equal(back.active.rows[0].round, 2);

  const merged = stateAt(idx('26-merged'));
  assert.equal(card(merged, '26').column, 'done');
  assert.ok(card(merged, '26').badges.includes('board.badge.merged'));
  assert.notEqual(merged.active?.pkg, '26');

  const before = JSON.stringify(s0);
  const next = applyFrame(s0, SCRIPT[1]);
  assert.equal(JSON.stringify(s0), before, 'applyFrame must not mutate its input');
  assert.notEqual(next, s0);

  // the process ops (start/step/finish) must not mutate their input either
  for (let i = 1; i < SCRIPT.length; i += 1) {
    const prior = stateAt(i - 1);
    const snap = JSON.stringify(prior);
    applyFrame(prior, SCRIPT[i]);
    assert.equal(JSON.stringify(prior), snap, `frame ${SCRIPT[i].id} must not mutate its input`);
  }
  assert.ok(stateAt(r1 - 1).active, 'a frame with an active process was exercised above');
});

test('state machine edge cases: every frame reduces, last frame all merged, bundle CI fails then passes', () => {
  assert.ok(SCRIPT.length > 0);
  let s = initialState();
  for (const f of SCRIPT) assert.doesNotThrow(() => { s = applyFrame(s, f); });
  const last = stateAt(SCRIPT.length - 1);
  assert.ok(last.cards.length > 0);
  for (const c of last.cards) {
    assert.equal(c.column, 'done', `#${c.id} done at the end`);
    assert.ok(c.badges.includes('board.badge.merged'), `#${c.id} merged at the end`);
  }
  const fail = stateAt(idx('bundle-ci-r1')).active;
  assert.equal(fail.pkg, '28+29');
  assert.deepEqual({ status: fail.rows[6].status, round: fail.rows[6].round }, { status: 'failed', round: 1 });
  const ok = stateAt(idx('bundle-ci-r2')).active;
  assert.equal(ok.pkg, '28+29');
  assert.deepEqual({ status: ok.rows[6].status, round: ok.rows[6].round }, { status: 'done', round: 2 });
});

test('renders code and prose process rows', () => {
  const { doc, win } = load();
  const board = initBoard(doc, win);
  const cols = [...doc.querySelectorAll('#board .col')];
  assert.equal(cols.length, 5);
  assert.deepEqual(cols.map((c) => c.dataset.col), ['backlog', 'planned', 'todo', 'run', 'done']);
  assert.deepEqual(COLUMNS.map((c) => c.id), ['backlog', 'planned', 'todo', 'run', 'done']);

  const check = (frameId, kind) => {
    board.go(idx(frameId));
    const proc = doc.querySelector(`#board .proc[data-kind="${kind}"]`);
    assert.ok(proc, `${kind} process shown at ${frameId}`);
    assert.equal(doc.querySelectorAll('#board .proc').length, 1);
    assert.ok(proc.querySelector('.ph').textContent.includes(PROCESS[kind].agent));
    const rows = [...proc.querySelectorAll('.row')];
    assert.equal(rows.length, 7);
    PROCESS[kind].steps.forEach((key, i) => {
      assert.ok(MESSAGES.en[key], `${key} exists`);
      assert.ok(rows[i].textContent.includes(MESSAGES.en[key]), `row ${i} shows ${key}`);
    });
  };
  check('26-pc-r1', 'code');
  assert.equal(PROCESS.code.agent, 'agent-autonomous-developer');
  check('30-sc-r1', 'prose');
  assert.equal(PROCESS.prose.agent, 'agent-autonomous-prompt-engineer');
  assert.notDeepEqual(PROCESS.code.steps, PROCESS.prose.steps);
  const labels = (kind) => PROCESS[kind].steps.map((k) => MESSAGES.en[k]);
  assert.deepEqual(labels('code'), ['Plan', 'Plan critic', 'Tests first', 'Test critic', 'Implement', 'Review', 'PR·CI']);
  assert.deepEqual(labels('prose'), ['Plan', 'Scenario critic', 'Baseline', 'Write', 'Evidence', 'Review', 'PR·CI']);
});

test('rejection frame renders rejected row, round and runner', () => {
  const { doc, win } = load();
  const board = initBoard(doc, win);
  const r1 = idx('26-pc-r1');
  board.go(r1);
  const row = doc.querySelectorAll('#board .proc .row')[1];
  assert.ok(row.classList.contains('st-rejected'));
  assert.ok(row.textContent.includes(MESSAGES.en['board.round']));
  assert.match(cleanText(row), new RegExp(String.raw`${MESSAGES.en['board.round']}\s*1(?!\d)`), 'row shows "round 1"');
  const runner = doc.querySelector('#board .runner');
  assert.ok(runner.classList.contains('st-rejected'));
  assert.equal(runner.style.top, '68px');

  board.go(r1 + 1);
  assert.equal(doc.querySelector('#board .runner').style.top, '0px');
  assert.ok(doc.querySelectorAll('#board .proc .row')[0].classList.contains('st-current'));
  assert.match(cleanText(doc.querySelectorAll('#board .proc .row')[0]), new RegExp(String.raw`${MESSAGES.en['board.round']}\s*2(?!\d)`), 'back at the author in round 2');

  board.go(idx('26-merged'));
  const done = doc.querySelector('#board .col[data-col="done"]');
  const c26 = [...done.querySelectorAll('.card')].find((c) => c.textContent.includes('26'));
  assert.ok(c26, '#26 card in Done column');
  assert.ok(c26.textContent.includes(MESSAGES.en['board.badge.merged']));
});

test('controls step, pause, loop; reduced motion starts paused', () => {
  const { doc, win, timers } = load({ reduced: false });
  const board = initBoard(doc, win);
  const N = SCRIPT.length;
  assert.ok(N > 2);
  assert.equal(timers.set.length, 1, 'autoplay arms one interval');
  assert.ok(timers.set[0] > 0);
  assert.equal(cleanText(doc.querySelector('.cnt')), `1 / ${N}`);
  assert.ok(!doc.querySelector('.paused').classList.contains('on'));

  const [prev, toggle, next] = doc.querySelectorAll('.ctrl button');
  next.click();
  assert.equal(cleanText(doc.querySelector('.cnt')), `2 / ${N}`);
  assert.ok(Math.abs(parseFloat(doc.querySelector('.bar > div').style.width) - (2 / N) * 100) < 0.01, 'bar width = (i+1)/N');
  prev.click();
  assert.equal(cleanText(doc.querySelector('.cnt')), `1 / ${N}`);

  timers.fns[0]();
  assert.equal(cleanText(doc.querySelector('.cnt')), `2 / ${N}`, 'interval tick advances a frame');

  toggle.click();
  assert.deepEqual(timers.cleared, [1], 'pause clears the handle the first interval returned');
  assert.ok(doc.querySelector('.paused').classList.contains('on'));
  toggle.click();
  assert.equal(timers.set.length, 2, 'resume arms a new interval');
  assert.ok(!doc.querySelector('.paused').classList.contains('on'));

  board.pause();
  assert.deepEqual(timers.cleared, [1, 2], 'pause clears the resumed interval handle');
  board.go(N - 1);
  assert.equal(cleanText(doc.querySelector('.cnt')), `${N} / ${N}`);
  board.next();
  assert.equal(cleanText(doc.querySelector('.cnt')), `1 / ${N}`, 'next on the last frame wraps to the start');

  const reduced = load({ reduced: true });
  initBoard(reduced.doc, reduced.win);
  assert.equal(reduced.timers.set.length, 0, 'reduced motion never autoplays');
  assert.ok(reduced.doc.querySelector('.paused').classList.contains('on'));

  const noMq = load();
  initBoard(noMq.doc, noMq.win);
  assert.equal(noMq.timers.set.length, 1, 'no matchMedia defaults to autoplay');
});

function boardKeys() {
  const keys = new Set();
  const walk = (v) => {
    if (typeof v === 'string') { if (v.startsWith('board.')) keys.add(v); } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(SCRIPT); walk(PROCESS); walk(COLUMNS);
  return keys;
}

test('all board keys exist in both languages; DE click re-translates the board', () => {
  const keys = boardKeys();
  assert.ok(keys.size > 20, 'script, process and columns reference board.* keys');
  for (const k of keys) {
    assert.ok(MESSAGES.en[k], `en missing ${k}`);
    assert.ok(MESSAGES.de[k], `de missing ${k}`);
  }

  const { doc, win } = load();
  const board = initBoard(doc, win);
  initI18n(doc, win);
  const gate = idx('26-pc-r1');
  board.go(gate);
  const say = (i) => SCRIPT[i].say;
  assert.equal(cleanText(doc.querySelector('.txt')), MESSAGES.en[say(gate)]);

  doc.querySelector('[data-lang="de"]').click();
  assert.notEqual(MESSAGES.de[say(gate)], MESSAGES.en[say(gate)]);
  assert.equal(cleanText(doc.querySelector('.txt')), MESSAGES.de[say(gate)]);
  const rows = [...doc.querySelectorAll('#board .proc .row')];
  const labelOf = (row, key) => row.querySelector(`.rl[data-i18n="${key}"]`);
  PROCESS.code.steps.forEach((key, i) => assert.equal(labelOf(rows[i], key)?.textContent, MESSAGES.de[key], `row ${i} German`));

  // frames rendered after the switch (autoplay/next) must also come out German
  board.next();
  assert.notEqual(MESSAGES.de[say(gate + 1)], MESSAGES.en[say(gate + 1)]);
  assert.equal(cleanText(doc.querySelector('.txt')), MESSAGES.de[say(gate + 1)]);
  PROCESS.code.steps.forEach((key, i) => {
    assert.equal(labelOf(doc.querySelectorAll('#board .proc .row')[i], key)?.textContent, MESSAGES.de[key], `row ${i} still German after next`);
  });

  // a freshly built process (new active package) is German too
  board.go(idx('30-sc-r1'));
  const prow = [...doc.querySelectorAll('#board .proc[data-kind="prose"] .row')];
  assert.equal(prow.length, 7);
  PROCESS.prose.steps.forEach((key, i) => assert.equal(labelOf(prow[i], key)?.textContent, MESSAGES.de[key], `prose row ${i} German`));
});
