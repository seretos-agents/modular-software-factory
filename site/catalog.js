import { HOSTS, bindHostPanel } from './hosts.js';
import { MESSAGES, translate } from './i18n.js';

export const CATALOG_URL =
  'https://raw.githubusercontent.com/seretos-agents/modular-software-factory/refs/heads/main/.claude-plugin/marketplace.json';

export async function fetchCatalog(fetchImpl) {
  const res = await fetchImpl(CATALOG_URL);
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const json = await res.json();
  return { marketplace: json.name ?? '', plugins: Array.isArray(json.plugins) ? json.plugins : [] };
}

// ---------- pure logic ----------

export function filterPlugins(plugins, { q = '', cat = 'all', tag = null } = {}) {
  const needle = String(q ?? '').trim().toLowerCase();
  return plugins.filter((p) => {
    const tags = p.tags ?? [];
    if (cat && cat !== 'all' && p.category !== cat) return false;
    if (tag && !tags.includes(tag)) return false;
    if (!needle) return true;
    return [p.name, p.description, ...tags].some((s) => String(s ?? '').toLowerCase().includes(needle));
  });
}

// Live counts: respect search and tag, but not the selected category itself.
export function categoryCounts(plugins, { q = '', tag = null } = {}) {
  const pool = filterPlugins(plugins, { q, tag });
  const cats = [...new Set(pool.map((p) => p.category))].sort();
  return [['all', pool.length], ...cats.map((c) => [c, pool.filter((p) => p.category === c).length])];
}

export function allTags(plugins) {
  return [...new Set(plugins.flatMap((p) => p.tags ?? []))].sort();
}

export function initials(name) {
  return String(name)
    .replace(/^agent-/, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');
}

export function sourceUrl(p) {
  return `https://github.com/${p.source.repo}/tree/${p.source.ref}`;
}

export function parseHashName(hash) {
  const m = /^#plugins\/(.+)$/.exec(hash ?? '');
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- markdown (whitelist subset; input is escaped first) ----------

function inline(s) {
  return s
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${part.slice(1, -1)}</code>`;
      return part
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, label, url) =>
          /^https?:\/\//.test(url) ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : label);
    })
    .join('');
}

export function renderMarkdown(text) {
  const lines = escapeHtml(text).split('\n');
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flushPara();
      flushList();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      out.push(`<h3>${inline(heading[1].trim())}</h3>`);
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(line) || /^\s*\d+\.\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      const kind = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
      if (list !== kind) {
        flushList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return out.join('');
}

// ---------- DOM ----------

export async function initCatalog(doc, win, { fetch = win.fetch?.bind(win), hosts = HOSTS, dict = MESSAGES } = {}) {
  const section = doc.getElementById('catalog');
  if (!section) return;
  const plist = doc.getElementById('plist');
  const dlg = doc.getElementById('pmodal');
  const lang = () => doc.documentElement.lang || 'en';
  const t = (key) => translate(dict, lang(), key);

  // h(tag, {cls, text, i18n, attrs}, children): plugin data only ever goes in via text/attrs.
  const h = (tag, { cls, text, i18n, attrs = {} } = {}, children = []) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (i18n) {
      e.dataset.i18n = i18n;
      e.textContent = t(i18n);
    } else if (text != null) {
      e.textContent = text;
    }
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.append(...children);
    return e;
  };

  const state = { q: '', cat: 'all', tag: null };
  let plugins = [];
  let marketplace = '';

  const icon = (p, className = 'pimg') => {
    const box = h('div', { cls: className, text: initials(p.name) });
    if (typeof p.icon === 'string' && /^https:\/\//.test(p.icon)) {
      const img = h('img', { attrs: { src: p.icon, alt: '', loading: 'lazy' } });
      img.addEventListener('error', () => { box.textContent = initials(p.name); });
      box.replaceChildren(img);
    }
    return box;
  };

  const emptyState = (key) => h('div', { cls: 'empty', i18n: key });

  function renderCard(p) {
    const card = h('button', { cls: 'pcard', attrs: { type: 'button', 'data-name': p.name } }, [
      icon(p),
      h('div', { cls: 'pm' }, [
        h('div', { cls: 'ptop' }, [
          h('div', { cls: 'pt' }, [h('b', { text: p.name })]),
          h('span', { cls: `pcat ${p.category}`, text: p.category }),
        ]),
        h('p', { cls: 'pd', text: p.description ?? '' }),
        h('div', { cls: 'pfoot' }, [
          h('span', { cls: 'pc v', text: `v${p.version}` }),
          ...(p.tags ?? []).map((tg) => h('span', { cls: 'pc', text: tg })),
        ]),
      ]),
    ]);
    card.addEventListener('click', () => openModal(p.name));
    return card;
  }

  function render() {
    const ccount = doc.getElementById('ccount');
    ccount.replaceChildren(`${plugins.length} `, h('span', { i18n: 'catalog.plugins' }));

    const cats = doc.getElementById('cats');
    cats.replaceChildren(
      ...categoryCounts(plugins, state).map(([cat, n]) => {
        const label = cat === 'all' ? h('span', { i18n: 'catalog.all' }) : h('span', { text: cat });
        const b = h('button', { attrs: { type: 'button', 'data-cat': cat, 'aria-pressed': String(state.cat === cat) } }, [
          label,
          h('em', { text: String(n) }),
        ]);
        b.addEventListener('click', () => { state.cat = cat; render(); });
        return b;
      }),
    );

    doc.getElementById('tagrow').replaceChildren(
      ...allTags(plugins).map((tg) => {
        const b = h('button', { text: tg, attrs: { type: 'button', 'data-tag': tg, 'aria-pressed': String(state.tag === tg) } });
        b.addEventListener('click', () => { state.tag = state.tag === tg ? null : tg; render(); });
        return b;
      }),
    );

    const shown = filterPlugins(plugins, state);
    plist.replaceChildren(...(shown.length ? shown.map(renderCard) : [emptyState('catalog.empty')]));
  }

  // ---------- modal ----------

  function buildPanel(p) {
    const cmd = (which, key) => h('div', { cls: 'step' }, [
      h('span', { i18n: key }),
      h('code', { cls: 'cmd' }, [
        h('b', { text: '$' }),
        h('span', { cls: 'c', attrs: { 'data-cmd': which } }),
        h('button', { cls: 'cp', i18n: 'install.copy', attrs: { type: 'button' } }),
      ]),
    ]);
    const box = h('div', { cls: 'pbox' }, [
      h('div', { cls: 'hostsw' }, [
        h('div', { cls: 'lbl', i18n: 'install.label' }),
        h('div', { cls: 'seg-toggle', attrs: { role: 'group', 'aria-label': 'Agent' } }),
      ]),
      cmd('add', 'install.step.add'),
      cmd('install', 'install.step.install'),
      h('p', { cls: 'note', attrs: { hidden: '' } }),
      h('a', { cls: 'src2', i18n: 'catalog.source', attrs: { href: sourceUrl(p), target: '_blank', rel: 'noopener' } }),
    ]);
    const pressed = doc.querySelector('#hostbox [data-host][aria-pressed="true"]');
    bindHostPanel(box, win, hosts, dict, { pluginName: p.name, initialId: pressed?.dataset.host });
    return box;
  }

  function openModal(name) {
    const p = plugins.find((x) => x.name === name);
    if (!p) return;
    if (dlg.hasAttribute('open') && dlg.dataset.name === name) return;
    dlg.dataset.name = name;

    const xbtn = h('button', { cls: 'xbtn', attrs: { type: 'button', 'aria-label': t('catalog.close'), 'data-i18n-aria-label': 'catalog.close' } });
    xbtn.textContent = '✕';
    xbtn.addEventListener('click', () => dlg.close());

    const head = h('div', { cls: 'pmh' }, [
      icon(p),
      h('div', {}, [
        h('h3', { text: p.name }),
        h('div', { cls: 'id', text: `${p.name}@${marketplace}` }),
        h('p', { text: p.description ?? '' }),
        h('div', { cls: 'chips2' }, [
          h('span', { cls: 'chip', text: p.category }),
          h('span', { cls: 'chip', text: `v${p.version}` }),
          ...(p.tags ?? []).map((tg) => h('span', { cls: 'chip', text: tg })),
        ]),
      ]),
      xbtn,
    ]);

    const body = h('div', { cls: 'pmb' }, [h('div', { cls: 'pside' }, [buildPanel(p)])]);
    let md = null;
    if (p.description_url) {
      md = h('div', { cls: 'md', i18n: 'catalog.md.loading' });
      body.prepend(md);
    }
    dlg.replaceChildren(head, body);
    dlg.showModal();
    win.location.hash = `#plugins/${encodeURIComponent(name)}`;

    if (md) loadDescription(p, md);
  }

  async function loadDescription(p, md) {
    const stale = () => !md.isConnected || dlg.dataset.name !== p.name;
    try {
      const res = await fetch(p.description_url);
      if (!res.ok) throw new Error(`description fetch failed: ${res.status}`);
      const body = await res.text();
      if (stale()) return;
      delete md.dataset.i18n;
      md.innerHTML = renderMarkdown(body); // input is escaped by renderMarkdown before any tag is added
    } catch {
      if (stale()) return;
      md.dataset.i18n = 'catalog.md.error';
      md.textContent = t('catalog.md.error');
    }
  }

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dlg.close();
    }
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => {
    if (win.location.hash.startsWith('#plugins/')) win.location.hash = '#plugins';
  });

  const syncFromHash = () => {
    const name = parseHashName(win.location.hash);
    if (name) openModal(name);
    else if (dlg.hasAttribute('open')) dlg.close();
  };

  doc.getElementById('q').addEventListener('input', (e) => {
    state.q = e.target.value;
    render();
  });

  try {
    ({ plugins, marketplace } = await fetchCatalog(fetch));
  } catch {
    plist.replaceChildren(emptyState('catalog.error'));
    return;
  }
  render();
  win.addEventListener('hashchange', syncFromHash);
  syncFromHash();
}
