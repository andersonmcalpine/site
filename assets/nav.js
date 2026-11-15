/* Site navigation: the full-screen menu, the project switcher and arrow keys on case
   studies, and prerendering of same-site pages. It builds its own DOM, so a page only
   needs the header's .menu-btn. */
(() => {
  'use strict';

  const script = document.currentScript || document.querySelector('script[src*="nav.js"]');
  const ROOT = new URL('..', script ? script.src : location.href);
  const root = document.documentElement;

  // Projects, sections and contact details come from the page, written there by build.py.
  const DATA = (() => {
    try { return JSON.parse(document.getElementById('site-data').textContent); } catch (_) { return {}; }
  })();
  const PROJECTS = DATA.projects || [];
  const SECTIONS = DATA.sections || [];
  const EMAIL = DATA.email || '';
  const LINKEDIN = DATA.linkedin || '';
  const RESUME = DATA.resume || 'resume.pdf';
  const EXIT_MS = 180; // just over --mn-exit in nav.css, so the fade ends first

  const pad = n => String(n).padStart(2, '0');
  // Pages compare by path without .html or index, so /, /index.html and /work/arm all match.
  const norm = path => path.replace(/\.html$/, '').replace(/\/index$/, '/');
  const here = norm(location.pathname);
  const isHome = here === norm(ROOT.pathname);
  const projectPath = i => 'work/' + PROJECTS[(i + PROJECTS.length) % PROJECTS.length].id + '.html';
  const projectUrl = i => new URL(projectPath(i), ROOT).href;
  const caseIndex = PROJECTS.findIndex((p, i) => norm(new URL(projectPath(i), ROOT).pathname) === here);
  const fetched = new Set();
  let menuOpen = false;

  // A same-site link. On its own page it becomes a fragment, so it scrolls instead of reloading.
  function href(path, hash) {
    const u = new URL(path, ROOT);
    if (norm(u.pathname) === here) return '#' + (hash || 'top');
    u.hash = hash || '';
    return u.href;
  }

  /* Menu */
  function menuMarkup() {
    let i = 0;
    const item = (cls, key, num, label, url) =>
      `<a class="${cls} mn-rise" href="${url}" data-key="${key}" style="--i:${i++}">` +
      `<span class="mn-num" aria-hidden="true">${num}</span><span class="mn-label">${label}</span></a>`;
    const projects = () => PROJECTS.map((p, n) =>
      `<li>${item('mn-sublink', p.id, pad(n + 1), p.title, href(projectPath(n)))}</li>`).join('');
    const sections = SECTIONS.map((s, n) => {
      // A section is an anchor on the home page unless it names its own page.
      const link = item('mn-link', s.id, pad(n + 1), s.label, s.page ? href(s.page) : href('index.html', s.id === 'top' ? '' : s.id));
      const sub = s.id === 'work' ? `<ol class="mn-sub" role="list">${projects()}</ol>` : '';
      return `<li>${link}${sub}</li>`;
    }).join('');
    const hint = caseIndex < 0 ? '' : '<p class="mn-hint">Press <kbd>←</kbd> or <kbd>→</kbd> to switch projects.</p>';
    return `
      <div class="wrap mn-top"><div class="mn-bar">
        <a class="mn-brand" href="${href('index.html')}" aria-label="Anderson McAlpine, home"><span>Anderson McAlpine</span></a>
        <button class="mn-close" type="button">Close</button>
      </div></div>
      <div class="mn-body"><div class="wrap grid mn-grid">
        <nav class="mn-nav" aria-label="Site"><ol class="mn-list" role="list">${sections}</ol></nav>
        <div class="mn-side mn-rise" style="--i:${i}">
          <p class="mn-note">Open to robotics and embedded internships starting May 2027.</p>
          <div class="actions links">
            <a class="link" href="${new URL(RESUME, ROOT).href}" download><span class="u">Download Resume</span> <span class="ar" aria-hidden="true">↗</span></a>
            <a class="link" href="mailto:${EMAIL}"><span class="u">Email</span> <span class="ar" aria-hidden="true">↗</span></a>
            <a class="link" href="${LINKEDIN}"><span class="u">LinkedIn</span> <span class="ar" aria-hidden="true">↗</span></a>
          </div>
          ${hint}
        </div>
      </div></div>`;
  }

  function buildMenu() {
    const menu = document.createElement('div');
    menu.className = 'mn';
    menu.id = 'menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', 'Site menu');
    menu.dataset.state = 'closed';
    menu.innerHTML = menuMarkup();
    document.body.appendChild(menu);
    return menu;
  }

  // The project on a case page, or the home section holding the upper part of the screen.
  function currentKey() {
    if (caseIndex >= 0) return PROJECTS[caseIndex].id;
    const own = SECTIONS.find(s => s.page && norm(new URL(s.page, ROOT).pathname) === here);
    if (own) return own.id;
    if (!isHome) return '';
    let key = 'top';
    SECTIONS.forEach(s => {
      if (s.page) return;
      const el = document.getElementById(s.id);
      if (el && el.getBoundingClientRect().top <= innerHeight * 0.4) key = s.id;
    });
    return key;
  }

  function initMenu() {
    const btn = document.querySelector('.menu-btn');
    if (!btn) return;
    const menu = buildMenu();
    const closeBtn = menu.querySelector('.mn-close');
    const scroller = menu.querySelector('.mn-body');
    const keyed = Array.from(menu.querySelectorAll('[data-key]'));
    const inerted = [];
    let timer = 0;

    function setInert(on) {
      if (!on) { inerted.splice(0).forEach(el => { el.inert = false; }); return; }
      Array.from(document.body.children).forEach(el => {
        if (el === menu || el.inert || !(el instanceof HTMLElement) || el.tagName === 'SCRIPT') return;
        el.inert = true;
        inerted.push(el);
      });
    }

    function markCurrent() {
      const key = currentKey();
      keyed.forEach(a => {
        if (a.dataset.key === key) a.setAttribute('aria-current', isHome ? 'true' : 'page');
        else a.removeAttribute('aria-current');
      });
    }

    function open() {
      clearTimeout(timer);
      markCurrent();
      setInert(true);
      root.classList.add('mn-lock');
      menu.dataset.state = 'open';
      menuOpen = true;
      btn.setAttribute('aria-expanded', 'true');
      scroller.scrollTop = 0;
      closeBtn.focus();
    }

    function close(returnFocus) {
      if (!menuOpen) return;
      menuOpen = false;
      menu.dataset.state = 'closing';
      btn.setAttribute('aria-expanded', 'false');
      setInert(false);
      root.classList.remove('mn-lock');
      if (returnFocus) btn.focus();
      timer = setTimeout(() => { if (!menuOpen) menu.dataset.state = 'closed'; }, EXIT_MS);
    }

    // Closes without the fade, for a page restored from the back-forward cache.
    function closeNow() {
      menu.style.transition = 'none';
      close(false);
      clearTimeout(timer);
      menu.dataset.state = 'closed';
      void menu.offsetWidth;
      menu.style.transition = '';
      root.classList.remove('mn-swap');
    }

    function trapFocus(e) {
      const items = Array.from(menu.querySelectorAll('a[href], button')).filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (!menu.contains(at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    }

    btn.addEventListener('click', () => (menuOpen ? close(true) : open()));
    closeBtn.addEventListener('click', () => close(true));

    // Same-page links close the menu first; the browser then scrolls to the fragment.
    menu.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      close(false);
      a.blur();
    });

    document.addEventListener('keydown', e => {
      if (!menuOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') trapFocus(e);
      // site.js steps the page with Down and Up; keep those keys from reaching it underneath.
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.stopPropagation();
    });

    // Leaving with the menu open: drop shared-element names so the menu cross-fades to the next page.
    addEventListener('pageswap', e => { if (menuOpen && e.viewTransition) root.classList.add('mn-swap'); });
    addEventListener('pageshow', e => { if (e.persisted) closeNow(); });
    addEventListener('popstate', () => close(false));
  }

  /* Case studies: Left and Right arrows, and the fixed switcher */
  function stepProject(e) {
    if (menuOpen || e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const t = e.target;
    if (!step || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
    e.preventDefault();
    location.href = projectUrl(caseIndex + step);
  }

  function buildSwitcher() {
    const n = PROJECTS.length;
    const prev = PROJECTS[(caseIndex - 1 + n) % n], next = PROJECTS[(caseIndex + 1) % n];
    const chevron = d => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
    const sw = document.createElement('nav');
    sw.className = 'sw';
    sw.setAttribute('aria-label', 'Projects');
    sw.innerHTML =
      `<a class="sw-btn" href="${projectUrl(caseIndex - 1)}" aria-label="Previous Project" title="Previous project: ${prev.title} (←)">${chevron('M14.5 6l-6 6 6 6')}</a>` +
      `<span class="sw-count"><span aria-hidden="true">${pad(caseIndex + 1)} <span class="sw-of">/ ${pad(n)}</span></span>` +
      `<span class="mn-sr">Project ${caseIndex + 1} of ${n}</span></span>` +
      `<a class="sw-btn" href="${projectUrl(caseIndex + 1)}" aria-label="Next Project" title="Next project: ${next.title} (→)">${chevron('M9.5 6l6 6-6 6')}</a>`;
    document.body.appendChild(sw);

    const ft = document.querySelector('.ft');
    if (ft && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => sw.classList.toggle('away', entry.isIntersecting)).observe(ft);
    }
  }

  function initCasePage() {
    if (caseIndex < 0) return;
    document.addEventListener('keydown', stepProject);
    buildSwitcher();
  }

  /* Speed: prerender same-site pages on hover, or prefetch where Speculation Rules are missing */
  function isSitePage(path) {
    const p = norm(path), r = ROOT.pathname;
    return p === r || (p.startsWith(r + 'work/') && /^[\w-]+$/.test(p.slice(r.length + 5)));
  }

  function prefetch(url) {
    const u = new URL(url, location.href);
    u.hash = '';
    if (u.origin !== location.origin || fetched.has(u.href) || !isSitePage(u.pathname) || norm(u.pathname) === here) return;
    fetched.add(u.href);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = u.href;
    document.head.appendChild(link);
  }

  function speculationRules(neighbours) {
    const base = ROOT.pathname.replace(/[\\:*?()+{}]/g, '\\$&');
    const pages = [base, base + 'index.html', base + 'work/*.html'];
    const rules = {
      prerender: [{
        source: 'document',
        where: { and: [
          { or: pages.flatMap(p => [{ href_matches: p }, { href_matches: p + '#*' }]) },
          { not: { selector_matches: 'a[href^="#"]' } }
        ] },
        eagerness: 'moderate'
      }]
    };
    // On a case page, fetch the neighbours now so the arrow keys land fast.
    if (neighbours.length) rules.prefetch = [{ source: 'list', urls: neighbours }];
    return rules;
  }

  function initSpeculation() {
    if (!/^https?:$/.test(location.protocol)) return;
    const neighbours = caseIndex < 0 ? [] : [projectUrl(caseIndex - 1), projectUrl(caseIndex + 1)];
    if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
      const s = document.createElement('script');
      s.type = 'speculationrules';
      s.textContent = JSON.stringify(speculationRules(neighbours));
      document.head.appendChild(s);
      return;
    }
    neighbours.forEach(prefetch);
    const onIntent = e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (a) prefetch(a.href);
    };
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
  }

  initMenu();
  initCasePage();
  initSpeculation();
})();
