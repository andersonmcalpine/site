/* Page behaviour: the header, the particle cloud (one fixed canvas on case pages, fields
   inside the home page), the home page's section bar and timeline, reveals and Copy Email. */
(() => {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const root = document.documentElement;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches;

  root.classList.add('js');
  // The opening plays from the second frame; if frames are paused, it is shown anyway.
  const go = () => root.classList.add('go');
  requestAnimationFrame(() => requestAnimationFrame(go));
  setTimeout(go, 1500);

  /* Shapes are named in the page (data-shape): arm, sorter, bolt, gear, ball, servo, dust,
     dashboard (the NBA screen, drawn from the game curve in the page's site data), or text:Word
     for particle lettering ("|" starts a new line). Lettering needs the display font, so until
     it has loaded those blocks show dust. */
  const NAMED = { arm: 0, bolt: 1, gear: 2, ball: 3, sorter: 4, servo: 5, dust: 6 };
  const SITE = (() => { try { return JSON.parse($('#site-data').textContent); } catch (_) { return {}; } })();
  const lettering = new WeakMap(), dashboards = new WeakMap();
  let fontReady = false;
  function shapeOf(cloud, name) {
    if (name in NAMED) return { i: NAMED[name], flat: 0 };
    if (name === 'dashboard') {
      if (!cloud || !Array.isArray(SITE.curve)) return { i: NAMED.ball, flat: 0 };
      if (!dashboards.has(cloud)) dashboards.set(cloud, cloud.addDashboard(SITE.curve));
      return { i: dashboards.get(cloud), flat: 0 };
    }
    if (cloud && fontReady && /^text:./.test(name || '')) {
      const word = name.slice(5);
      if (!lettering.has(cloud)) lettering.set(cloud, new Map());
      const made = lettering.get(cloud);
      if (!made.has(word)) made.set(word, cloud.addText(word.split('|'), 'Poppins'));
      return { i: made.get(word), flat: 1 };
    }
    return { i: NAMED.dust, flat: 0 };
  }

  /* Header: current-section link, and on case pages it slides away while scrolling down */
  const hd = $('.hd');
  const bar = $('.bar');
  const spy = $$('[data-spy]');
  let lastY = scrollY;
  const keepHeader = bar ? Infinity : 160;
  function updateHeader() {
    const y = scrollY, dy = y - lastY;
    lastY = y;
    if (hd && Math.abs(dy) > 3) hd.classList.toggle('away', dy > 0 && y > keepHeader && !root.classList.contains('mn-lock'));
    if (hd && y < keepHeader) hd.classList.remove('away');
    if (!spy.length) return;
    let current = null;
    spy.forEach(a => {
      const sec = document.getElementById(a.dataset.spy);
      if (sec && sec.getBoundingClientRect().top <= innerHeight * 0.4) current = a;
    });
    spy.forEach(a => a === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'));
  }

  /* Fixed cloud (case pages, About, Resume): the [data-cloud] block holding the middle of the
     screen sets the shape and placement. On phones it sits centred above the copy, smaller and dimmer. */
  const canvas = $('canvas.cloud');
  const cloud = canvas && window.Cloud ? window.Cloud.create(canvas) : null;
  const zones = $$('[data-cloud]');
  const adapt = p => innerWidth < 900 ? Object.assign({}, p, { x: 0, y: p.y + 0.22, s: p.s * 0.85, a: p.a * 0.55 }) : p;
  let placed0 = false;
  function updateCloud() {
    if (!cloud || !zones.length) return;
    let z = null;
    for (const el of zones) if (el.getBoundingClientRect().top <= innerHeight * 0.5) z = el;
    const d = (z || zones[0]).dataset, sh = shapeOf(cloud, d.shape);
    // Shapes that reach further sideways than the usual 0.85 (the sorting robot) are drawn smaller.
    const k = sh.flat || sh.i === NAMED.dust ? 1 : Math.min(1, 0.85 / (cloud.reach(sh.i) || 0.85));
    cloud.setShape(sh.i);
    cloud.setPlace(adapt({ x: +d.x || 0, y: +d.y || 0, s: (+d.s || 0.8) * k, a: d.a != null ? +d.a : 1, cam: reduced() ? 4.2 : (+d.cam || 4.2), flat: sh.flat }), !placed0);
    placed0 = true;
  }

  /* Fields (home, About): a cloud inside a block, sized to fit it. Without WebGL the block keeps
     its still image or outline word. 0.894 is the engine's focal length over camera distance. */
  const fields = [];
  // Lettering is 2.8 units wide in the engine; its height follows the word's own proportions.
  function wordHalfHeight(name) {
    const g = document.createElement('canvas').getContext('2d');
    g.font = '600 100px Poppins';
    const m = g.measureText(name.slice(5).split('|')[0]);
    const w = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || m.width || 1;
    return 1.4 * ((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 70) / w;
  }
  function fit(f) {
    const a = f.el.clientWidth / f.el.clientHeight || 1;
    // Lettering keeps a margin: at most 70% of the field's width and 55% of its height. Long
    // shapes (the sorting robot) reach further sideways than the others, so they are fitted by it.
    const [hx, hy, ty, tx] = f.sh.flat ? [1.42, f.hy, 0.55, 0.7] : [Math.max(0.85, f.c.reach(f.sh.i)), 0.8, 0.72, 0.86];
    const u = Math.min(ty / (hy * 0.894), tx * a / (hx * 0.894));
    return { x: 0, y: 0, s: u / Math.min(1, a / 1.25), a: 1, cam: 4.2, flat: f.sh.flat ? 1 : 0 };
  }
  function startField(el) {
    const c = window.Cloud ? window.Cloud.create($('.field-cloud', el)) : null;
    if (!c) return;
    el.classList.add('live');
    const f = { el, c, sh: shapeOf(c, el.dataset.shape) };
    if (f.sh.flat) f.hy = wordHalfHeight(el.dataset.shape);
    c.setShape(f.sh.i);
    c.setPlace(fit(f), true);
    fields.push(f);
    return f;
  }
  // Lettering waits for the font; the other fields start at once (the engine idles while off screen).
  function startFields(lettered) {
    $$('.field[data-shape]').forEach(el => {
      if (/^text:/.test(el.dataset.shape) !== lettered) return;
      const f = startField(el);
      if (f && el.dataset.cycle) startCycle(el, f);
    });
  }

  /* The home page's opening field cycles through the projects: each shape morphs into the next,
     and the caption and its link follow. The timing is the progress line under the current
     number (a CSS animation; its end moves on), so hovering or focusing the field pauses both.
     Choosing a number shows that project and stops the cycle. With reduced motion nothing
     advances on its own. Without WebGL the field keeps the first project's still. */
  function startCycle(el, f) {
    let items;
    try { items = JSON.parse(el.dataset.cycle); } catch (_) { return; }
    const link = $('.field-link', el), cap = $('.field-cap', el);
    const num = $('.field-cap .n', el), name = $('.field-cap .u', el);
    const nums = $$('.cy-n', el);
    if (!items || items.length < 2 || !link || nums.length !== items.length) return;
    let at = 0, swap = 0;
    function show(k) {
      at = (k + items.length) % items.length;
      const it = items[at];
      f.sh = shapeOf(f.c, it.shape);
      if (f.sh.flat) f.hy = wordHalfHeight(it.shape);
      f.c.setShape(f.sh.i);
      f.c.setPlace(fit(f));
      link.href = it.href;
      // The caption fades out, changes and fades back in while the shape morphs.
      cap.classList.add('swap');
      clearTimeout(swap);
      swap = setTimeout(() => {
        num.textContent = it.num;
        name.textContent = it.title;
        cap.classList.remove('swap');
      }, reduced() ? 0 : 200);
      nums.forEach((b, j) => {
        b.classList.toggle('on', j === at);
        b.setAttribute('aria-pressed', j === at ? 'true' : 'false');
      });
    }
    nums.forEach((b, j) => {
      b.addEventListener('click', () => { el.classList.add('held'); show(j); });
      b.addEventListener('animationend', () => { if (!el.classList.contains('held') && !reduced()) show(at + 1); });
    });
    // Only a mouse pauses on hover: iOS reports a finger that scrolls across the field as
    // entering it but never as leaving, which used to stop the cycle for good on phones.
    const pause = on => () => el.classList.toggle('paused', on);
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pause(true)(); });
    el.addEventListener('pointerleave', pause(false));
    el.addEventListener('focusin', pause(true));
    el.addEventListener('focusout', pause(false));
    el.classList.add('cycling');
    show(0);
  }
  const placeFields = () => fields.forEach(f => f.c.setPlace(fit(f)));

  /* Section bar (home page): the underline follows the section that has passed the reading line. */
  const barIn = bar && $('.bar-in', bar);
  const ind = bar && $('.bar-ind', bar);
  const barLinks = bar ? $$('.bar-list a', bar) : [];
  const targets = barLinks.map(a => document.getElementById(a.hash.slice(1)));
  let currentBar = null;
  function barPick() {
    if (scrollY + innerHeight >= root.scrollHeight - 2) return barLinks[barLinks.length - 1];
    let pick = null;
    targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top <= innerHeight * 0.35) pick = barLinks[i]; });
    return pick;
  }
  // Slides the underline to link a; jump places it without the slide.
  function placeInd(a, jump) {
    if (!ind) return;
    ind.classList.toggle('on', !!a);
    if (!a) return;
    if (jump) ind.style.transition = 'none';
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    if (jump) { void ind.offsetWidth; ind.style.transition = ''; }
  }
  function updateBar() {
    if (!bar) return;
    const a = barPick();
    if (a === currentBar) return;
    if (currentBar) currentBar.removeAttribute('aria-current');
    placeInd(a, !currentBar);
    currentBar = a;
    if (!a) return;
    a.setAttribute('aria-current', 'true');
    // On phones the bar scrolls inside itself: keep the current item centred in it.
    if (barIn.scrollWidth > barIn.clientWidth) {
      const r = a.getBoundingClientRect(), b = barIn.getBoundingClientRect();
      barIn.scrollTo({ left: barIn.scrollLeft + r.left - b.left - (b.width - r.width) / 2, behavior: reduced() ? 'auto' : 'smooth' });
    }
  }

  /* Timeline (home page): the rail fills to the reading line and each dot fills once passed. */
  const tl = $('.tl');
  const tlItems = tl ? $$('.tl-item', tl) : [];
  function updateTimeline() {
    if (!tl) return;
    const line = innerHeight * 0.6, r = tl.getBoundingClientRect();
    tl.style.setProperty('--p', clamp((line - r.top) / r.height, 0, 1).toFixed(4));
    tlItems.forEach(el => el.classList.toggle('on', el.getBoundingClientRect().top + 31 <= line));
  }

  /* Parallax: [data-parallax] drifts behind the scroll by that fraction while its section is on
     screen, as her section backgrounds do. Off on phones and with reduced motion. */
  const drifting = $$('[data-parallax]');
  function updateParallax() {
    const on = !reduced() && innerWidth >= 900;
    drifting.forEach(el => {
      const box = (el.closest('section') || el.parentElement).getBoundingClientRect();
      const y = on && box.bottom > 0 && box.top < innerHeight ? -box.top * +el.dataset.parallax : 0;
      el.style.transform = y ? 'translate3d(0,' + y.toFixed(1) + 'px,0)' : '';
    });
  }

  function update() {
    updateHeader();
    updateParallax();
    updateCloud();
    updateBar();
    updateTimeline();
  }
  let ticking = false;
  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }
  if (!cloud && canvas) root.classList.add('no-cloud');
  startFields(false);
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => { placeFields(); placeInd(currentBar, true); update(); }, { passive: true });
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', update);
  update();
  // Particle lettering is drawn in Poppins 600, so ask for it before building any.
  const lettersReady = () => { startFields(true); update(); };
  if (document.fonts && document.fonts.load) {
    document.fonts.load('600 100px Poppins').then(() => { fontReady = document.fonts.check('600 100px Poppins'); lettersReady(); }, lettersReady);
    document.fonts.ready.then(() => placeInd(currentBar, true));
  } else lettersReady();

  /* Reveal each piece once, as it first scrolls into view (the list matches site.css). */
  const pieces = $$('.reveal, .band-hd, .tl-h, .tl-item, .how-list > li, .sk, .reach > *');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -6% 0px' });
    pieces.forEach(el => io.observe(el));
  } else {
    pieces.forEach(el => el.classList.add('in'));
  }

  /* Copy Email */
  $$('[data-copy]').forEach(btn => {
    const label = btn.querySelector('.u') || btn;
    const text0 = label.textContent;
    let timer = 0;
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try { await navigator.clipboard.writeText(text); }
      catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (__) { /* nothing else to try */ }
        ta.remove();
      }
      label.textContent = 'Copied';
      clearTimeout(timer);
      timer = setTimeout(() => { label.textContent = text0; }, 1800);
    });
  });
})();
