export function activeTabFromHash(hash) {
  return hash === '#plugins' || hash === '#catalog' ? 'plugins' : 'system';
}

export function applyActiveTab(doc, tab) {
  doc.querySelectorAll('[data-tab]').forEach((link) => {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  doc.querySelectorAll('[data-page]').forEach((section) => {
    section.hidden = section.dataset.page !== tab;
  });
}

export function initTabs(doc, win) {
  const sync = () => applyActiveTab(doc, activeTabFromHash(win.location.hash));
  win.addEventListener('hashchange', sync);
  sync();
}
