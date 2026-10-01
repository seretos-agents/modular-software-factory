// The System tab's process-line board (#35): a scripted, replayable walkthrough of fictional tickets
// #26-#30 from Backlog to merged PR. This is demo data, not a live feed.
//
// Layers: SCRIPT is data (frames of ops); applyFrame/stateAt are a pure reducer over it; renderBoard
// paints a state; initBoard is the player. All copy is an i18n key ('board.*' in site/i18n.js).
import { MESSAGES, translate } from './i18n.js';

export const FRAME_MS = 3000;
const ROW_PITCH = 68; // px between process rows; keep in sync with .row height (58px) + gap in styles.css

export const COLUMNS = [
  { id: 'backlog', name: 'board.col.backlog', owner: 'board.col.backlog.owner', tone: 'you' },
  { id: 'planned', name: 'board.col.planned', owner: 'board.col.planned.owner', tone: 'sys' },
  { id: 'todo', name: 'board.col.todo', owner: 'board.col.todo.owner', tone: 'you' },
  { id: 'run', name: 'board.col.run', owner: 'board.col.run.owner', tone: 'sys' },
  { id: 'done', name: 'board.col.done', owner: 'board.col.done.owner', tone: 'sys' },
];

export const PROCESS = {
  code: {
    agent: 'agent-autonomous-developer',
    label: 'board.kind.code',
    steps: [
      'board.step.plan', 'board.step.planCritic', 'board.step.tests', 'board.step.testCritic',
      'board.step.implement', 'board.step.review', 'board.step.prci',
    ],
  },
  prose: {
    agent: 'agent-autonomous-prompt-engineer',
    label: 'board.kind.prose',
    steps: [
      'board.step.plan', 'board.step.scenarioCritic', 'board.step.baseline', 'board.step.write',
      'board.step.evidence', 'board.step.review', 'board.step.prci',
    ],
  },
};

const MERGED = 'board.badge.merged';
const BLOCKED = 'board.badge.blocked';
const QUESTION = 'board.badge.question';
const ANSWERED = 'board.badge.answered';
const CODE = 'board.badge.code';
const PROSE = 'board.badge.prose';

// badge key -> tone class suffix (.tone-*)
const BADGE_TONE = {
  [QUESTION]: 'you',
  [ANSWERED]: 'you',
  [MERGED]: 'ok',
  [BLOCKED]: 'muted',
  [CODE]: 'muted',
  [PROSE]: 'prose',
  'board.badge.bundle': 'sys',
  'board.badge.split': 'prose',
};

const N = {
  submitted: 'board.note.submitted',
  accepted: 'board.note.accepted',
  approved: 'board.note.approved',
  pr: 'board.note.pr',
  ci: 'board.note.ciGreen',
};

// ops
const add = (id, kind, title, badges = []) => ({ op: 'add', id, kind, title, column: 'backlog', badges });
const remove = (id) => ({ op: 'remove', id });
const move = (id, column) => ({ op: 'move', id, column });
const badge = (id, plus = [], minus = []) => ({ op: 'badge', id, add: plus, del: minus });
const start = (pkg, kind) => ({ op: 'start', pkg, kind });
const step = (i, status, round, note = null) => ({ op: 'step', i, status, round, note });
const finish = (pkg) => ({ op: 'finish', pkg });

const frame = (id, actor, focus, ops, say = `board.say.${id}`) => ({ id, actor, say, focus, ops });
const run = (id, ops, say, focus = 'run') => frame(id, 'sys', focus, ops, say);

// One critic/reviewer gate: the author row `a` hands to critic row `c`; every rejection takes two
// frames (the critic's row goes rejected, then the runner jumps back to the author, round + 1).
// Ends on the submission of the final round, so the caller adds the accepting frame.
function gate(pk, name, a, c, rejections, { skipFirstSubmit = false } = {}) {
  const out = [];
  const submit = (r) => run(`${pk}-${name}-sub${r}`, [step(a, 'done', r, N.submitted), step(c, 'current', r)], 'board.say.submit');
  for (let r = 1; r <= rejections; r += 1) {
    if (r > 1 || !skipFirstSubmit) out.push(submit(r));
    out.push(run(`${pk}-${name}-r${r}`, [step(c, 'rejected', r, `board.note.${pk}-${name}-r${r}`)]));
    out.push(run(`${pk}-${name}-back${r}`, [step(a, 'current', r + 1)], 'board.say.back'));
  }
  if (rejections > 0 || !skipFirstSubmit) out.push(submit(rejections + 1));
  return out;
}

const accept = (id, c, round, next, say) => run(id, [step(c, 'done', round, N.accepted), step(next, 'current', 1)], say);
const toPr = (id, c, round) => run(id, [step(c, 'done', round, N.approved), step(6, 'current', 1, N.pr)], 'board.say.approved');
const ciGreen = (id) => run(id, [step(6, 'done', 1, N.ci)], 'board.say.ci');

export const SCRIPT = [
  // gatekeeper
  frame('backlog', 'you', 'backlog', [
    add('26', 'code', 'board.title.26'), add('27', 'code', 'board.title.27'),
    add('28', 'code', 'board.title.28'), add('29', 'code', 'board.title.29'),
  ]),
  frame('gate-read', 'sys', 'backlog', []),
  frame('gate-split', 'sys', 'backlog', [
    badge('26', [CODE]),
    add('30', 'prose', 'board.title.30', [PROSE, 'board.badge.split']),
  ]),
  frame('gate-bundle', 'sys', 'backlog', [
    remove('28'), remove('29'), add('28+29', 'code', 'board.title.bundle', [CODE, 'board.badge.bundle']),
  ]),
  frame('gate-ask', 'sys', 'backlog', [badge('27', [CODE, QUESTION])]),
  frame('release-1', 'sys', 'planned', [
    move('26', 'planned'), move('30', 'planned'), move('28+29', 'planned'), badge('30', [BLOCKED]),
  ]),
  frame('answer', 'you', 'backlog', [badge('27', [ANSWERED], [QUESTION])]),
  frame('release-2', 'sys', 'planned', [move('27', 'planned'), badge('27', [], [ANSWERED])]),
  frame('todo', 'you', 'todo', [
    move('26', 'todo'), move('30', 'todo'), move('28+29', 'todo'), move('27', 'todo'),
  ]),

  // #26: code process, three rounds of plan critic, two of tests, two of review
  run('26-start', [start('26', 'code'), step(0, 'current', 1)]),
  ...gate('26', 'pc', 0, 1, 2),
  accept('26-pc-ok', 1, 3, 2),
  ...gate('26', 'tc', 2, 3, 1),
  accept('26-tc-ok', 3, 2, 4, 'board.say.pass'),
  ...gate('26', 'rv', 4, 5, 1),
  toPr('26-rv-ok', 5, 2),
  ciGreen('26-ci'),
  run('26-merged', [finish('26')], undefined, 'done'),
  frame('unblock', 'sys', 'todo', [badge('30', [], [BLOCKED])]),

  // #30: prose process (prompt engineer), different gates
  run('30-start', [start('30', 'prose'), step(0, 'current', 1)]),
  ...gate('30', 'sc', 0, 1, 2),
  accept('30-sc-ok', 1, 3, 2),
  run('30-baseline', [step(2, 'done', 1, 'board.note.baseline'), step(3, 'current', 1)]),
  run('30-write', [step(3, 'done', 1, 'board.note.written'), step(4, 'current', 1)]),
  run('30-evidence', [step(4, 'done', 1, 'board.note.evidence'), step(5, 'current', 1)]),
  ...gate('30', 'rv', 3, 5, 1, { skipFirstSubmit: true }),
  toPr('30-rv-ok', 5, 2),
  ciGreen('30-ci'),
  run('30-merged', [finish('30')], undefined, 'done'),

  // #28 + #29: one bundled code package; CI fails on the Windows runner and the worker fixes it itself
  run('bundle-start', [start('28+29', 'code'), step(0, 'current', 1)]),
  ...gate('bundle', 'pc', 0, 1, 1),
  accept('bundle-pc-ok', 1, 2, 2, 'board.say.pass'),
  ...gate('bundle', 'tc', 2, 3, 2),
  accept('bundle-tc-ok', 3, 3, 4, 'board.say.pass'),
  ...gate('bundle', 'rv', 4, 5, 1),
  toPr('bundle-rv-ok', 5, 2),
  run('bundle-ci-r1', [step(6, 'failed', 1, 'board.note.ciWindows')]),
  run('bundle-ci-fix', [step(6, 'current', 2, 'board.note.ciFix')]),
  run('bundle-ci-r2', [step(6, 'done', 2, N.ci)]),
  run('bundle-merged', [finish('28+29')], undefined, 'done'),

  // #27: plan built on the human's answer; every gate passes in round 1
  run('27-start', [start('27', 'code'), step(0, 'current', 1)]),
  ...gate('27', 'pc', 0, 1, 0),
  accept('27-pc-ok', 1, 1, 2),
  ...gate('27', 'tc', 2, 3, 0),
  accept('27-tc-ok', 3, 1, 4, 'board.say.pass'),
  ...gate('27', 'rv', 4, 5, 0),
  toPr('27-rv-ok', 5, 1),
  ciGreen('27-ci'),
  run('27-merged', [finish('27')], undefined, 'done'),
];

export function frameIndex(id, script = SCRIPT) {
  return script.findIndex((f) => f.id === id);
}

export function initialState() {
  return { cards: [], active: null };
}

function idleRows(kind) {
  return PROCESS[kind].steps.map(() => ({ status: 'idle', round: 0, note: null }));
}

function cardOf(s, id) {
  const c = s.cards.find((x) => x.id === id);
  if (!c) throw new Error(`board script: unknown card ${id}`);
  return c;
}

function needActive(s) {
  if (!s.active) throw new Error('board script: step op without an active process');
  return s.active;
}

const OPS = {
  add: (s, o) => { s.cards.push({ id: o.id, kind: o.kind, title: o.title, column: o.column, badges: [...o.badges] }); },
  remove: (s, o) => { s.cards = s.cards.filter((c) => c.id !== o.id); },
  move: (s, o) => { cardOf(s, o.id).column = o.column; },
  badge: (s, o) => {
    const c = cardOf(s, o.id);
    c.badges = [...c.badges.filter((b) => !o.del.includes(b)), ...o.add.filter((b) => !c.badges.includes(b))];
  },
  start: (s, o) => {
    cardOf(s, o.pkg).column = 'run';
    s.active = { pkg: o.pkg, kind: o.kind, runner: 0, rows: idleRows(o.kind) };
  },
  step: (s, o) => {
    const a = needActive(s);
    a.rows[o.i] = { status: o.status, round: o.round, note: o.note };
    a.runner = o.i;
  },
  finish: (s, o) => {
    const c = cardOf(s, o.pkg);
    s.cards = s.cards.filter((x) => x !== c); // merged cards queue up in Done in merge order
    c.column = 'done';
    if (!c.badges.includes(MERGED)) c.badges = [...c.badges, MERGED];
    s.cards.push(c);
    if (s.active && s.active.pkg === o.pkg) s.active = null;
  },
};

// Pure: returns a new state, never touches `state`.
export function applyFrame(state, f) {
  const s = {
    cards: state.cards.map((c) => ({ ...c, badges: [...c.badges] })),
    active: state.active && { ...state.active, rows: state.active.rows.map((r) => ({ ...r })) },
  };
  for (const o of f.ops) OPS[o.op](s, o);
  return s;
}

export function stateAt(i, script = SCRIPT) {
  let s = initialState();
  for (let k = 0; k <= i && k < script.length; k += 1) s = applyFrame(s, script[k]);
  return s;
}

// ---- rendering ----

const rendered = new WeakMap(); // board root -> { cols: Map(card id -> column), pkg }

function mk(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// translatable node: the key is on the element so applyLanguage (i18n.js) re-translates it on a switch
function tx(doc, tag, cls, key, t) {
  const n = mk(doc, tag, cls, t(key));
  n.dataset.i18n = key;
  return n;
}

const cardLabel = (id) => id.split('+').map((p) => `#${p}`).join(' + ');
const showRound = (r) => r.round > 1 || r.status === 'rejected' || r.status === 'failed';

function buildColumn(doc, col, t) {
  const el = mk(doc, 'div', 'col');
  el.dataset.col = col.id;
  const head = mk(doc, 'div', 'ch');
  const top = mk(doc, 'div');
  top.append(tx(doc, 'strong', '', col.name, t), mk(doc, 'span', 'n', '0'));
  head.append(top, tx(doc, 'span', `o ${col.tone}`, col.owner, t));
  el.append(head, mk(doc, 'div', 'list'));
  if (col.id === 'run') el.append(mk(doc, 'div', 'slot'));
  return el;
}

function buildCard(doc, c, t, entered) {
  const el = mk(doc, 'div', entered ? 'card enter' : 'card');
  el.dataset.id = c.id;
  el.append(mk(doc, 'span', 'num', cardLabel(c.id)), tx(doc, 'span', 't', c.title, t));
  for (const b of c.badges) el.append(tx(doc, 'span', `badge tone-${BADGE_TONE[b] ?? 'muted'}`, b, t));
  return el;
}

function buildProc(doc, active, t) {
  const def = PROCESS[active.kind];
  const proc = mk(doc, 'div', 'proc');
  proc.dataset.kind = active.kind;
  const ph = mk(doc, 'div', 'ph');
  ph.append(mk(doc, 'span', '', def.agent), tx(doc, 'span', '', def.label, t));
  const rows = mk(doc, 'div', 'rows');
  rows.style.height = `${def.steps.length * ROW_PITCH}px`;
  def.steps.forEach((key, i) => {
    const row = mk(doc, 'div', 'row st-idle');
    row.style.top = `${i * ROW_PITCH}px`;
    row.append(tx(doc, 'span', 'rl', key, t), mk(doc, 'span', 'rs'));
    rows.append(row);
  });
  const runner = mk(doc, 'div', 'runner');
  runner.append(mk(doc, 'span', 'rn'), tx(doc, 'span', 'rt', def.steps[0], t));
  rows.append(runner);
  proc.append(ph, rows);
  return proc;
}

function detail(doc, r, t) {
  const out = [];
  if (showRound(r)) out.push(tx(doc, 'span', '', 'board.round', t), doc.createTextNode(` ${r.round}`));
  if (r.note) {
    if (out.length) out.push(doc.createTextNode(' · '));
    out.push(tx(doc, 'span', '', r.note, t));
  }
  return out;
}

function updateProc(doc, proc, active, t) {
  const def = PROCESS[active.kind];
  proc.querySelectorAll('.row').forEach((row, i) => {
    const r = active.rows[i];
    row.className = `row st-${r.status}`;
    row.querySelector('.rs').replaceChildren(...detail(doc, r, t));
  });
  const cur = active.rows[active.runner];
  const runner = proc.querySelector('.runner');
  runner.style.top = `${active.runner * ROW_PITCH}px`;
  runner.className = `runner st-${cur.status}`;
  const rn = runner.querySelector('.rn');
  rn.replaceChildren(doc.createTextNode(cardLabel(active.pkg)));
  if (showRound(cur)) rn.append(doc.createTextNode(' · '), tx(doc, 'span', '', 'board.round', t), doc.createTextNode(` ${cur.round}`));
  const rt = runner.querySelector('.rt');
  rt.dataset.i18n = def.steps[active.runner];
  rt.textContent = t(def.steps[active.runner]);
}

export function renderBoard(doc, root, state, f, t) {
  let memo = rendered.get(root);
  if (!memo) {
    root.replaceChildren(...COLUMNS.map((col) => buildColumn(doc, col, t)));
    memo = { cols: null, pkg: undefined };
    rendered.set(root, memo);
  }
  for (const col of COLUMNS) {
    const el = root.querySelector(`.col[data-col="${col.id}"]`);
    el.className = f && f.focus === col.id ? `col f-${f.actor}` : 'col';
    const cards = state.cards.filter((c) => c.column === col.id);
    el.querySelector('.n').textContent = String(cards.length);
    el.querySelector('.list').replaceChildren(
      ...cards.map((c) => buildCard(doc, c, t, memo.cols !== null && memo.cols.get(c.id) !== c.column)),
    );
  }
  // The process (and its persistent runner, whose `top` transition animates) is only rebuilt when the
  // active package changes; otherwise rows are updated in place.
  const slot = root.querySelector('.slot');
  const pkg = state.active ? state.active.pkg : null;
  if (memo.pkg !== pkg) {
    slot.replaceChildren(state.active ? buildProc(doc, state.active, t) : tx(doc, 'div', 'idle', 'board.idle', t));
    memo.pkg = pkg;
  }
  if (state.active) updateProc(doc, slot.firstChild, state.active, t);
  memo.cols = new Map(state.cards.map((c) => [c.id, c.column]));
}

// ---- player ----

const ICON = {
  play: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>',
};

export function initBoard(doc, win, { dict = MESSAGES, script = SCRIPT, interval = FRAME_MS } = {}) {
  const root = doc.getElementById('board');
  if (!root) return null;
  const q = (sel) => doc.querySelector(sel);
  const [prevBtn, toggleBtn, nextBtn] = doc.querySelectorAll('.ctrl button');
  const t = (key) => translate(dict, doc.documentElement.lang, key);
  let index = 0;
  let handle = null;

  function render() {
    const f = script[index];
    renderBoard(doc, root, stateAt(index, script), f, t);
    const txt = q('.narr .txt');
    txt.dataset.i18n = f.say;
    txt.textContent = t(f.say);
    const who = q('.narr .who');
    who.className = `who tone-${f.actor}`;
    who.dataset.i18n = `board.actor.${f.actor}`;
    who.textContent = t(who.dataset.i18n);
    q('.narr .cnt').textContent = `${index + 1} / ${script.length}`;
    q('.bar > div').style.width = `${((index + 1) / script.length) * 100}%`;
  }

  function showPlaying(playing) {
    q('.paused').classList.toggle('on', !playing);
    toggleBtn.innerHTML = playing ? ICON.pause : ICON.play;
    const key = playing ? 'board.ctrl.pause' : 'board.ctrl.play';
    toggleBtn.dataset.i18nAriaLabel = key;
    toggleBtn.setAttribute('aria-label', t(key));
  }

  function go(i) {
    index = Math.min(Math.max(i, 0), script.length - 1);
    render();
  }
  const next = () => go(index + 1 >= script.length ? 0 : index + 1);
  const prev = () => go(index - 1);
  function play() {
    if (handle === null) handle = win.setInterval(next, interval);
    showPlaying(true);
  }
  function pause() {
    if (handle !== null) {
      win.clearInterval(handle);
      handle = null;
    }
    showPlaying(false);
  }

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  toggleBtn.addEventListener('click', () => (handle === null ? play() : pause()));

  render();
  const reduceMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduceMotion) pause();
  else play();
  return { go, next, prev, play, pause };
}
