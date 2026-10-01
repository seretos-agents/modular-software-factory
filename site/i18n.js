// Compile-level skeleton; behaviour arrives in the implement phase.
export const MESSAGES = { en: {}, de: {} };
export function translate(dict, lang, key) {}
export function pickLanguage(stored, navLang) {}
export function getStoredLanguage(win) {}
export function setStoredLanguage(win, lang) {}
export function applyLanguage(doc, dict, lang) {}
export function initI18n(doc, win, dict = MESSAGES) {}
