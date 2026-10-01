import { MESSAGES, translate } from './i18n.js';

// One entry per agent host. Adding a host is a data change only.
// `note` is an i18n key (see i18n.js), not prose.
export const HOSTS = [
  {
    id: 'claude',
    label: 'Claude Code',
    addCommand: '/plugin marketplace add seretos-agents/modular-software-factory',
    installCommand: '/plugin install <plugin-name>@modular-software-factory',
    note: 'install.note.claude',
  },
  {
    id: 'codex',
    label: 'Codex',
    addCommand: 'codex plugin marketplace add https://github.com/seretos-agents/modular-software-factory.git',
    installCommand: 'codex plugin add <plugin-name>@modular-software-factory',
    note: 'install.note.codex',
  },
];

export function installCommandFor(host, pluginName) {
  return pluginName ? host.installCommand.replaceAll('<plugin-name>', pluginName) : host.installCommand;
}

export function renderHostButtons(root, hosts) {
  const group = root.querySelector('.seg-toggle');
  if (!group) return;
  const doc = root.ownerDocument;
  group.replaceChildren(
    ...hosts.map((h) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.dataset.host = h.id;
      b.setAttribute('aria-pressed', 'false');
      b.textContent = h.label;
      return b;
    }),
  );
}

export function selectHost(root, hosts, id, dict = MESSAGES, pluginName) {
  const host = hosts.find((h) => h.id === id);
  if (!host) return;
  root.querySelectorAll('[data-host]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.host === id));
  });
  root.querySelector('[data-cmd="add"]').textContent = host.addCommand;
  root.querySelector('[data-cmd="install"]').textContent = installCommandFor(host, pluginName);
  const note = root.querySelector('.note');
  if (!note) return;
  if (host.note) {
    note.dataset.i18n = host.note;
    note.textContent = translate(dict, root.ownerDocument.documentElement.lang || 'en', host.note);
    note.hidden = false;
  } else {
    delete note.dataset.i18n;
    note.textContent = '';
    note.hidden = true;
  }
}

export async function copyCommand(win, text) {
  try {
    const clip = win.navigator?.clipboard;
    if (!clip || typeof clip.writeText !== 'function') return false;
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function setCopyLabel(btn, key, dict, doc) {
  btn.dataset.i18n = key;
  btn.textContent = translate(dict, doc.documentElement.lang || 'en', key);
}

// Binds one install panel (the hero's #hostbox or a modal's .pbox) to the host data.
export function bindHostPanel(root, win, hosts = HOSTS, dict = MESSAGES, { pluginName, initialId } = {}) {
  if (!root || hosts.length === 0) return;
  const doc = root.ownerDocument;
  renderHostButtons(root, hosts);
  selectHost(root, hosts, hosts.some((h) => h.id === initialId) ? initialId : hosts[0].id, dict, pluginName);
  root.querySelectorAll('[data-host]').forEach((b) => {
    b.addEventListener('click', () => selectHost(root, hosts, b.dataset.host, dict, pluginName));
  });
  root.querySelectorAll('.cp').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.parentElement.querySelector('.c').textContent;
      if (!(await copyCommand(win, text))) return;
      btn.classList.add('ok');
      setCopyLabel(btn, 'install.copied', dict, doc);
      win.setTimeout(() => {
        btn.classList.remove('ok');
        setCopyLabel(btn, 'install.copy', dict, doc);
      }, 1500);
    });
  });
}

export function initHosts(doc, win, hosts = HOSTS, dict = MESSAGES) {
  bindHostPanel(doc.getElementById('hostbox'), win, hosts, dict);
}
