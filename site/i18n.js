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
