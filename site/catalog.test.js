import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { MESSAGES, initI18n } from './i18n.js';
import { HOSTS, initHosts } from './hosts.js';
import { initTabs } from './tabs.js';
import {
  CATALOG_URL,
  allTags,
  categoryCounts,
  filterPlugins,
  initCatalog,
  initials,
  parseHashName,
  renderMarkdown,
  sourceUrl,
} from './catalog.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
// Snapshot of .claude-plugin/marketplace.json (14 plugins); never fetched from the network.
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/marketplace.json', import.meta.url), 'utf8'));
const PLUGINS = FIXTURE.plugins;
const byName = (n) => PLUGINS.find((p) => p.name === n);
const HARNESS = byName('agent-harness');
const COMFY = byName('agent-comfy');
const flush = () => new Promise((r) => setImmediate(r));

const resp = (body) => ({
  ok: true,
  status: 200,
  json: async () => JSON.parse(body),
  text: async () => body,
});

// `overrides[url]` may return a body string, a Promise of one, or throw/reject.
function makeFetch(calls, overrides = {}, catalog = FIXTURE) {
  return (url) => {
    calls.push(url);
    if (url in overrides) return Promise.resolve(overrides[url]()).then(resp);
    if (url === CATALOG_URL) return Promise.resolve(resp(JSON.stringify(catalog)));
    if (PLUGINS.some((p) => p.description_url === url)) return Promise.resolve(resp(`# Docs\n\ntext for ${url}`));
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  };
}

function stubStorage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

async function setup({ hash = '#plugins', overrides, catalog, fetchImpl, hosts, clipboard, i18n = false } = {}) {
  const dom = new JSDOM(html, { url: `https://example.test/${hash}` });
  const win = dom.window;
  const doc = win.document;
  Object.defineProperty(win.navigator, 'language', { value: 'en-US', configurable: true });
  Object.defineProperty(win, 'localStorage', { value: stubStorage(), configurable: true });
  if (clipboard) Object.defineProperty(win.navigator, 'clipboard', { value: clipboard, configurable: true });
  // jsdom does not implement showModal/close: stub with browser semantics.
  const proto = win.HTMLDialogElement.prototype;
  proto.showModal = function showModal() { this.setAttribute('open', ''); };
  proto.close = function close() {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new win.Event('close'));
  };
  const calls = [];
  const fetchFn = fetchImpl ?? makeFetch(calls, overrides, catalog);
  win.fetch = fetchFn;
  initTabs(doc, win);
  initHosts(doc, win, hosts);
  const ready = initCatalog(doc, win, { fetch: fetchFn, ...(hosts ? { hosts } : {}) });
  await ready;
  if (i18n) initI18n(doc, win);
  return { doc, win, calls };
}

function $(root, sel) {
  const el = root.querySelector(sel);
  assert.ok(el, `element ${sel} exists`);
  return el;
}
const text = (root, sel) => $(root, sel).textContent.trim();
const card = (doc, name) => $(doc, `#plist .pcard[data-name="${name}"]`);
const openCard = async (doc, name) => { card(doc, name).click(); await flush(); };
const dlg = (doc) => $(doc, '#pmodal');
const isOpen = (doc) => doc.querySelector('#pmodal')?.hasAttribute('open') === true;
const names = (doc) => [...doc.querySelectorAll('#plist .pcard')].map((c) => c.dataset.name).sort();
const allCount = (doc) => text(doc, '#cats [data-cat="all"] em');
const typeQuery = (doc, win, q) => {
  const input = $(doc, '#q');
  input.value = q;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
};

// ---------- R3 pure filter ----------

test('filterPlugins: case-insensitive match on name, description and tags', () => {
  assert.deepEqual(filterPlugins(PLUGINS, { q: 'GIT' }).map((p) => p.name).sort(), [
    'agent-autonomous-developer',
    'agent-project-issues',
    'agent-worktree',
  ]);
  assert.deepEqual(filterPlugins(PLUGINS, { q: 'comfyui' }).map((p) => p.name), ['agent-comfy']);
  assert.equal(filterPlugins(PLUGINS, { q: '  ' }).length, 14);
  assert.equal(filterPlugins(PLUGINS, {}).length, 14);
});

test('filterPlugins: search, category and tag combine with AND', () => {
  const mcp = filterPlugins(PLUGINS, { q: 'git', cat: 'mcp' }).map((p) => p.name).sort();
  assert.deepEqual(mcp, ['agent-project-issues', 'agent-worktree']);
  const tagged = filterPlugins(PLUGINS, { q: 'git', cat: 'mcp', tag: 'github' }).map((p) => p.name);
  assert.deepEqual(tagged, ['agent-project-issues']);
  assert.equal(filterPlugins(PLUGINS, { cat: 'all' }).length, 14);
  assert.deepEqual(filterPlugins(PLUGINS, { q: 'zzz' }), []);
});

test('categoryCounts respects search and tag but not the category itself', () => {
  assert.deepEqual(categoryCounts(PLUGINS, {}), [['all', 14], ['hook', 1], ['mcp', 6], ['skill', 7]]);
  const live = Object.fromEntries(categoryCounts(PLUGINS, { q: 'git' }));
  assert.equal(live.all, 3);
  assert.equal(live.mcp, 2);
  assert.equal(live.skill, 1);
});

test('allTags is sorted and distinct', () => {
  assert.deepEqual(allTags(PLUGINS), [
    '3d', 'ai', 'automation', 'claude', 'coding', 'creative', 'environment', 'git',
    'github', 'gitlab', 'hooks', 'line-endings', 'organisation', 'ticket', 'windows',
  ]);
});

test('initials, sourceUrl and parseHashName', () => {
  assert.equal(initials('agent-vdesktop'), 'V');
  assert.equal(initials('agent-line-feed-guard'), 'LF');
  assert.equal(
    sourceUrl(HARNESS),
    'https://github.com/seretos-agents/agent-harness/tree/agent-harness--v0.0.7',
  );
  assert.equal(parseHashName('#plugins/agent-harness'), 'agent-harness');
  assert.equal(parseHashName('#plugins/a%20b'), 'a b');
  assert.equal(parseHashName('#plugins'), null);
  assert.equal(parseHashName('#catalog'), null);
});

// ---------- R2 grid ----------

test('R2 driving test: grid, counts, categories and tags render from fetched data', async () => {
  const { doc, calls } = await setup();
  assert.ok(text(doc, '#ccount').startsWith('14'), `#ccount starts with 14, got "${text(doc, '#ccount')}"`);
  assert.equal(doc.querySelectorAll('#plist .pcard').length, 14);
  assert.deepEqual(
    [...doc.querySelectorAll('#cats button')].map((b) => [b.dataset.cat, b.querySelector('em').textContent.trim()]),
    [['all', '14'], ['hook', '1'], ['mcp', '6'], ['skill', '7']],
  );
  assert.equal($(doc, '#cats [data-cat="all"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual([...doc.querySelectorAll('#tagrow [data-tag]')].map((b) => b.dataset.tag), allTags(PLUGINS));

  const vd = card(doc, 'agent-vdesktop');
  assert.equal(text(vd, '.pimg'), 'V');
  assert.equal(vd.querySelector('.pimg img'), null);

  const h = card(doc, 'agent-harness');
  assert.equal($(h, '.pimg img').getAttribute('src'), HARNESS.icon);
  assert.ok(h.querySelector('.pcat.mcp'));
  assert.equal(text(h, '.pc.v'), 'v0.0.7');
  assert.equal(text(h, '.pd'), HARNESS.description);
  assert.deepEqual(calls, [CATALOG_URL]);
});

test('a failed catalog fetch shows the error empty state', async () => {
  const { doc } = await setup({ fetchImpl: () => Promise.reject(new Error('offline')) });
  assert.equal(doc.querySelectorAll('#plist .pcard').length, 0);
  assert.equal(text(doc, '#plist .empty'), MESSAGES.en['catalog.error']);
});

test('the footer keeps the mockup sentence and both links', async () => {
  const { doc } = await setup();
  const foot = $(doc, '.cfoot');
  assert.equal(
    foot.textContent.trim(),
    'Snapshot of marketplace.json · every plugin is pinned to a release tag of its own repo · report an issue',
  );
  assert.deepEqual([...foot.querySelectorAll('a')].map((a) => a.getAttribute('href')), [
    'https://github.com/seretos-agents/modular-software-factory/blob/main/.claude-plugin/marketplace.json',
    'https://github.com/seretos-agents/modular-software-factory/issues',
  ]);
});

test('a non-https icon falls back to initials', async () => {
  const bad = structuredClone(FIXTURE);
  bad.plugins.find((p) => p.name === 'agent-comfy').icon = 'http://example.test/icon.png';
  bad.plugins.find((p) => p.name === 'agent-harness').icon = 'javascript:alert(1)';
  const { doc } = await setup({ catalog: bad });
  for (const n of ['agent-comfy', 'agent-harness']) {
    assert.equal(card(doc, n).querySelector('.pimg img'), null, `${n} has no img`);
  }
  assert.equal(text(card(doc, 'agent-comfy'), '.pimg'), 'C');
});

// ---------- R3 DOM ----------

test('R3 driving test: search, category and tag combine; no match shows the empty state', async () => {
  const { doc, win } = await setup();
  typeQuery(doc, win, 'git');
  assert.deepEqual(names(doc), ['agent-autonomous-developer', 'agent-project-issues', 'agent-worktree']);
  assert.equal(allCount(doc), '3');
  $(doc, '#cats [data-cat="mcp"]').click();
  assert.deepEqual(names(doc), ['agent-project-issues', 'agent-worktree']);
  assert.equal($(doc, '#cats [data-cat="mcp"]').getAttribute('aria-pressed'), 'true');
  $(doc, '#tagrow [data-tag="github"]').click();
  assert.deepEqual(names(doc), ['agent-project-issues']);
  assert.equal(allCount(doc), '1');

  typeQuery(doc, win, 'zzz');
  assert.equal(doc.querySelectorAll('#plist .pcard').length, 0);
  assert.equal(text(doc, '#plist .empty'), MESSAGES.en['catalog.empty']);
});

test('clicking a pressed tag again clears it', async () => {
  const { doc, win } = await setup();
  typeQuery(doc, win, 'git');
  $(doc, '#cats [data-cat="mcp"]').click();
  $(doc, '#tagrow [data-tag="github"]').click();
  assert.equal(names(doc).length, 1);
  $(doc, '#tagrow [data-tag="github"]').click();
  assert.deepEqual(names(doc), ['agent-project-issues', 'agent-worktree']);
});

// ---------- R4 modal ----------

test('R4 driving test: card opens the modal, three ways close it, hash follows', async () => {
  const { doc, win } = await setup();
  assert.equal(isOpen(doc), false);
  await openCard(doc, 'agent-harness');
  const d = dlg(doc);
  assert.equal(isOpen(doc), true);
  assert.equal(text(d, 'h3'), 'agent-harness');
  assert.equal(text(d, '.id'), 'agent-harness@modular-software-factory');
  assert.ok(d.textContent.includes(HARNESS.description));
  assert.deepEqual([...d.querySelectorAll('.chips2 .chip')].map((c) => c.textContent.trim()), ['mcp', 'v0.0.7']);
  assert.equal(
    $(d, 'a.src2').getAttribute('href'),
    'https://github.com/seretos-agents/agent-harness/tree/agent-harness--v0.0.7',
  );
  assert.equal(win.location.hash, '#plugins/agent-harness');

  $(d, '.xbtn').click();
  assert.equal(isOpen(doc), false);
  assert.equal(win.location.hash, '#plugins');

  await openCard(doc, 'agent-harness');
  assert.equal(isOpen(doc), true);
  d.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(isOpen(doc), false);
  assert.equal(win.location.hash, '#plugins');

  await openCard(doc, 'agent-harness');
  assert.equal(isOpen(doc), true);
  d.click();
  assert.equal(isOpen(doc), false);
  assert.equal(win.location.hash, '#plugins');
});

test('R4: loading at #plugins/agent-comfy opens that modal on the plugins tab', async () => {
  const { doc } = await setup({ hash: '#plugins/agent-comfy' });
  assert.equal(isOpen(doc), true);
  assert.equal(text(dlg(doc), 'h3'), 'agent-comfy');
  assert.deepEqual(
    [...new Set([...doc.querySelectorAll('[data-page]')].filter((s) => !s.hidden).map((s) => s.dataset.page))],
    ['plugins'],
  );
});

test('R4: an unknown deep link opens nothing; hashchange to #plugins closes; clicks inside stay open', async () => {
  const unknown = await setup({ hash: '#plugins/unknown' });
  assert.equal(isOpen(unknown.doc), false);

  const { doc, win } = await setup();
  await openCard(doc, 'agent-harness');
  $(dlg(doc), '.pmb').click();
  assert.equal(isOpen(doc), true);
  win.location.hash = '#plugins';
  win.dispatchEvent(new win.Event('hashchange'));
  assert.equal(isOpen(doc), false);
});

// ---------- R5 install panel ----------

const modalCmd = (doc, which) => text(dlg(doc), `[data-cmd="${which}"]`);

test('R5 driving test: modal install commands come from HOSTS with the real plugin name', async () => {
  const { doc } = await setup();
  await openCard(doc, 'agent-harness');
  assert.equal(modalCmd(doc, 'install'), HOSTS[0].installCommand.replace('<plugin-name>', 'agent-harness'));
  assert.equal(modalCmd(doc, 'add'), HOSTS[0].addCommand);
  // the hero keeps its template
  assert.ok(text(doc, '#hostbox [data-cmd="install"]').includes('<plugin-name>'));
});

test('R5: the modal starts on the host selected in the hero, and switches host', async () => {
  const { doc } = await setup();
  $(doc, '#hostbox [data-host="codex"]').click();
  await openCard(doc, 'agent-harness');
  const codex = HOSTS.find((h) => h.id === 'codex');
  assert.equal(modalCmd(doc, 'install'), codex.installCommand.replace('<plugin-name>', 'agent-harness'));
  assert.equal($(dlg(doc), '[data-host="codex"]').getAttribute('aria-pressed'), 'true');
  $(dlg(doc), '[data-host="claude"]').click();
  assert.equal(modalCmd(doc, 'install'), HOSTS[0].installCommand.replace('<plugin-name>', 'agent-harness'));
  assert.equal(modalCmd(doc, 'add'), HOSTS[0].addCommand);
});

test('R5: the modal copy button copies the substituted command', async () => {
  const written = [];
  const clipboard = { writeText: (t) => { written.push(t); return Promise.resolve(); } };
  const { doc } = await setup({ clipboard });
  await openCard(doc, 'agent-harness');
  dlg(doc).querySelectorAll('.cp')[1].click();
  await flush();
  assert.deepEqual(written, [HOSTS[0].installCommand.replace('<plugin-name>', 'agent-harness')]);
});

test('R5: a third host passed to initCatalog shows up in the modal', async () => {
  const hosts = [...HOSTS, { id: 'mistral', label: 'Mistral', addCommand: 'x add', installCommand: 'x install <plugin-name>' }];
  const { doc } = await setup({ hosts });
  await openCard(doc, 'agent-harness');
  assert.equal(dlg(doc).querySelectorAll('.seg-toggle [data-host]').length, 3);
  $(dlg(doc), '[data-host="mistral"]').click();
  assert.equal(modalCmd(doc, 'add'), 'x add');
  assert.equal(modalCmd(doc, 'install'), 'x install agent-harness');
});

// ---------- R6 markdown ----------

function inject(markup) {
  const d = new JSDOM('<!doctype html><body><div id="c"></div>').window.document;
  const c = d.getElementById('c');
  c.innerHTML = markup;
  return c;
}

test('R6 driving test: renderMarkdown neutralises raw HTML, scripts and javascript: links', () => {
  const s = inject(renderMarkdown('<script>x</script>'));
  assert.equal(s.querySelector('script'), null);
  assert.ok(s.textContent.includes('<script>x</script>'));

  const i = inject(renderMarkdown('<img src=x onerror=y>'));
  assert.equal(i.querySelector('img'), null);
  assert.ok(i.textContent.includes('<img src=x onerror=y>'));

  const a = inject(renderMarkdown('[a](javascript:alert(1))'));
  assert.equal(a.querySelector('a'), null);
  assert.ok(a.textContent.includes('a'));
});

test('renderMarkdown renders headings, lists, emphasis, code and https links', () => {
  const md = '# Title\n\n- one\n- two\n\nSome **bold** and `code` and [site](https://example.com/x).\n\n```\n<b>raw</b>\n```\n';
  const c = inject(renderMarkdown(md));
  assert.equal(text(c, 'h3'), 'Title');
  assert.equal(c.querySelectorAll('ul > li').length, 2);
  assert.equal(text(c, 'strong'), 'bold');
  assert.equal(text(c, 'p code'), 'code');
  assert.equal(text(c, 'pre code'), '<b>raw</b>');
  assert.equal(c.querySelector('pre code b'), null);
  const link = c.querySelector('a[href^="https"][rel="noopener"]');
  assert.ok(link);
  assert.equal(link.getAttribute('href'), 'https://example.com/x');
  assert.equal(link.textContent, 'site');
});

test('R6: description_url is fetched lazily, once, only for plugins that have one', async () => {
  const { doc, calls } = await setup({
    overrides: { [HARNESS.description_url]: () => '# Harness docs\n\nhello **there**' },
  });
  assert.equal(calls.filter((u) => u === HARNESS.description_url).length, 0);
  await openCard(doc, 'agent-harness');
  await flush();
  assert.equal(calls.filter((u) => u === HARNESS.description_url).length, 1);
  assert.equal(text(dlg(doc), '.md h3'), 'Harness docs');

  const before = calls.length;
  $(dlg(doc), '.xbtn').click();
  await openCard(doc, 'agent-vdesktop');
  assert.equal(calls.length, before, 'no fetch for a plugin without description_url');
  assert.equal(dlg(doc).querySelector('.md'), null);
});

test('R6: a slow fetch for a closed modal does not write into the next modal', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const { doc } = await setup({
    overrides: {
      [HARNESS.description_url]: () => slow,
      [COMFY.description_url]: () => 'COMFY TEXT',
    },
  });
  await openCard(doc, 'agent-harness');
  await openCard(doc, 'agent-comfy');
  await flush();
  assert.ok(text(dlg(doc), '.md').includes('COMFY TEXT'));
  release('HARNESS TEXT');
  await flush();
  await flush();
  assert.ok(text(dlg(doc), '.md').includes('COMFY TEXT'));
  assert.ok(!dlg(doc).textContent.includes('HARNESS TEXT'));
});

test('R6: a failed description fetch shows the markdown error text', async () => {
  const { doc } = await setup({
    overrides: { [HARNESS.description_url]: () => { throw new Error('nope'); } },
  });
  await openCard(doc, 'agent-harness');
  await flush();
  assert.equal(text(dlg(doc), '.md'), MESSAGES.en['catalog.md.error']);
});

// ---------- R7 i18n ----------

test('R7: every catalog.* key exists in both dictionaries with different DE text', () => {
  const keys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('catalog.'));
  assert.ok(keys.length >= 7, `expected catalog.* keys, found ${keys.length}`);
  for (const k of keys) {
    assert.ok(MESSAGES.de[k], `de missing ${k}`);
    assert.notEqual(MESSAGES.de[k], MESSAGES.en[k], `de text for ${k} equals en`);
  }
});

test('R7 driving test: UI chrome translates, plugin data does not', async () => {
  const { doc } = await setup({ i18n: true });
  await openCard(doc, 'agent-harness');
  const data = () => [...doc.querySelectorAll('#plist .pcard')].map((c) =>
    [c.dataset.name, text(c, '.pt b'), text(c, '.pd'), text(c, '.pcat'), [...c.querySelectorAll('.pc')].map((t) => t.textContent).join('|')].join('~'));
  const enData = data();
  assert.equal(enData.length, 14);

  $(doc, '[data-lang="de"]').click();

  const viaKey = (sel) => {
    const key = $(doc, sel).dataset.i18n;
    assert.ok(key, `${sel} carries data-i18n`);
    assert.ok(MESSAGES.de[key], `de has ${key}`);
    assert.notEqual(MESSAGES.de[key], MESSAGES.en[key]);
    assert.equal(text(doc, sel), MESSAGES.de[key], `${sel} is German`);
  };
  viaKey('.cbar h2');
  viaKey('#cats [data-i18n="catalog.all"]');
  viaKey('#pmodal .pbox .lbl');
  viaKey('#pmodal a.src2');
  for (const el of doc.querySelectorAll('.cfoot [data-i18n]')) {
    assert.equal(el.textContent.trim(), MESSAGES.de[el.dataset.i18n]);
  }
  assert.ok(doc.querySelectorAll('.cfoot [data-i18n]').length >= 1);
  const phKey = $(doc, '#q').dataset.i18nPlaceholder;
  assert.ok(phKey, '#q carries data-i18n-placeholder');
  assert.equal($(doc, '#q').getAttribute('placeholder'), MESSAGES.de[phKey]);
  assert.notEqual(MESSAGES.de[phKey], MESSAGES.en[phKey]);

  assert.deepEqual(data(), enData);
});
