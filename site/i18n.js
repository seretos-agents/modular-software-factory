const STORAGE_KEY = 'msf-lang';
const SUPPORTED = ['de', 'en'];

export const MESSAGES = {
  en: {
    'nav.system': 'The System',
    'nav.plugins': 'Plugins',
    'system.title': 'From backlog ticket to merged pull request — unattended.',
    'system.pitch': 'Two core plugins turn your ticket board into a production line. Every other plugin in the factory is a module you can plug into it — or use on its own.',
    'system.cta.plugins': 'All plugins',
    'cta.how': 'How the system works',
    'plugins.title': 'Plug in what your project needs.',
    'plugins.pitch': 'Every plugin works on its own or as a module in the production line. Add the marketplace once, then install only what you need — in Claude Code or Codex.',
    'plugins.cta.catalog': 'Browse the catalog',
    'install.label': 'INSTALL',
    'install.step.add': '01 · add the marketplace',
    'install.step.install': '02 · install a plugin',
    'install.copy': 'copy',
    'install.copied': 'copied',
    'install.note.claude': 'Slash commands — type them inside a Claude Code session.',
    'install.note.codex': 'Shell commands — run them in your terminal.',
    'catalog.title': 'The catalog',
    'catalog.plugins': 'plugins',
    'catalog.all': 'All',
    'catalog.search': 'Search plugins, tags, descriptions…',
    'catalog.empty': 'No plugin matches your search.',
    'catalog.error': 'The catalog could not be loaded. Please try again later.',
    'catalog.md.loading': 'Loading details…',
    'catalog.md.error': 'The details could not be loaded.',
    'catalog.source': 'View source on GitHub',
    'catalog.close': 'Close',
    'catalog.foot.pre': 'Snapshot of',
    'catalog.foot.mid': 'every plugin is pinned to a release tag of its own repo',
    'catalog.foot.issue': 'report an issue',
  },
  de: {
    'nav.system': 'Das System',
    'nav.plugins': 'Plugins',
    'system.title': 'Vom Backlog-Ticket zum gemergten Pull Request — unbeaufsichtigt.',
    'system.pitch': 'Zwei Kern-Plugins machen dein Ticket-Board zur Fertigungsstraße. Jedes weitere Plugin der Factory ist ein Modul, das du einstecken kannst — oder für sich allein nutzt.',
    'system.cta.plugins': 'Alle Plugins',
    'cta.how': 'So funktioniert das System',
    'plugins.title': 'Steck ein, was dein Projekt braucht.',
    'plugins.pitch': 'Jedes Plugin funktioniert für sich oder als Modul in der Fertigungsstraße. Füge den Marketplace einmal hinzu und installiere dann nur, was du brauchst — in Claude Code oder Codex.',
    'plugins.cta.catalog': 'Katalog durchsuchen',
    'install.label': 'INSTALLIEREN',
    'install.step.add': '01 · Marketplace hinzufügen',
    'install.step.install': '02 · Plugin installieren',
    'install.copy': 'kopieren',
    'install.copied': 'kopiert',
    'install.note.claude': 'Slash-Befehle — tippe sie in einer Claude-Code-Sitzung ein.',
    'install.note.codex': 'Shell-Befehle — führe sie in deinem Terminal aus.',
    'catalog.title': 'Der Katalog',
    'catalog.plugins': 'Plugins',
    'catalog.all': 'Alle',
    'catalog.search': 'Plugins, Tags, Beschreibungen durchsuchen…',
    'catalog.empty': 'Kein Plugin passt zu deiner Suche.',
    'catalog.error': 'Der Katalog konnte nicht geladen werden. Bitte versuche es später erneut.',
    'catalog.md.loading': 'Details werden geladen…',
    'catalog.md.error': 'Die Details konnten nicht geladen werden.',
    'catalog.source': 'Quellcode auf GitHub ansehen',
    'catalog.close': 'Schließen',
    'catalog.foot.pre': 'Momentaufnahme von',
    'catalog.foot.mid': 'jedes Plugin ist an ein Release-Tag seines eigenen Repos gepinnt',
    'catalog.foot.issue': 'Problem melden',
  },
};

export function translate(dict, lang, key) {
  return dict[lang]?.[key] ?? dict.en?.[key] ?? key;
}

export function pickLanguage(stored, navLang) {
  if (SUPPORTED.includes(stored)) return stored;
  const prefix = typeof navLang === 'string' ? navLang.toLowerCase().split('-')[0] : '';
  return SUPPORTED.includes(prefix) ? prefix : 'en';
}

export function getStoredLanguage(win) {
  try {
    return win.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredLanguage(win, lang) {
  try {
    win.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable (private mode, blocked): the switch still works for this page view
  }
}

export function applyLanguage(doc, dict, lang) {
  doc.documentElement.lang = lang;
  doc.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = translate(dict, lang, el.dataset.i18n);
  });
  doc.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', translate(dict, lang, el.dataset.i18nPlaceholder));
  });
  doc.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', translate(dict, lang, el.dataset.i18nAriaLabel));
  });
  doc.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  });
}

export function initI18n(doc, win, dict = MESSAGES) {
  applyLanguage(doc, dict, pickLanguage(getStoredLanguage(win), win.navigator?.language));
  doc.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setStoredLanguage(win, btn.dataset.lang);
      applyLanguage(doc, dict, btn.dataset.lang);
    });
  });
}
