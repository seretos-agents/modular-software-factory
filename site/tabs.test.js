import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { activeTabFromHash, applyActiveTab, initTabs } from './tabs.js';

test('activeTabFromHash defaults to system for an empty or unknown hash', () => {
  assert.equal(activeTabFromHash(''), 'system');
  assert.equal(activeTabFromHash('#unknown'), 'system');
});

test('activeTabFromHash recognizes the plugins hash', () => {
  assert.equal(activeTabFromHash('#plugins'), 'plugins');
});

function buildDom(hash) {
  return new JSDOM(
    `<!doctype html><html><body>
      <nav>
        <a data-tab="system" href="#system">The System</a>
        <a data-tab="plugins" href="#plugins">Plugins</a>
      </nav>
      <section data-page="system"></section>
      <section data-page="plugins" hidden></section>
    </body></html>`,
    { url: `https://example.test/${hash}` }
  );
}

test('applyActiveTab marks the plugins tab current and reveals its section', () => {
  const dom = buildDom('#plugins');
  const doc = dom.window.document;
  applyActiveTab(doc, 'plugins');
  assert.equal(doc.querySelector('[data-tab="plugins"]').getAttribute('aria-current'), 'page');
  assert.equal(doc.querySelector('[data-tab="system"]').hasAttribute('aria-current'), false);
  assert.equal(doc.querySelector('[data-page="plugins"]').hidden, false);
  assert.equal(doc.querySelector('[data-page="system"]').hidden, true);
});

test('applyActiveTab falls back to the system tab and hides plugins', () => {
  const dom = buildDom('#system');
  const doc = dom.window.document;
  applyActiveTab(doc, 'system');
  assert.equal(doc.querySelector('[data-tab="system"]').getAttribute('aria-current'), 'page');
  assert.equal(doc.querySelector('[data-page="system"]').hidden, false);
  assert.equal(doc.querySelector('[data-page="plugins"]').hidden, true);
});

test('initTabs syncs state on load and reacts to hashchange', () => {
  const dom = buildDom('#system');
  const { document: doc, window: win } = dom.window;
  initTabs(doc, win);
  assert.equal(doc.querySelector('[data-page="plugins"]').hidden, true);

  win.location.hash = '#plugins';
  win.dispatchEvent(new win.Event('hashchange'));

  assert.equal(doc.querySelector('[data-page="plugins"]').hidden, false);
  assert.equal(doc.querySelector('[data-tab="plugins"]').getAttribute('aria-current'), 'page');
});

test('activeTabFromHash maps #catalog to plugins and #line to system', () => {
  assert.equal(activeTabFromHash('#catalog'), 'plugins');
  assert.equal(activeTabFromHash('#line'), 'system');
});

test('hero CTAs on the real page keep or switch tabs correctly', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/#plugins' });
  const { document: doc, window: win } = dom.window;
  initTabs(doc, win);
  const visible = () => [...doc.querySelectorAll('[data-page]')].filter((s) => !s.hidden).map((s) => s.dataset.page);
  const go = (href) => {
    assert.ok(doc.querySelector(`a.btn[href="${href}"]`), `CTA ${href} exists`);
    win.location.hash = href;
    win.dispatchEvent(new win.Event('hashchange'));
  };
  assert.deepEqual(visible(), ['plugins']);
  go('#catalog');
  assert.deepEqual(visible(), ['plugins']);
  go('#system');
  assert.deepEqual(visible(), ['system']);
  go('#line');
  assert.deepEqual(visible(), ['system']);
});
