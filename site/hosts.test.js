import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { MESSAGES, initI18n } from './i18n.js';
import { HOSTS, copyCommand, initHosts } from './hosts.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function load({ storage, clipboard } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/' });
  const win = dom.window;
  Object.defineProperty(win.navigator, 'language', { value: 'en-US', configurable: true });
  if (storage) Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  if (clipboard !== undefined) {
    Object.defineProperty(win.navigator, 'clipboard', { value: clipboard, configurable: true });
  }
  return { doc: win.document, win };
}

function stubStorage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

const flush = () => new Promise((r) => setImmediate(r));
const cmd = (doc, which) => doc.querySelector(`#hostbox [data-cmd="${which}"]`).textContent.trim();
const btns = (doc) => [...doc.querySelectorAll('#hostbox .seg-toggle button[data-host]')];

const CLAUDE_ADD = '/plugin marketplace add seretos-agents/modular-software-factory';
const CLAUDE_INSTALL = '/plugin install <plugin-name>@modular-software-factory';
const CODEX_ADD = 'codex plugin marketplace add https://github.com/seretos-agents/modular-software-factory.git';
const CODEX_INSTALL = 'codex plugin add <plugin-name>@modular-software-factory';

test('initHosts renders one button per host and the first host commands', () => {
  const { doc, win } = load();
  initHosts(doc, win);
  const box = doc.querySelector('[data-page="plugins"] #hostbox');
  assert.ok(box, '#hostbox exists in the plugins hero');
  assert.equal(box.parentElement, doc.querySelector('[data-page="plugins"] .wrap'));
  assert.ok(box.previousElementSibling.classList.contains('stack'));
  assert.ok(HOSTS.length >= 2);
  const buttons = btns(doc);
  assert.equal(buttons.length, HOSTS.length);
  assert.deepEqual(buttons.map((b) => b.textContent.trim()), HOSTS.map((h) => h.label));
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  assert.equal(cmd(doc, 'add'), CLAUDE_ADD);
  assert.equal(cmd(doc, 'install'), CLAUDE_INSTALL);
});

test('clicking a host button swaps commands, pressed state and note', () => {
  const { doc, win } = load();
  initHosts(doc, win);
  doc.querySelector('#hostbox [data-host="codex"]').click();
  for (const b of btns(doc)) {
    assert.equal(b.getAttribute('aria-pressed'), String(b.dataset.host === 'codex'));
  }
  assert.equal(cmd(doc, 'add'), CODEX_ADD);
  assert.equal(cmd(doc, 'install'), CODEX_INSTALL);
  const note = doc.querySelector('#hostnote');
  assert.equal(note.hidden, false);
  assert.equal(note.textContent.trim(), MESSAGES.en['install.note.codex']);
  // switching back restores Claude
  doc.querySelector('#hostbox [data-host="claude"]').click();
  assert.equal(cmd(doc, 'add'), CLAUDE_ADD);
  assert.equal(note.textContent.trim(), MESSAGES.en['install.note.claude']);
});

test('a host without a note hides #hostnote', () => {
  const { doc, win } = load();
  initHosts(doc, win, [...HOSTS, { id: 'plain', label: 'Plain', addCommand: 'p add', installCommand: 'p install' }]);
  doc.querySelector('#hostbox [data-host="codex"]').click();
  assert.equal(doc.querySelector('#hostnote').hidden, false);
  doc.querySelector('#hostbox [data-host="plain"]').click();
  assert.equal(doc.querySelector('#hostnote').hidden, true);
});

test('a third host entry renders a third option with its own commands', () => {
  const { doc, win } = load();
  const hosts = [...HOSTS, { id: 'mistral', label: 'Mistral', addCommand: 'x add', installCommand: 'x install' }];
  initHosts(doc, win, hosts);
  assert.equal(btns(doc).length, HOSTS.length + 1);
  doc.querySelector('#hostbox [data-host="mistral"]').click();
  assert.equal(cmd(doc, 'add'), 'x add');
  assert.equal(cmd(doc, 'install'), 'x install');
});

test('HOSTS data is well-formed and its note keys exist in both languages', () => {
  assert.ok(HOSTS.length >= 2);
  const ids = new Set();
  for (const h of HOSTS) {
    for (const f of ['id', 'label', 'addCommand', 'installCommand']) {
      assert.ok(typeof h[f] === 'string' && h[f].length > 0, `${h.id} missing ${f}`);
    }
    assert.ok(!ids.has(h.id), `duplicate id ${h.id}`);
    ids.add(h.id);
    if (h.note) {
      assert.ok(MESSAGES.en[h.note], `en missing ${h.note}`);
      assert.ok(MESSAGES.de[h.note], `de missing ${h.note}`);
    }
  }
});

test('copy button writes the selected host command', async () => {
  const written = [];
  const clipboard = { writeText: (t) => { written.push(t); return Promise.resolve(); } };
  const { doc, win } = load({ clipboard });
  const timers = [];
  win.setTimeout = (fn) => { timers.push(fn); return 1; };
  initHosts(doc, win);
  doc.querySelector('#hostbox [data-host="codex"]').click();
  const cp = doc.querySelectorAll('#hostbox .cp')[1];
  cp.click();
  await flush();
  assert.deepEqual(written, [CODEX_INSTALL]);
  assert.ok(cp.classList.contains('ok'));
  assert.equal(cp.textContent.trim(), MESSAGES.en['install.copied']);
  timers.forEach((fn) => fn());
  assert.ok(!cp.classList.contains('ok'));
  assert.equal(cp.textContent.trim(), MESSAGES.en['install.copy']);
});

test('copyCommand resolves false without throwing when clipboard is missing or rejects', async () => {
  assert.equal(await copyCommand({ navigator: {} }, 'x'), false);
  const rejecting = { navigator: { clipboard: { writeText: () => Promise.reject(new Error('no')) } } };
  assert.equal(await copyCommand(rejecting, 'x'), false);
  const ok = { navigator: { clipboard: { writeText: () => Promise.resolve() } } };
  assert.equal(await copyCommand(ok, 'x'), true);
});

test('language switch translates panel labels and note but not commands', () => {
  const { doc, win } = load({ storage: stubStorage() });
  initHosts(doc, win);
  initI18n(doc, win);
  const add = cmd(doc, 'add');
  const install = cmd(doc, 'install');
  doc.querySelector('[data-lang="de"]').click();
  assert.equal(doc.querySelector('#hostbox .lbl').textContent.trim(), MESSAGES.de['install.label']);
  assert.notEqual(MESSAGES.de['install.label'], MESSAGES.en['install.label']);
  assert.equal(doc.querySelector('#hostbox .step span').textContent.trim(), MESSAGES.de['install.step.add']);
  assert.equal(doc.querySelector('#hostnote').textContent.trim(), MESSAGES.de['install.note.claude']);
  assert.equal(cmd(doc, 'add'), add);
  assert.equal(cmd(doc, 'install'), install);
  doc.querySelector('#hostbox [data-host="codex"]').click();
  assert.equal(doc.querySelector('#hostnote').textContent.trim(), MESSAGES.de['install.note.codex']);
});
