/* Responsive navigation, independent of authentication and data access. */
(() => {
  const $ = id => document.getElementById(id);
  const sidebar = $('sidebar'), toggle = $('menu-toggle'), backdrop = $('menu-backdrop');
  const query = $('module-query'), results = $('module-results');
  const mobile = matchMedia('(max-width: 960px)');
  let enabled = false, opened = false;
  const entries = [...document.querySelectorAll('#tabs button')];
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function draw() {
    const visible = enabled && (!mobile.matches || opened);
    sidebar.hidden = !visible;
    backdrop.hidden = !enabled || !mobile.matches || !opened;
    document.body.classList.toggle('menu-open', enabled && mobile.matches && opened);
    toggle.setAttribute('aria-expanded', String(visible));
    if (mobile.matches) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
    } else {
      sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal');
    }
    for (const el of [document.querySelector('.app-header'), document.querySelector('main'), document.querySelector('footer')]) el.inert = enabled && mobile.matches && opened;
  }
  function close(restore = true) { opened = false; draw(); if (restore && enabled && mobile.matches) toggle.focus(); }
  toggle.onclick = () => { opened = !opened; draw(); if (opened) (sidebar.querySelector('[aria-current="page"]') || $('menu-close')).focus(); };
  $('menu-close').onclick = () => close();
  backdrop.onclick = () => close();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (opened) close(); results.hidden = true; }
    if (event.key !== 'Tab' || !opened || !mobile.matches) return;
    const items = [...sidebar.querySelectorAll('button,a[href]')];
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  mobile.addEventListener?.('change', () => { opened = false; draw(); });
  query.oninput = () => {
    results.replaceChildren();
    const value = normalize(query.value.trim());
    results.hidden = !value;
    if (!value) return;
    const matches = entries.filter(button => normalize(button.textContent).includes(value));
    for (const entry of matches) {
      const button = document.createElement('button');button.type = 'button';
      button.textContent = entry.textContent;
      button.onclick = () => { entry.click(); query.value = ''; results.hidden = true; $('page-title').focus(); };
      results.append(button);
    }
    if (!matches.length) { const p = document.createElement('p'); p.textContent = 'Aucun module trouvé.'; results.append(p); }
  };
  query.onkeydown = event => {
    if (event.key === 'ArrowDown') { results.querySelector('button')?.focus(); event.preventDefault(); }
    if (event.key === 'Enter') { results.querySelector('button')?.click(); event.preventDefault(); }
  };
  document.addEventListener('click', event => { if (!$('module-search').contains(event.target)) results.hidden = true; });
  globalThis.ZEEROO_NAV = {
    sync(section) {
      enabled = section === 'dashboard';
      document.body.classList.toggle('admin-shell', enabled);
      toggle.hidden = !enabled; $('module-search').hidden = !enabled;
      if (!enabled) { query.value = ''; results.hidden = true; }
      opened = false; draw();
    },
    select(tab, title) {
      $('page-title').textContent = title; $('page-title').tabIndex = -1;
      document.title = `${title} · ZeeROO Administration`;
      close(false);
      if (mobile.matches) $('page-title').focus();
    }
  };
})();
