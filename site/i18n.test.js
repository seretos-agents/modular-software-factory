import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  MESSAGES, translate, pickLanguage, getStoredLanguage, setStoredLanguage, initI18n,
} from './i18n.js';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function load({ lang = 'en-US', storage } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/' });
  const win = dom.window;
  Object.defineProperty(win.navigator, 'language', { value: lang, configurable: true });
  if (storage) Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  return { doc: win.document, win };
}

function stubStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

const text = (doc, sel) => doc.querySelector(sel).textContent.trim();

test('index.html renders hero left column on both tabs', () => {
  const { doc } = load();
  assert.equal(text(doc, '[data-page="system"] h1'), 'From backlog ticket to merged pull request — unattended.');
  assert.match(text(doc, '[data-page="system"] p'), /^Two core plugins turn your ticket board into a production line\./);
  assert.equal(doc.querySelector('[data-page="system"] a.btn.pri').getAttribute('href'), '#line');
  assert.equal(text(doc, '[data-page="system"] a.btn.pri'), 'How the system works');
  assert.equal(doc.querySelector('[data-page="system"] a.btn:not(.pri)').getAttribute('href'), '#plugins');
  assert.equal(text(doc, '[data-page="system"] a.btn:not(.pri)'), 'All plugins');

  assert.equal(text(doc, '[data-page="plugins"] h1'), 'Plug in what your project needs.');
  assert.match(text(doc, '[data-page="plugins"] p'), /^Every plugin works on its own or as a module/);
  assert.equal(doc.querySelector('[data-page="plugins"] a.btn.pri').getAttribute('href'), '#catalog');
  assert.equal(text(doc, '[data-page="plugins"] a.btn.pri'), 'Browse the catalog');
  assert.equal(doc.querySelector('[data-page="plugins"] a.btn:not(.pri)').getAttribute('href'), '#system');
  assert.ok(!/coming soon/i.test(doc.body.textContent));
});

test('every data-i18n key exists in both languages and EN matches inline text', () => {
  const { doc } = load();
  const els = [...doc.querySelectorAll('[data-i18n]')];
  assert.ok(els.length >= 9);
  for (const el of els) {
    const key = el.dataset.i18n;
    assert.ok(MESSAGES.en[key], `en missing ${key}`);
    assert.ok(MESSAGES.de[key], `de missing ${key}`);
    assert.equal(MESSAGES.en[key], el.textContent.trim());
  }
});

test('clicking DE re-renders tagged strings and html lang; EN reverts', () => {
  const { doc, win } = load({ storage: stubStorage() });
  initI18n(doc, win);
  const enH1 = text(doc, '[data-page="system"] h1');
  doc.querySelector('[data-lang="de"]').click();
  assert.equal(doc.documentElement.lang, 'de');
  assert.equal(text(doc, '[data-page="system"] h1'), MESSAGES.de['system.title']);
  assert.notEqual(MESSAGES.de['system.title'], MESSAGES.en['system.title']);
  assert.equal(text(doc, '[data-tab="system"]'), MESSAGES.de['nav.system']);
  assert.notEqual(text(doc, '[data-page="plugins"] h1'), 'Plug in what your project needs.');
  assert.equal(doc.querySelector('[data-lang="de"]').getAttribute('aria-pressed'), 'true');
  assert.equal(doc.querySelector('[data-lang="en"]').getAttribute('aria-pressed'), 'false');

  doc.querySelector('[data-lang="en"]').click();
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(text(doc, '[data-page="system"] h1'), enH1);
  assert.equal(doc.querySelector('[data-lang="en"]').getAttribute('aria-pressed'), 'true');
});

test('translate falls back to en, then to the key', () => {
  const dict = { en: { a: 'A', b: 'B' }, de: { a: 'AA' } };
  assert.equal(translate(dict, 'de', 'a'), 'AA');
  assert.equal(translate(dict, 'de', 'b'), 'B');
  assert.equal(translate(dict, 'de', 'zzz'), 'zzz');
});

test('pickLanguage prefers stored, then navigator prefix, then en', () => {
  assert.equal(pickLanguage('de', 'en-US'), 'de');
  assert.equal(pickLanguage('en', 'de'), 'en');
  assert.equal(pickLanguage(null, 'de-AT'), 'de');
  assert.equal(pickLanguage(null, 'DE'), 'de');
  assert.equal(pickLanguage(null, 'fr-FR'), 'en');
  assert.equal(pickLanguage('xx', 'en'), 'en');
  assert.equal(pickLanguage(null, undefined), 'en');
});

test('choice persists in localStorage and is restored on the next load', () => {
  const storage = stubStorage();
  const a = load({ storage });
  initI18n(a.doc, a.win);
  a.doc.querySelector('[data-lang="de"]').click();
  assert.equal(storage.data['msf-lang'], 'de');

  const b = load({ storage });
  initI18n(b.doc, b.win);
  assert.equal(b.doc.documentElement.lang, 'de');
  assert.equal(text(b.doc, '[data-page="system"] h1'), MESSAGES.de['system.title']);
});

test('first visit uses navigator.language when supported', () => {
  const { doc, win } = load({ lang: 'de-AT', storage: stubStorage() });
  initI18n(doc, win);
  assert.equal(doc.documentElement.lang, 'de');
  const fr = load({ lang: 'fr-FR', storage: stubStorage() });
  initI18n(fr.doc, fr.win);
  assert.equal(fr.doc.documentElement.lang, 'en');
});

test('throwing localStorage getter does not break reading, writing or switching', () => {
  const bad = { get localStorage() { throw new Error('denied'); } };
  assert.equal(getStoredLanguage(bad), null);
  assert.doesNotThrow(() => setStoredLanguage(bad, 'de'));

  const dom = new JSDOM(html, { url: 'https://example.test/' });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('denied'); }, configurable: true });
  initI18n(w.document, w);
  assert.doesNotThrow(() => w.document.querySelector('[data-lang="de"]').click());
  assert.equal(w.document.documentElement.lang, 'de');
});
