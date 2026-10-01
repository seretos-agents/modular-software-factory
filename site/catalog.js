// RED skeleton (#34): signatures only, empty values. Implemented in the next phase.
export const CATALOG_URL =
  'https://raw.githubusercontent.com/seretos-agents/modular-software-factory/refs/heads/main/.claude-plugin/marketplace.json';

export async function fetchCatalog() {
  return { marketplace: '', plugins: [] };
}

export function filterPlugins() {
  return [];
}

export function categoryCounts() {
  return [];
}

export function allTags() {
  return [];
}

export function initials() {
  return '';
}

export function sourceUrl() {
  return '';
}

export function parseHashName() {
  return null;
}

export function escapeHtml() {
  return '';
}

export function renderMarkdown() {
  return '';
}

export async function initCatalog() {}
