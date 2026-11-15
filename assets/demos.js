/* Interactive demos for the case pages.
   Every .demo[data-demo] is built when it nears the viewport, and its animation runs only
   while it is on screen and the tab is visible. The maths sits in pure functions at the top,
   which the node checks load directly. */
(() => {
  'use strict';

  const TAU = Math.PI * 2, DEG = 180 / Math.PI;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const MINUS = '−';
  const signed = (v, dp) => (v < 0 && v.toFixed(dp) !== (0).toFixed(dp) ? MINUS : '') + Math.abs(v).toFixed(dp);

  // Hash noise: the same sample index always gives the same value, so redraws are stable.
  function rnd(n) {
    let x = Math.imul(n | 0, 0x9E3779B1);
    x ^= x >>> 16; x = Math.imul(x, 0x85EBCA6B);
    x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35);
    x ^= x >>> 16;
    return ((x >>> 0) + 0.5) / 4294967296;
  }

  /* ---------- Arm: compound planetary gearbox ---------- */

  // Measured from the third-revision gearbox model (Fusion, Gear_Kernel). Input layer: a 30-tooth sun,
  // five planets' 25-tooth lower halves and an 80-tooth ring that is held (module 1.1 mm). Output
  // layer: the planets' 25-tooth upper halves, a 75-tooth output ring and a free 25-tooth sun
  // (module 1.21 mm). Planet centres sit 30.25 mm from the axis; rings are 97.9 and 100.7 mm across.
  const GBX = { S1: 30, P1: 25, R1: 80, S2: 25, P2: 25, R2: 75, m1: 1.1, m2: 1.21, a: 30.25, n: 5, bore: 6, out1: 48.96, out2: 50.33 };

  // Angle of every part (radians) when the input sun has turned s, with the first ring held:
  // carrier c, planets p (absolute), output ring r2 and the free second sun s2.
  function gbxState(s) {
    const { S1, P1, R1, S2, P2, R2 } = GBX;
    const c = s * S1 / (S1 + R1);
    return { s, c, p: c * (1 - R1 / P1), r2: c * (1 - (P2 * R1) / (R2 * P1)), s2: c * (1 + (P2 / S2) * (R1 / P1)) };
  }
  // Input turns per output turn: negative because the output turns the other way.
  const gbxRatio = () => 1 / gbxState(1).r2;

  /* ---------- Fasteners: box area against part area ---------- */

  function polyArea(p) {
    let a = 0;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
    return Math.abs(a) / 2;
  }
  function rotate(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return p.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  }
  function bounds(p) {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [x, y] of p) { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); }
    return b;
  }
  const hexagon = R => Array.from({ length: 6 }, (_, i) => [R * Math.cos(i * Math.PI / 3), R * Math.sin(i * Math.PI / 3)]);

  // Outlines in millimetres, centred on each part's own box: an M10 x 60 hex bolt and a 4 x 40
  // countersunk screw from the side, and an M10 nut from above. Detail lines don't count as area.
  const PARTS = [
    {
      name: 'Bolt',
      outline: [[-33.5, 8.5], [-26.5, 8.5], [-26.5, 5], [32.5, 5], [33.5, 4], [33.5, -4], [32.5, -5], [-26.5, -5], [-26.5, -8.5], [-33.5, -8.5]],
      holes: [],
      lines: [[[-33.5, 4.25], [-26.5, 4.25]], [[-33.5, -4.25], [-26.5, -4.25]], [[4, 4.2], [33.2, 4.2]], [[4, -4.2], [33.2, -4.2]], [[4, 5], [4, -5]]],
      rings: []
    },
    {
      name: 'Screw',
      outline: [[-20, 4], [-19.4, 4], [-16.5, 2], [8, 2], [20, 0], [8, -2], [-16.5, -2], [-19.4, -4], [-20, -4]],
      holes: [],
      lines: Array.from({ length: 14 }, (_, i) => { const x = -12 + i * 1.8, y = x > 8 ? 2 * (20 - x - 0.9) / 12 : 2; return [[x, y], [x + 0.9, -y]]; }),
      rings: []
    },
    {
      name: 'Nut',
      outline: hexagon(17 / Math.sqrt(3)),
      holes: [5],
      lines: [],
      rings: [8.5]
    }
  ];
  PARTS.forEach(p => { p.area = polyArea(p.outline) - p.holes.reduce((a, r) => a + Math.PI * r * r, 0); });

  // Share of the box not covered by the part. The oriented box is the part's own box, so it
  // turns with the part; the upright box is the screen-aligned box around the turned outline.
  function emptyShare(part, angle, oriented) {
    const b = bounds(oriented ? part.outline : rotate(part.outline, angle));
    return 1 - part.area / ((b.x1 - b.x0) * (b.y1 - b.y0));
  }

  /* ---------- Gear vibration: held-out test windows ---------- */

  // Windows of one condition in time order, and how many of them the model got right.
  const gearPick = (wins, c) => wins.filter(w => w.c === c);
  const gearRight = list => list.filter(w => w.p === w.c).length;

  /* ---------- Win probability: clock and lookup ---------- */

  function gameClock(s) {
    let q, end;
    if (s <= 2880) { q = Math.max(1, Math.ceil(s / 720)); end = q * 720; }
    else { const k = Math.ceil((s - 2880) / 300); q = 4 + k; end = 2880 + k * 300; }
    const left = Math.max(0, end - s);
    return { period: q <= 4 ? 'Q' + q : (q === 5 ? 'OT' : (q - 4) + 'OT'), clock: Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0') };
  }

  // The model's number after the latest play at or before s.
  function probAt(pts, s) {
    let lo = 0, hi = pts.length - 1;
    if (s < pts[0][0]) return pts[0][1];
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m][0] <= s) lo = m; else hi = m - 1; }
    return pts[lo][1];
  }

  // Stand-in when no saved game loads: a logit random walk that grows more volatile late on.
  function illustrativeGame() {
    const pts = [[0, 0.55]];
    let s = 0, z = 0.2, n = 0;
    while (s < 2880) {
      s = Math.min(2880, Math.round(s + 6 + 22 * rnd(3 * n + 1)));
      z += (rnd(3 * n + 2) - 0.5) * 0.42 * (1 + 1.6 * s / 2880);
      pts.push([s, 1 / (1 + Math.exp(-z))]);
      n++;
    }
    return { home: 'Home', away: 'Away', final: null, points: pts, real: false, note: 'Illustrative curve. Not output from the project’s model.' };
  }

  /* ---------- Servo driver: ideal 555 astable ---------- */

  // Parts from the MSE 2201 report (Figure 2 and its parts list): R1 2.2 kΩ, a 10 kΩ potentiometer,
  // R2 100 kΩ, C 220 nF. The wiper is on DISCH and a 1N4148 steers the paths: the capacitor charges
  // through R1 and the pot's upper part, and discharges through the lower part and R2.
  // Measured ends (the report's PWM Output table): 0.40 ms at 56.6 Hz and 2.50 ms at 55.7 Hz,
  // with the horn at about 30 and 150 degrees.
  const PWM = { R1: 2200, POT: 10000, R2: 100000, C: 220e-9, ENDS: [0.40, 2.50], ANG: [30, 150] };

  // Ideal model, leaving out the diode drop and pin currents: each half lasts ln 2 times its RC.
  // x is the wiper position from 0 (all of the pot in the discharge path) to 1. Times in ms.
  function pwmModel(x) {
    const k = Math.LN2 * PWM.C * 1000, a = clamp(x, 0, 1) * PWM.POT;
    const high = k * (PWM.R1 + a), low = k * (PWM.R2 + PWM.POT - a), period = high + low;
    return { high, low, period, freq: 1000 / period, duty: high / period };
  }

  // Horn angle from the report's servo test: about 30, 90 and 150 degrees at the minimum, middle
  // and maximum of the potentiometer, so linear in the wiper position x.
  function hornAngle(x) {
    const [a0, a1] = PWM.ANG;
    return a0 + clamp(x, 0, 1) * (a1 - a0);
  }

  /* ---------- Sorter: colour decision ---------- */

  // From the MSE 2202 final report's firmware (pages 22 and 23): R, G and B are divided by the clear
  // channel, and the result is compared with two calibrated profiles by straight-line distance.
  // YELLOW is the Milestone 4 calibration of a yellow eraser, which the final firmware does not keep.
  const SORT = { BELT: [0.277, 0.340, 0.340], TARGET: [0.224, 0.457, 0.267], YELLOW: [0.331, 0.392, 0.234], PRESENCE: 0.07, MATCH: 0.07, LOCKOUT_MS: 800 };

  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // Illustration, not firmware: the reading moves in a straight line from the belt's profile to the
  // eraser's as the eraser covers the share t of the sensor's view.
  const sortBlend = (p, t) => SORT.BELT.map((b, i) => b + clamp(t, 0, 1) * (p[i] - b));

  // The firmware's case logic for one normalised reading.
  function sortDecide(rgb) {
    const fromBelt = dist3(rgb, SORT.BELT), fromTarget = dist3(rgb, SORT.TARGET);
    const present = fromBelt > SORT.PRESENCE, match = fromTarget < SORT.MATCH;
    return { fromBelt, fromTarget, present, match, kind: !present ? 'empty' : match ? 'target' : 'other' };
  }

  // Flipper after one reading (true = down, the eraser is kept): a target lowers it, any other
  // object raises it, and an empty belt leaves it where it was. The 800 ms lockout is left out.
  const sortFlip = (down, kind) => kind === 'target' ? true : kind === 'other' ? false : down;

  const MATH = { GBX, gbxState, gbxRatio, PARTS, polyArea, rotate, bounds, emptyShare, gearPick, gearRight, gameClock, probAt, illustrativeGame, PWM, pwmModel, hornAngle, SORT, dist3, sortBlend, sortDecide, sortFlip };
  if (typeof module === 'object' && module.exports) module.exports = MATH;
  if (typeof document === 'undefined') return;

  /* ---------- Page plumbing ---------- */

  const root = document.documentElement;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mq.matches;
  let uid = 0, C = null;

  // Canvas colours and fonts, read once from the page's tokens. Colours go through a probe element
  // so mixes such as color-mix() arrive as plain rgb() the canvas understands.
  function colors() {
    if (C) return C;
    const host = document.querySelector('.demo') || root;
    const cs = getComputedStyle(host), v = n => cs.getPropertyValue(n).trim();
    const probe = document.createElement('span');
    host.appendChild(probe);
    const rgb = n => {
      probe.style.color = v(n);
      const c = getComputedStyle(probe).color, m = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/);
      return m ? `rgba(${[1, 2, 3].map(i => Math.round(+m[i] * 255)).join(',')},${m[4] || 1})` : c;
    };
    // stage: the drawing panel (knock-out fills match it); gold: the one highlighted mark.
    C = { night: rgb('--stage'), surface: rgb('--surface'), ink: rgb('--ink'), ink2: rgb('--ink-2'), line: rgb('--line'), rule: rgb('--rule'), gold: rgb('--hl'), num: v('--font'), text: v('--font') };
    probe.remove();
    return C;
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { if (k === 'class') el.className = attrs[k]; else el.setAttribute(k, attrs[k]); }
    el.append(...kids);
    return el;
  }

  function shell(el, note) {
    const bar = h('div', { class: 'demo-bar' });
    const stage = h('div', { class: 'demo-stage' });
    const read = h('p', { class: 'demo-read', 'aria-live': 'polite' });
    const noteEl = h('p', { class: 'demo-note note' }, ...(note ? [note] : []));
    el.append(bar, stage, read, noteEl);
    return { bar, stage, read, note: noteEl };
  }

  // One readout item: a small label and a figure.
  function stat(read, label) {
    const k = h('span', { class: 'k' }, ...(label ? [label] : [])), b = h('b');
    read.append(h('span', { class: 'demo-stat' }, k, b));
    return { k, b };
  }

  // Segmented control: buttons with aria-pressed; arrow keys move along the group.
  function seg(label, opts, value, onChange) {
    const el = h('div', { class: 'demo-seg', role: 'group', 'aria-label': label });
    const set = v => { value = v; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === v))); };
    const btns = opts.map(([v, text]) => {
      const b = h('button', { type: 'button' }, text);
      b.addEventListener('click', () => { if (v !== value) { set(v); onChange(v); } });
      el.append(b);
      return b;
    });
    el.addEventListener('keydown', e => {
      const i = btns.indexOf(document.activeElement);
      if (i < 0 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const j = (i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
      btns[j].focus();
      btns[j].click();
    });
    set(value);
    return el;
  }

  function range(label, attrs, fmt, onInput, cls) {
    const id = 'demo-r' + (++uid);
    const input = h('input', Object.assign({ type: 'range', id, class: 'demo-range' }, attrs));
    const out = fmt ? h('output', { for: id }) : null;
    const el = h('div', { class: 'demo-field' + (cls ? ' ' + cls : '') }, h('label', { for: id }, label), input);
    if (out) el.append(out);
    const show = () => { if (out) out.textContent = fmt(+input.value); };
    input.addEventListener('input', () => { show(); onInput(+input.value); });
    show();
    return { el, input, show };
  }

  function playButton(onClick) {
    const u = h('span', { class: 'u' }, 'Play');
    const el = h('button', { type: 'button', class: 'link demo-play' }, u);
    el.addEventListener('click', onClick);
    return { el, set: playing => { u.textContent = playing ? 'Pause' : 'Play'; } };
  }

  // Calls fn at most every `ms`, always delivering the last call.
  function throttle(fn, ms) {
    let t = 0, timer = 0, args = [];
    return (...a) => {
      args = a;
      const wait = t + ms - performance.now();
      if (wait <= 0) { clearTimeout(timer); timer = 0; t = performance.now(); fn(...args); }
      else if (!timer) timer = setTimeout(() => { timer = 0; t = performance.now(); fn(...args); }, wait);
    };
  }

  // rAF loop that runs only while wanted and visible. frame(dt) returns false to stop.
  function ticker(frame) {
    let raf = 0, last = 0, want = false, vis = false;
    const tick = now => {
      raf = -1; // inside a frame: start() and stop() only change `want`
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      if (frame(dt) === false) want = false;
      raf = 0;
      if (want && vis) raf = requestAnimationFrame(tick); else last = 0;
    };
    const sync = () => {
      if (want && vis && !raf) raf = requestAnimationFrame(tick);
      else if (!(want && vis) && raf > 0) { cancelAnimationFrame(raf); raf = 0; last = 0; }
    };
    return {
      start() { want = true; sync(); },
      stop() { want = false; sync(); },
      visible(v) { vis = v; sync(); }
    };
  }

  // A canvas filling the stage, sized for devicePixelRatio (capped at 2) and kept sized on resize.
  function canvas(stage, attrs, draw) {
    const cv = h('canvas', attrs);
    stage.append(cv);
    const s = { cv, g: cv.getContext('2d'), w: 0, h: 0, d: 1 };
    s.fit = () => {
      const w = stage.clientWidth, hh = stage.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
      if (!w || !hh || (w === s.w && hh === s.h && d === s.d)) return;
      s.w = w; s.h = hh; s.d = d;
      cv.width = Math.round(w * d); cv.height = Math.round(hh * d);
      draw();
    };
    s.begin = () => {
      s.g.setTransform(s.d, 0, 0, s.d, 0, 0);
      s.g.clearRect(0, 0, s.w, s.h);
      return s.g;
    };
    // The first fit runs after the caller has stored the returned object.
    if ('ResizeObserver' in window) new ResizeObserver(s.fit).observe(stage);
    else { addEventListener('resize', s.fit); setTimeout(s.fit); }
    return s;
  }

  function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
  const font = (px, fam, w) => (w || 400) + ' ' + px + 'px ' + fam;

  /* ---------- Demo 1: the arm's gearbox ---------- */

  // One gear outline: n trapezoid teeth on pitch radius m n / 2, turned by ang; internal teeth point in.
  function gearPath(g, cx, cy, n, m, ang, k, internal) {
    const r = m * n / 2, p = TAU / n;
    const tip = (internal ? r - m : r + m) * k, root = (internal ? r + 1.25 * m : r - 1.25 * m) * k;
    const at = (a, rr) => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    for (let i = 0; i < n; i++) {
      const a = ang + i * p;
      [[a - 0.27 * p, root], [a - 0.12 * p, tip], [a + 0.12 * p, tip], [a + 0.27 * p, root]].forEach(([b, rr], j) => {
        const [x, y] = at(b, rr);
        if (i === 0 && j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
    }
    g.closePath();
  }

  function gearbox(el) {
    const ui = shell(el, 'Tooth counts and sizes measured from the third-revision gearbox model; tooth shapes are simplified. The first ring is held and the second ring is the output.');
    const MAX = Math.abs(gbxRatio()), SPEED = 1.5;
    ui.stage.classList.add('tall');
    let turns = 0, acc = 0, playing = !reduced();
    const play = playButton(() => setPlaying(!playing));
    const scrub = range('Motor Turns', { min: '0', max: String(MAX), step: '0.05', value: '0' }, null, v => { setPlaying(false); turns = v; sync(); }, 'demo-grow');
    ui.bar.append(play.el, scrub.el);
    const motor = stat(ui.read, 'Motor').b, out = stat(ui.read, 'Output').b, ratio = stat(ui.read, 'Ratio').b;
    ratio.textContent = MAX.toFixed(0) + ':1, reversed';
    const report = throttle(() => {
      motor.textContent = turns.toFixed(1) + ' turns';
      out.textContent = signed(gbxState(turns * TAU).r2 * DEG, 1) + '°';
    }, 150);
    function sync() {
      scrub.input.value = String(turns);
      scrub.input.setAttribute('aria-valuetext', turns.toFixed(1) + ' motor turns; output ring at ' + signed(gbxState(turns * TAU).r2 * DEG, 1) + ' degrees');
      draw(); report();
    }

    // Smooth turning at 1.5 motor turns a second; with reduced motion, one turn per step.
    const tick = ticker(dt => {
      if (!playing) return false;
      if (reduced()) { acc += dt; if (acc < 0.6) return true; acc = 0; turns += 1; }
      else turns += dt * SPEED;
      if (turns > MAX) turns -= MAX;
      sync();
      return true;
    });
    function setPlaying(v) {
      playing = v;
      play.set(v);
      ui.read.setAttribute('aria-live', v ? 'off' : 'polite');
      if (v) tick.start(); else tick.stop();
    }

    const S = canvas(ui.stage, { role: 'img', 'aria-label': 'Top views of the two gear layers: the input layer with a 30-tooth sun, five 25-tooth planets and a held 80-tooth ring, and the output layer with a free 25-tooth sun, the same planets and the 75-tooth output ring.' }, draw);

    function layer(g, c, cx, cy, k, st, out) {
      const { n, a, bore } = GBX, m = out ? GBX.m2 : GBX.m1;
      const S = out ? GBX.S2 : GBX.S1, P = out ? GBX.P2 : GBX.P1, R = out ? GBX.R2 : GBX.R1;
      const ring = out ? st.r2 : 0, sun = out ? st.s2 : st.s;
      // Ring: the band between its outer edge and its teeth; the output ring is drawn in the highlight.
      g.beginPath();
      g.arc(cx, cy, (out ? GBX.out2 : GBX.out1) * k, 0, TAU);
      gearPath(g, cx, cy, R, m, ring + Math.PI / R, k, true);
      g.fillStyle = c.surface; g.fill('evenodd');
      g.strokeStyle = out ? c.gold : c.ink2; g.lineWidth = out ? 1.5 : 1; g.stroke();
      for (let j = 0; j < n; j++) {
        const th = j * TAU / n, px = cx + Math.cos(th + st.c) * a * k, py = cy + Math.sin(th + st.c) * a * k;
        g.beginPath(); gearPath(g, px, py, P, m, th + st.p, k, false);
        g.fillStyle = c.night; g.fill();
        g.strokeStyle = c.ink2; g.lineWidth = 1; g.stroke();
        circle(g, px, py, bore * k); g.stroke();
      }
      g.beginPath(); gearPath(g, cx, cy, S, m, sun, k, false);
      g.fillStyle = c.night; g.fill(); g.strokeStyle = out ? c.ink2 : c.ink; g.lineWidth = out ? 1 : 1.5; g.stroke();
      // Markers: a line across the input sun, and a tab on the output ring's rim.
      if (!out) {
        g.strokeStyle = c.ink; g.lineWidth = 2;
        line(g, cx - Math.cos(sun) * 9 * k, cy - Math.sin(sun) * 9 * k, cx + Math.cos(sun) * 9 * k, cy + Math.sin(sun) * 9 * k);
      } else {
        const ro = GBX.out2 * k, ang = ring - Math.PI / 2;
        g.fillStyle = c.gold; g.beginPath();
        g.moveTo(cx + Math.cos(ang) * (ro + 12), cy + Math.sin(ang) * (ro + 12));
        g.lineTo(cx + Math.cos(ang - 0.06) * (ro + 2), cy + Math.sin(ang - 0.06) * (ro + 2));
        g.lineTo(cx + Math.cos(ang + 0.06) * (ro + 2), cy + Math.sin(ang + 0.06) * (ro + 2));
        g.closePath(); g.fill();
      }
    }

    function draw() {
      if (!S.w) return;
      const c = colors(), g = S.begin(), side = S.w >= 560;
      const pw = side ? S.w / 2 : S.w, ph = side ? S.h : S.h / 2;
      const k = (Math.min(pw, ph - 58) / 2 - 16) / GBX.out2;
      const st = gbxState(turns * TAU);
      [[false, 'Input layer', 'Sun 30, planets 25, ring 80 held'], [true, 'Output layer', 'Sun 25 free, planets 25, ring 75 output']].forEach(([outL, title, sub], i) => {
        const ox = side ? i * pw : 0, oy = side ? 0 : i * ph;
        g.fillStyle = c.ink; g.font = font(13, c.text, 500); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText(title, ox + pw / 2, oy + 24);
        g.fillStyle = c.ink2; g.font = font(12, c.text);
        g.fillText(sub, ox + pw / 2, oy + 42);
        layer(g, c, ox + pw / 2, oy + 54 + (ph - 54) / 2, k, st, outL);
      });
    }

    play.set(playing);
    if (playing) { ui.read.setAttribute('aria-live', 'off'); tick.start(); }
    report();
    return { visible: tick.visible, redraw: draw };
  }

  /* ---------- Demo 2: upright against oriented boxes ---------- */

  function obb(el) {
    const ui = shell(el, 'Empty space is the box area minus the part’s own outline area, measured from the drawn geometry. Schematic parts, not detector output.');
    const FIXED = [null, -28 / DEG, 18 / DEG];
    let oriented = false, angle = 30, mix = 0;

    ui.bar.append(seg('Box style', [['up', 'Upright Boxes'], ['ob', 'Oriented Boxes']], 'up', v => { oriented = v === 'ob'; tick.start(); report(); }));
    const slider = range('Bolt Angle', { min: '0', max: '180', step: '1', value: String(angle) }, v => v + '°', v => { angle = v; draw(); report(); });
    ui.bar.append(slider.el);
    const bolt = stat(ui.read, 'Empty space inside the bolt’s box').b;
    const screw = stat(ui.read, 'Screw').b, nut = stat(ui.read, 'Nut').b;
    const angles = () => [angle / DEG, FIXED[1], FIXED[2]];
    const pct = v => (v * 100).toFixed(1) + '%';
    const report = throttle(() => {
      const a = angles(), e = PARTS.map((p, i) => emptyShare(p, a[i], oriented));
      bolt.textContent = pct(e[0]); screw.textContent = pct(e[1]); nut.textContent = pct(e[2]);
    }, 150);

    const tick = ticker(dt => {
      const t = oriented ? 1 : 0;
      mix = reduced() ? t : clamp(mix + Math.sign(t - mix) * dt / 0.24, 0, 1);
      draw();
      return mix !== t;
    });

    const S = canvas(ui.stage, { role: 'img', 'aria-label': 'A bolt, a screw and a nut, each with its bounding box drawn as a dashed outline.' }, draw);

    // Each part's slot: a circle for the turning bolt, the turned box for the fixed parts.
    function layout() {
      const a = angles();
      const half = Math.hypot(33.5, 8.5);
      const size = PARTS.map((p, i) => {
        if (i === 0) return [2 * half, 2 * half];
        const b = bounds(rotate(p.outline, a[i]));
        return [b.x1 - b.x0, b.y1 - b.y0];
      });
      const G = 14, M = 8, LB = 26;
      const rowW = size[0][0] + size[1][0] + size[2][0] + 2 * G + 2 * M, rowH = size[0][1] + 2 * M;
      const kRow = Math.min(S.w / rowW, (S.h - LB) / rowH);
      const lowH = Math.max(size[1][1], size[2][1]);
      const stW = Math.max(size[0][0], size[1][0] + G + size[2][0]) + 2 * M, stH = size[0][1] + lowH + G + 2 * M;
      const kSt = Math.min(S.w / stW, (S.h - 2 * LB) / stH);
      if (kRow >= kSt) {
        const k = kRow, cy = (S.h - LB) / 2;
        let x = (S.w - (rowW - 2 * M) * k) / 2;
        return { k, slots: size.map(s => { const cx = x + s[0] * k / 2; x += (s[0] + G) * k; return [cx, cy, cy + size[0][1] * k / 2 + 18]; }) };
      }
      const k = kSt, top = (S.h - 2 * LB - (stH - 2 * M) * k) / 2;
      const cy0 = top + size[0][1] * k / 2, cy1 = top + (size[0][1] + G + lowH / 2) * k + LB;
      const lowW = (size[1][0] + G + size[2][0]) * k, x1 = (S.w - lowW) / 2 + size[1][0] * k / 2;
      return { k, slots: [[S.w / 2, cy0, cy0 + size[0][1] * k / 2 + 18], [x1, cy1, cy1 + lowH * k / 2 + 18], [x1 + (size[1][0] / 2 + G + size[2][0] / 2) * k, cy1, cy1 + lowH * k / 2 + 18]] };
    }

    function draw() {
      if (!S.w) return;
      const c = colors(), g = S.begin(), L = layout(), a = angles(), k = L.k;
      g.lineJoin = 'round';
      PARTS.forEach((p, i) => {
        const [cx, cy, ly] = L.slots[i];
        const map = pts => rotate(pts, a[i]).map(([x, y]) => [cx + x * k, cy - y * k]);
        const path = pts => { g.moveTo(...pts[0]); for (let j = 1; j < pts.length; j++) g.lineTo(...pts[j]); g.closePath(); };

        g.beginPath(); path(map(p.outline));
        p.holes.forEach(r => { g.moveTo(cx + r * k, cy); g.arc(cx, cy, r * k, 0, TAU, true); });
        g.fillStyle = c.surface; g.fill('evenodd');
        g.strokeStyle = c.ink; g.lineWidth = 1.25; g.stroke();

        g.strokeStyle = c.line; g.lineWidth = 1;
        p.lines.forEach(ln => { const [s0, s1] = map(ln); line(g, s0[0], s0[1], s1[0], s1[1]); });
        p.rings.forEach(r => { circle(g, cx, cy, r * k); g.stroke(); });

        const ub = bounds(map(p.outline)), lb = bounds(p.outline);
        const ob = map([[lb.x0, lb.y0], [lb.x1, lb.y0], [lb.x1, lb.y1], [lb.x0, lb.y1]]);
        g.lineWidth = 1;
        if (mix < 1) { g.globalAlpha = 1 - mix; g.strokeStyle = c.ink2; g.setLineDash([4, 4]); g.strokeRect(ub.x0, ub.y0, ub.x1 - ub.x0, ub.y1 - ub.y0); }
        if (mix > 0) { g.globalAlpha = mix; g.strokeStyle = c.gold; g.setLineDash([6, 4]); g.beginPath(); path(ob); g.stroke(); }
        g.setLineDash([]); g.globalAlpha = 1;

        g.fillStyle = c.ink2; g.font = font(13, c.text); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText(p.name, cx, Math.min(ly, S.h - 10));
      });
    }

    report();
    return { visible: tick.visible, redraw: draw };
  }

  /* ---------- Demo 3: gear vibration, real test windows ---------- */

  // The 132 held-out test windows (22 per condition) from tools/charts.py --gear: sensor 1 as a
  // min/max envelope in µm about the window mean, the reproduced KNN's call and its neighbour votes.
  function vibration(el) {
    const NAMES = ['No Fault', 'Eccentricity', 'Missing Tooth', 'Root Crack', 'Surface Defect', 'Chipped Tooth'];
    const ui = shell(el, 'Real data: 1024-sample windows (205 ms at 5 kHz) from the Kaggle Mechanical Gear Vibration Dataset, none of them used in training. Calls are from the course KNN model, rerun from its notebook.');
    let data = null, lim = 1, cls = 0, sel = 0, acc = 0, playing = false, msg = 'Loading the test windows…';
    const pick = seg('Gear condition', NAMES.map((n, i) => [String(i), n]), '0', v => { cls = +v; sel = 0; update(); });
    pick.classList.add('many');
    const play = playButton(() => setPlaying(!playing));
    ui.bar.append(pick, play.el);
    const said = stat(ui.read, 'Model Says').b, votes = stat(ui.read, 'Neighbours Agreeing').b;
    const sd = stat(ui.read, 'Spread (SD)').b, lv = stat(ui.read, 'Mean Level').b;
    const miss = h('span', { class: 'demo-flag' }, 'Misread');
    ui.read.append(miss);

    const list = () => (data ? gearPick(data.windows, cls) : []);
    // One scale per condition, so its windows compare with each other; the label gives it.
    function update() {
      const L = list(), w = L[sel];
      if (L.length) lim = Math.ceil(Math.max(...L.map(x => Math.max(...x.e.map(Math.abs)))) / 10) * 10;
      if (w) {
        said.textContent = NAMES[w.p];
        votes.textContent = w.v + ' of ' + data.k;
        sd.textContent = w.sd.toFixed(1) + ' µm';
        lv.textContent = w.lv.toFixed(4) + ' mm';
        miss.classList.toggle('on', w.p !== w.c);
        S.cv.setAttribute('aria-label', NAMES[cls] + ', test window ' + (sel + 1) + ' of ' + L.length + '. Arrow keys choose the window. '
          + gearRight(L) + ' of ' + L.length + ' are classified correctly.');
      }
      draw();
    }

    const tick = ticker(dt => {
      if (!playing || !data) return false;
      acc += dt;
      if (acc >= 1.2) { acc = 0; sel = (sel + 1) % list().length; update(); }
      return true;
    });
    function setPlaying(v) {
      playing = v;
      play.set(v);
      ui.read.setAttribute('aria-live', v ? 'off' : 'polite');
      if (v) tick.start(); else tick.stop();
    }

    const S = canvas(ui.stage, { tabindex: '0', role: 'application', 'aria-label': 'Test windows of the chosen gear condition.' }, draw);
    const P = 16, STRIP = 22;
    const stripTop = () => S.h - 56;
    S.cv.addEventListener('keydown', e => {
      const n = list().length;
      if (!n || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      setPlaying(false);
      sel = (sel + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
      update();
    });
    S.cv.addEventListener('click', e => {
      const n = list().length, r = S.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (!n || y < stripTop() - 8 || y > stripTop() + STRIP + 8) return;
      setPlaying(false);
      sel = clamp(Math.floor((x - P) / ((S.w - 2 * P) / n)), 0, n - 1);
      update();
    });

    function draw() {
      if (!S.w) return;
      const c = colors(), g = S.begin();
      g.font = font(13, c.text); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = c.ink2;
      if (!data) { g.fillText(msg, P, 28); return; }
      const L = list(), w = L[sel], top = 44, sy = stripTop(), bot = sy - 40;
      const mid = (top + bot) / 2, k = (bot - top) / 2 / lim, n = w.e.length / 2, span = S.w - 2 * P;
      const scale = '±' + lim + ' µm', long = 'Sensor 1, displacement about the window mean';
      const fits = g.measureText(long).width + g.measureText(scale).width + 24 < span;
      g.fillText(fits ? long : 'Sensor 1, about its mean', P, 24);
      g.textAlign = 'right';
      g.fillText(scale, S.w - P, 24);
      g.strokeStyle = c.rule; g.lineWidth = 1;
      line(g, P, mid, S.w - P, mid);
      line(g, P, top, S.w - P, top);
      line(g, P, bot, S.w - P, bot);
      g.strokeStyle = c.ink; g.lineWidth = 1.25; g.lineJoin = 'round';
      g.beginPath();
      for (let j = 0; j < 2 * n; j++) {
        const x = P + span * (Math.floor(j / 2) + (j % 2 ? 0.75 : 0.25)) / n, y = mid - w.e[j] * k;
        if (j) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      g.fillStyle = c.ink2; g.textAlign = 'left';
      g.fillText('0 ms', P, bot + 20);
      g.textAlign = 'right';
      g.fillText(Math.round(data.ms) + ' ms', S.w - P, bot + 20);
      // One cell per test window: filled when the call was right, hollow and struck through when not.
      const cw = span / L.length;
      L.forEach((it, i) => {
        const x = P + i * cw + 2, wd = Math.max(2, cw - 4);
        if (it.p === it.c) { g.fillStyle = c.ink; g.globalAlpha = 0.6; g.fillRect(x, sy, wd, STRIP); g.globalAlpha = 1; }
        else {
          g.strokeStyle = c.gold; g.lineWidth = 2;
          g.strokeRect(x + 1, sy + 1, wd - 2, STRIP - 2);
          line(g, x + 1, sy + STRIP - 1, x + wd - 1, sy + 1);
        }
        if (i === sel) { g.fillStyle = c.ink; g.fillRect(x, sy + STRIP + 5, wd, 3); }
      });
      g.fillStyle = c.ink2; g.textAlign = 'left';
      g.fillText('Test windows, ' + gearRight(L) + ' of ' + L.length + ' correct', P, S.h - 10);
    }

    const src = el.getAttribute('data-src');
    (src ? fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }) : Promise.reject(new Error('no data')))
      .then(d => {
        if (!d || !Array.isArray(d.windows) || !d.windows.length) throw new Error('bad data');
        data = d;
        update();
      })
      .catch(() => { msg = 'The test windows could not be loaded.'; draw(); });
    return { visible: tick.visible, redraw: draw };
  }

  /* ---------- Demo 4: win-probability replay ---------- */

  function winprob(el) {
    const ui = shell(el, '');
    const SPEED = 144;
    let game = null, total = 2880, s = 0, acc = 0, playing = false;

    const play = playButton(() => {
      if (!game) return;
      if (!playing && s >= total) s = 0;
      setPlaying(!playing);
    });
    const scrub = range('Game Time', { min: '0', max: String(total), step: '10', value: '0' }, null, v => { setPlaying(false); s = v; sync(); }, 'demo-grow');
    ui.bar.append(play.el, scrub.el);
    const when = stat(ui.read, '').b;
    const home = stat(ui.read, 'Home'), away = stat(ui.read, 'Away');
    const fin = stat(ui.read, 'Final');
    fin.k.parentNode.classList.add('demo-flag');

    function text() {
      const t = gameClock(s), p = probAt(game.points, s);
      return { when: t.period + ' ' + t.clock, home: (p * 100).toFixed(1) + '%', away: ((1 - p) * 100).toFixed(1) + '%' };
    }
    const report = throttle(() => {
      if (!game) return;
      const t = text();
      when.textContent = t.when; home.b.textContent = t.home; away.b.textContent = t.away;
      const done = game.final && s >= game.points[game.points.length - 1][0];
      fin.b.textContent = game.final ? game.home + ' ' + game.final[0] + ', ' + game.away + ' ' + game.final[1] : '';
      fin.k.parentNode.classList.toggle('on', !!done);
    }, 200);

    function sync() {
      if (!game) return;
      scrub.input.value = String(Math.round(s));
      const t = text();
      scrub.input.setAttribute('aria-valuetext', t.when + ', ' + game.home + ' ' + t.home);
      draw(); report();
    }

    const tick = ticker(dt => {
      if (!playing) return false;
      if (reduced()) { acc += dt; if (acc < 0.4) return true; acc = 0; s = Math.min(total, s + 60); }
      else s = Math.min(total, s + dt * SPEED);
      sync();
      if (s >= total) { setPlaying(false); return false; }
      return true;
    });
    function setPlaying(v) {
      playing = v;
      play.set(v);
      ui.read.setAttribute('aria-live', v ? 'off' : 'polite');
      if (v) tick.start(); else tick.stop();
    }

    const S = canvas(ui.stage, { role: 'img', 'aria-label': 'Home win probability through the game, drawn up to the current game time.' }, draw);

    function draw() {
      if (!S.w) return;
      const c = colors(), g = S.begin();
      const L = S.w < 520 ? 44 : 56, R = 16, T = 24, B = 32;
      const x = t => L + t / total * (S.w - L - R), y = p => T + (1 - p) * (S.h - T - B);

      g.lineWidth = 1;
      g.strokeStyle = c.rule;
      line(g, L, y(1), S.w - R, y(1)); line(g, L, y(0), S.w - R, y(0));
      const ends = [720, 1440, 2160, 2880];
      for (let e = 3180; e <= total; e += 300) ends.push(e);
      ends.slice(0, -1).forEach(e => line(g, x(e) + 0.5, y(1), x(e) + 0.5, y(0)));
      g.strokeStyle = c.line; g.setLineDash([3, 5]); line(g, L, y(0.5), S.w - R, y(0.5)); g.setLineDash([]);

      g.fillStyle = c.ink2; g.font = font(13, c.text); g.textBaseline = 'middle'; g.textAlign = 'center';
      let a = 0;
      ends.forEach(e => { g.fillText(gameClock(e).period, x((a + e) / 2), S.h - B / 2 + 2); a = e; });
      g.textAlign = 'right';
      g.fillText(game ? game.home : 'Home', L - 10, y(1));
      g.fillText('50%', L - 10, y(0.5));
      g.fillText(game ? game.away : 'Away', L - 10, y(0));
      if (game && !game.real) { g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('Illustrative curve', S.w - R, 6); }
      if (!game) return;

      // Step line: the model's number holds until the next play.
      const pts = game.points;
      g.strokeStyle = c.ink; g.lineWidth = 1.5; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x(pts[0][0]), y(pts[0][1]));
      let last = pts[0][1];
      for (let i = 1; i < pts.length && pts[i][0] <= s; i++) { g.lineTo(x(pts[i][0]), y(last)); last = pts[i][1]; g.lineTo(x(pts[i][0]), y(last)); }
      g.lineTo(x(s), y(last));
      g.stroke();

      g.strokeStyle = c.line; g.lineWidth = 1;
      line(g, x(s) + 0.5, y(1), x(s) + 0.5, y(0));
      g.fillStyle = c.gold; circle(g, x(s), y(probAt(pts, s)), 4); g.fill();
    }

    function check(j) {
      const ok = j && typeof j.home === 'string' && typeof j.away === 'string' && Array.isArray(j.points) && j.points.length > 1 &&
        j.points.every(p => Array.isArray(p) && isFinite(p[0]) && p[1] >= 0 && p[1] <= 1);
      if (!ok) throw new Error('bad data');
      return { home: j.home, away: j.away, final: Array.isArray(j.final) ? j.final : null, points: j.points, real: true, note: j.note || '' };
    }

    function start(gm) {
      game = gm;
      const lastT = gm.points[gm.points.length - 1][0];
      total = lastT <= 2880 ? 2880 : 2880 + Math.ceil((lastT - 2880) / 300) * 300;
      scrub.input.max = String(total);
      home.k.textContent = gm.home; away.k.textContent = gm.away;
      ui.note.textContent = gm.note;
      s = reduced() ? total : 0;
      sync();
      if (!reduced()) setPlaying(true);
    }

    const src = el.getAttribute('data-src');
    (src ? fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(check) : Promise.reject(new Error('no data')))
      .catch(() => illustrativeGame())
      .then(start);

    return { visible: tick.visible, redraw: draw };
  }

  /* ---------- Demo 5: 555 servo driver ---------- */

  function pwm(el) {
    const ui = shell(el, 'Ideal 555 model with the report’s parts: R1 2.2 kΩ, a 10 kΩ potentiometer, R2 100 kΩ and C 220 nF. ' +
      'It leaves out the diode’s forward drop, so its widest pulse reads short of the measured 2.50 ms. The horn follows the ' +
      'servo test: about 30°, 90° and 150° at the minimum, middle and maximum of the potentiometer.');
    let x = 0.5, shown = hornAngle(x);

    const slider = range('Potentiometer', { min: '0', max: '100', step: '1', value: '50' }, v => v + '%', v => { x = v / 100; update(); }, 'demo-grow');
    ui.bar.append(slider.el);
    const width = stat(ui.read, 'Pulse Width').b, freq = stat(ui.read, 'Frequency').b;
    const duty = stat(ui.read, 'Duty Cycle').b, horn = stat(ui.read, 'Horn').b;
    const about = () => 'about ' + Math.round(hornAngle(x) / 5) * 5 + '°';
    const report = throttle(() => {
      const m = pwmModel(x);
      width.textContent = m.high.toFixed(2) + ' ms'; freq.textContent = m.freq.toFixed(1) + ' Hz';
      duty.textContent = (m.duty * 100).toFixed(1) + '%'; horn.textContent = about();
    }, 150);

    // The horn eases to its new angle; with reduced motion it jumps.
    const tick = ticker(dt => {
      const t = hornAngle(x), d = t - shown;
      if (reduced() || Math.abs(d) < 0.05) shown = t; else shown += d * (1 - Math.exp(-dt * 10));
      draw();
      return shown !== t;
    });
    function update() {
      const m = pwmModel(x);
      slider.input.setAttribute('aria-valuetext', Math.round(x * 100) + '%, pulse width ' + m.high.toFixed(2) + ' ms, horn ' + about());
      tick.start(); report();
    }

    const S = canvas(ui.stage, { role: 'img', 'aria-label': 'One period of the 555 output as the ideal model gives it, with the two measured pulse widths marked, beside a servo horn turned to the matching angle.' }, draw);

    function draw() {
      if (!S.w) return;
      const c = colors(), g = S.begin(), m = pwmModel(x), wide = S.w >= 560;
      const span = 20, t0 = 1;
      const W = wide ? { x0: 56, x1: S.w * 0.62, y0: 64, y1: S.h - 64 } : { x0: 44, x1: S.w - 28, y0: 52, y1: S.h * 0.46 };
      const X = t => W.x0 + t / span * (W.x1 - W.x0);

      // Time axis and level guides
      g.lineWidth = 1; g.strokeStyle = c.rule;
      line(g, W.x0, W.y0, W.x1, W.y0);
      g.strokeStyle = c.line;
      line(g, W.x0, W.y1 + 0.5, W.x1, W.y1 + 0.5);
      g.fillStyle = c.ink2; g.font = font(13, c.text); g.textBaseline = 'middle'; g.textAlign = 'right';
      g.fillText('High', W.x0 - 10, W.y0); g.fillText('Low', W.x0 - 10, W.y1);
      g.textAlign = 'center'; g.textBaseline = 'top';
      for (let t = 0; t <= span; t += 5) { line(g, X(t), W.y1, X(t), W.y1 + 5); g.fillText(t + (t === span ? ' ms' : ''), X(t), W.y1 + 9); }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillText('Ideal model', W.x0, W.y0 - 34);

      // Measured pulse widths, from the first rising edge
      g.strokeStyle = c.gold; g.fillStyle = c.gold; g.setLineDash([3, 4]);
      // The second label starts at its line, so the two never collide on a narrow screen.
      PWM.ENDS.forEach((w, i) => {
        line(g, X(t0 + w), W.y0 - 10, X(t0 + w), W.y1);
        g.textAlign = i ? 'left' : 'center'; g.fillText(w.toFixed(2), X(t0 + w) + (i ? 3 : 0), W.y0 - 14);
      });
      g.setLineDash([]); g.textAlign = 'right';
      g.fillText('Measured ends (ms)', W.x1, W.y0 - 34);

      // The model's output: pulses every period, as far as the window shows
      g.strokeStyle = c.ink; g.lineWidth = 1.5; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(X(0), W.y1);
      for (let t = t0; t < span; t += m.period) {
        const e = Math.min(t + m.high, span);
        g.lineTo(X(t), W.y1); g.lineTo(X(t), W.y0); g.lineTo(X(e), W.y0); g.lineTo(X(e), W.y1);
      }
      g.lineTo(X(span), W.y1); g.stroke();

      // Servo from above: the 0 to 180 degree sweep, the measured travel and the horn
      const r = wide ? Math.min(S.w * 0.13, (S.h - 140) * 0.75) : Math.min(S.w * 0.34, S.h * 0.3);
      const hx = wide ? (W.x1 + S.w) / 2 + 8 : S.w / 2, hy = wide ? S.h / 2 + r * 0.45 : S.h - 34;
      const P = (deg, rr) => [hx + rr * Math.cos(deg / DEG), hy - rr * Math.sin(deg / DEG)];
      g.fillStyle = c.surface; g.strokeStyle = c.ink; g.lineWidth = 1.25;
      g.beginPath(); g.rect(hx - r * 0.42, hy - r * 0.24, r * 0.84, r * 0.46); g.fill(); g.stroke();
      g.strokeStyle = c.ink2; g.lineWidth = 1; g.setLineDash([3, 5]);
      g.beginPath(); g.arc(hx, hy, r, Math.PI, 0); g.stroke();
      g.setLineDash([]);
      g.strokeStyle = c.line;
      for (let a = 0; a <= 180; a += 30) { const [ax, ay] = P(a, r), [bx, by] = P(a, r + 6); line(g, ax, ay, bx, by); }
      g.strokeStyle = c.gold; g.lineWidth = 2;
      g.beginPath(); g.arc(hx, hy, r, -PWM.ANG[1] / DEG, -PWM.ANG[0] / DEG); g.stroke();
      g.fillStyle = c.gold; g.textBaseline = 'middle'; g.textAlign = 'center';
      PWM.ANG.forEach(a => { const [lx, ly] = P(a, r + 20); g.fillText(a + '°', lx, ly); });

      const [tx, ty] = P(shown, r * 0.86), [bx, by] = P(shown + 180, r * 0.24);
      g.strokeStyle = c.ink; g.lineWidth = Math.max(5, r * 0.07); g.lineCap = 'round';
      line(g, bx, by, tx, ty);
      g.lineCap = 'butt'; g.lineWidth = 1.25; g.fillStyle = c.night;
      circle(g, hx, hy, Math.max(4, r * 0.06)); g.fill(); g.stroke();
    }

    update();
    return { visible: tick.visible, redraw: draw };
  }

  /* ---------- Demo 6: colour sorter decision ---------- */

  function sort(el) {
    const ui = shell(el, 'The profiles, the 0.07 thresholds and the decision rules are the robot firmware’s, from the team’s final ' +
      'report. The yellow eraser is an earlier calibration that the final firmware rejects. The slider’s blend from belt to ' +
      'eraser is an illustration, not a recorded sensor trace. Left out: the 800 ms lockout after each match.');
    const PROFILE = { target: SORT.TARGET, yellow: SORT.YELLOW, empty: SORT.BELT };
    let what = 'target', pct = 0, down = false, d = null;
    const reading = () => sortBlend(PROFILE[what], pct / 100);
    const sense = () => { d = sortDecide(reading()); down = sortFlip(down, d.kind); };
    const says = () => d.kind === 'target' ? 'Target, flipper down' : d.kind === 'other' ? 'Non-target, flipper up'
      : 'Empty belt, flipper stays ' + (down ? 'down' : 'up');
    sense();
    let shown = down ? 1 : 0;

    ui.bar.append(seg('On the belt', [['target', 'Target'], ['yellow', 'Yellow'], ['empty', 'Empty Belt']], what, v => {
      what = v; slider.input.disabled = v === 'empty'; sense(); update();
    }));
    // Every 1% the slider passes is one reading, so a fast drag gives the same flipper as small steps.
    const slider = range('Eraser Under Sensor', { min: '0', max: '100', step: '1', value: '0' }, v => v + '%', v => {
      while (pct !== v) { pct += Math.sign(v - pct); sense(); }
      update();
    }, 'demo-grow');
    ui.bar.append(slider.el);
    const fromBelt = stat(ui.read, 'From Belt').b, fromTarget = stat(ui.read, 'From Target').b, decision = stat(ui.read, 'Decision').b;
    const report = throttle(() => {
      fromBelt.textContent = d.fromBelt.toFixed(3); fromTarget.textContent = d.fromTarget.toFixed(3);
      decision.textContent = says();
    }, 150);

    // The flipper eases to its new position; with reduced motion it jumps.
    const tick = ticker(dt => {
      const t = down ? 1 : 0, e = t - shown;
      if (reduced() || Math.abs(e) < 0.002) shown = t; else shown += e * (1 - Math.exp(-dt * 12));
      draw();
      return shown !== t;
    });
    function update() {
      slider.input.setAttribute('aria-valuetext', pct + '%, ' + d.fromBelt.toFixed(3) + ' from the belt, ' + d.fromTarget.toFixed(3) + ' from the target: ' + says());
      tick.start(); report();
    }

    const S = canvas(ui.stage, { role: 'img', 'aria-label': 'The sensor’s three normalised channels with the belt and target profiles marked, the reading’s distances from both profiles against the 0.07 threshold, and the end of the conveyor with the flipper up or down.' }, draw);

    function draw() {
      if (!S.w) return;
      const c = colors(), g = S.begin(), wide = S.w >= 560, rgb = reading(), P = 16, RH = wide ? 26 : 22, LH = 18;
      g.font = font(13, c.text); g.textBaseline = 'middle'; g.lineWidth = 1;

      // Bars: label, track, value. Channels run 0 to 0.5, distances 0 to 0.16.
      const bx0 = P, bx1 = wide ? Math.round(S.w * 0.56) : S.w - P;
      const LW = Math.ceil(Math.max(...['R / C', 'G / C', 'B / C', 'From belt', 'From target'].map(t => g.measureText(t).width))) + 12;
      const tx0 = bx0 + LW, tx1 = bx1 - Math.ceil(g.measureText('0.000').width) - 12;
      const legend = [['Belt', c.ink2], ['Target', c.gold]], head = 'Normalised reading';
      // Each legend item is a tick, 8 px, its word; items 18 px apart.
      const legW = legend.reduce((a, [t]) => a + 8 + g.measureText(t).width + 18, -18);
      const wrap = g.measureText(head).width + 24 + legW > bx1 - bx0;
      const blockH = LH + (wrap ? LH : 0) + 8 + 3 * RH + 16 + LH + 8 + 2 * RH + 8 + LH;
      let y = (wide ? Math.max(P, (S.h - blockH) / 2) : P) + LH / 2;

      const tick2 = (x, y0, y1, col) => { g.strokeStyle = col; g.lineWidth = 2; line(g, x, y0, x, y1); g.lineWidth = 1; };
      const bar = (label, v, max, marks) => {
        const X = u => tx0 + clamp(u / max, 0, 1) * (tx1 - tx0);
        g.fillStyle = c.ink2; g.textAlign = 'left'; g.fillText(label, bx0, y);
        g.strokeStyle = c.line; line(g, tx0, y + 0.5, tx1, y + 0.5);
        g.fillStyle = c.ink; g.fillRect(tx0, y - 3, X(v) - tx0, 6);
        marks.forEach(([u, col]) => tick2(X(u), y - 8, y + 8, col));
        g.fillStyle = c.ink; g.textAlign = 'right'; g.fillText(v.toFixed(3), bx1, y);
        y += RH;
        return X;
      };

      g.fillStyle = c.ink2; g.textAlign = 'left'; g.fillText(head, bx0, y);
      let lx = wrap ? bx0 : bx1 - legW;
      if (wrap) y += LH;
      legend.forEach(([t, col]) => {
        tick2(lx + 1, y - 6, y + 6, col);
        g.fillStyle = c.ink2; g.textAlign = 'left'; g.fillText(t, lx + 8, y);
        lx += 8 + g.measureText(t).width + 18;
      });
      y += LH / 2 + 8 + RH / 2;
      ['R / C', 'G / C', 'B / C'].forEach((t, i) => bar(t, rgb[i], 0.5, [[SORT.BELT[i], c.ink2], [SORT.TARGET[i], c.gold]]));

      y += 16 - RH / 2 + LH / 2;
      g.fillStyle = c.ink2; g.textAlign = 'left'; g.fillText('Distance', bx0, y);
      y += LH / 2 + 8 + RH / 2;
      const r0 = y;
      bar('From belt', d.fromBelt, 0.16, []);
      const X = bar('From target', d.fromTarget, 0.16, []);
      const th = X(SORT.MATCH);
      g.strokeStyle = c.gold; g.setLineDash([3, 3]); line(g, th, r0 - 12, th, y - RH + 12); g.setLineDash([]);
      g.fillStyle = c.gold; g.textAlign = 'center';
      const thText = '0.07 threshold', thW = g.measureText(thText).width;
      g.fillText(thText, clamp(th, tx0 + thW / 2, bx1 - thW / 2), y - RH / 2 + 8 + LH / 2);
      const blockEnd = y - RH / 2 + 8 + LH;

      // The end of the conveyor: belt, sensor, eraser and flipper, with the decision under them.
      const sx0 = wide ? bx1 + 32 : P, sx1 = S.w - P, sy0 = wide ? P : blockEnd + 12, sy1 = S.h - 8, sw = sx1 - sx0;
      g.font = font(13, c.text, 500);
      const text = says(), lines = g.measureText(text).width > sw ? text.split(', ') : [text];
      const r = clamp(sw * 0.022, 5, 8), ew = clamp(sw * 0.13, 26, 44), eh = 12;
      const fl = Math.max(24, Math.min(90, sw * 0.26, (sy1 - sy0 - 16 - lines.length * LH - 4) / 1.2));
      const up = 50 / DEG, dn = -25 / DEG;
      const rise = r + eh + 22, by = Math.max(rise + 2, fl * Math.sin(up) - r + 2);
      const ch = by + r + fl * Math.sin(-dn), total = ch + 16 + lines.length * LH;
      const oy = sy0 + Math.max(0, (sy1 - sy0 - total) / 2), beltY = oy + by;
      const px = sx1 - fl * Math.cos(dn) - 4, py = beltY + r;
      const xL = sx0 + r, xR = px - r - 6, sensX = xR - r - ew * 0.75;

      g.strokeStyle = c.ink2; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(xL, beltY - r); g.lineTo(xR, beltY - r); g.arc(xR, beltY, r, -Math.PI / 2, Math.PI / 2);
      g.lineTo(xL, beltY + r); g.arc(xL, beltY, r, Math.PI / 2, Math.PI * 1.5);
      g.stroke();
      g.strokeStyle = c.line;
      circle(g, xL, beltY, r * 0.5); g.stroke(); circle(g, xR, beltY, r * 0.5); g.stroke();

      // Sensor and its view, one eraser wide
      const boxB = beltY - r - eh - 10;
      g.fillStyle = c.surface; g.strokeStyle = c.ink; g.lineWidth = 1.25;
      g.beginPath(); g.rect(sensX - 15, boxB - 12, 30, 12); g.fill(); g.stroke();
      g.strokeStyle = c.ink2; g.lineWidth = 1; g.setLineDash([2, 3]);
      line(g, sensX - 6, boxB, sensX - ew / 2, beltY - r); line(g, sensX + 6, boxB, sensX + ew / 2, beltY - r);
      g.setLineDash([]);
      g.font = font(13, c.text); g.fillStyle = c.ink2; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText('Sensor', sensX - 23, boxB - 6);

      // The eraser covers pct of the view: its leading edge enters at 0%, it is centred at 100%.
      if (what !== 'empty') {
        const ex = sensX - ew / 2 - ew + ew * pct / 100;
        g.fillStyle = what === 'target' ? c.gold : c.surface; g.strokeStyle = c.ink; g.lineWidth = 1.25;
        g.beginPath(); g.rect(ex, beltY - r - eh, ew, eh); g.fill(); g.stroke();
      }

      // Flipper: up rejects, down keeps
      const a = up + shown * (dn - up);
      g.strokeStyle = c.ink; g.lineWidth = 3; g.lineCap = 'round';
      line(g, px, py, px + fl * Math.cos(a), py - fl * Math.sin(a));
      g.lineCap = 'butt'; g.lineWidth = 1.25; g.fillStyle = c.night;
      circle(g, px, py, 4); g.fill(); g.stroke();

      g.font = font(13, c.text, 500); g.fillStyle = c.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      lines.forEach((t, i) => g.fillText(t, (sx0 + sx1) / 2, oy + ch + 16 + (i + 0.75) * LH));
    }

    update();
    return { visible: tick.visible, redraw: draw };
  }

  /* ---------- Boot ---------- */

  const DEMOS = { gearbox, obb, vibration, winprob, pwm, sort };

  function boot() {
    const els = Array.from(document.querySelectorAll('.demo[data-demo]'));
    if (!els.length) return;
    const items = new Map();
    const apply = it => { if (it.api) it.api.visible(it.seen && !document.hidden); };
    const build = el => {
      const it = items.get(el), make = DEMOS[el.getAttribute('data-demo')];
      if (it.api || it.dead) return;
      if (!make) { it.dead = true; el.classList.add('demo-none'); return; }
      el.classList.add('demo-on');
      it.api = make(el);
      apply(it);
    };
    els.forEach(el => items.set(el, { seen: !('IntersectionObserver' in window) }));

    if ('IntersectionObserver' in window) {
      const lazy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { lazy.unobserve(e.target); build(e.target); } }), { rootMargin: '400px 0px' });
      const vis = new IntersectionObserver(es => es.forEach(e => { const it = items.get(e.target); it.seen = e.isIntersecting; apply(it); }));
      els.forEach(el => { lazy.observe(el); vis.observe(el); });
    } else els.forEach(build);

    document.addEventListener('visibilitychange', () => items.forEach(apply));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => items.forEach(it => it.api && it.api.redraw()));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
