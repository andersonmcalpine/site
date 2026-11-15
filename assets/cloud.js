/* Particle cloud: a WebGL2 canvas of points that morph between the project shapes,
   move with the page, push away from the cursor and ripple on click. The canvas can fill
   the screen or sit inside a block; its colours come from the canvas's CSS (--cloud-base,
   --cloud-hi), and --cloud-blend: normal draws the points as ink for light backgrounds. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Samplers for building shapes from parts: each part is [weight, () => point]; assemble shares
  // N points among the parts by weight and fits them in a unit sphere. Seeded, so shapes repeat.
  function kit(N, seed) {
    const R = mulberry(seed), TAU = Math.PI * 2, J = 0.006;
    const rn = (a, b) => a + (b - a) * R();
    const sgn = () => (R() < 0.5 ? -1 : 1);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const jit = p => [p[0] + (R() - 0.5) * J, p[1] + (R() - 0.5) * J, p[2] + (R() - 0.5) * J];

    // Local frame: n is the axis, u and v span the cross-section.
    function frame(c, axis) {
      const n = unit(axis);
      const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = unit(cross(n, ref)), v = cross(n, u);
      return { c, n, u, v };
    }
    const at = (F, a, b, h) => [
      F.c[0] + F.u[0] * a + F.v[0] * b + F.n[0] * h,
      F.c[1] + F.u[1] * a + F.v[1] * b + F.n[1] * h,
      F.c[2] + F.u[2] * a + F.v[2] * b + F.n[2] * h
    ];

    const tube = (F, r, h) => () => { const t = R() * TAU; return at(F, Math.cos(t) * r, Math.sin(t) * r, (R() - 0.5) * h); };
    const disc = (F, r0, r1, h) => () => { const t = R() * TAU, r = Math.sqrt(rn(r0 * r0, r1 * r1)); return at(F, Math.cos(t) * r, Math.sin(t) * r, h); };
    const ring = (F, r, h) => () => { const t = R() * TAU; return jit(at(F, Math.cos(t) * r, Math.sin(t) * r, h)); };
    const seg = (a, b) => () => { const t = R(); return jit([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); };
    const helix = (F, r, h0, h1, pitch, ph) => () => { const h = rn(h0, h1), a = h / pitch * TAU + ph; return jit(at(F, Math.cos(a) * r, Math.sin(a) * r, h)); };
    const sphere = (c, r) => () => { const z = rn(-1, 1), t = R() * TAU, s = Math.sqrt(1 - z * z); return [c[0] + r * s * Math.cos(t), c[1] + r * z, c[2] + r * s * Math.sin(t)]; };

    function cylinder(P, F, r, h, w, caps) {
      const side = TAU * r * h, cap = caps ? Math.PI * r * r : 0, tot = side + 2 * cap;
      P.push([w * 0.72 * side / tot, tube(F, r, h)]);
      if (caps) P.push([w * 0.72 * cap / tot, disc(F, 0, r, h / 2)], [w * 0.72 * cap / tot, disc(F, 0, r, -h / 2)]);
      P.push([w * 0.14, ring(F, r, h / 2)], [w * 0.14, ring(F, r, -h / 2)]);
    }
    // Box along dir (in the xy plane), half sizes hu (length), hv, hw (z depth).
    function box(P, c, dir, hu, hv, hw, w) {
      const u = unit(dir), z = [0, 0, 1], v = unit(cross(z, u));
      const pt = (a, b, d) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, c[2] + d];
      const Au = hv * hw, Av = hu * hw, Aw = hu * hv, At = Au + Av + Aw, Lt = hu + hv + hw;
      const face = () => {
        const k = R() * At, s = sgn();
        if (k < Au) return pt(s * hu, rn(-hv, hv), rn(-hw, hw));
        if (k < Au + Av) return pt(rn(-hu, hu), s * hv, rn(-hw, hw));
        return pt(rn(-hu, hu), rn(-hv, hv), s * hw);
      };
      const edge = () => {
        const k = R() * Lt, s1 = sgn(), s2 = sgn();
        if (k < hu) return jit(pt(rn(-hu, hu), s1 * hv, s2 * hw));
        if (k < hu + hv) return jit(pt(s1 * hu, rn(-hv, hv), s2 * hw));
        return jit(pt(s1 * hu, s2 * hv, rn(-hw, hw)));
      };
      P.push([w * 0.7, face], [w * 0.3, edge]);
    }
    function hexPrism(P, F, rc, h, bore, w) {
      const V = [];
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; V.push([Math.cos(a) * rc, Math.sin(a) * rc]); }
      const side = 6 * rc * h, cap = 1.5 * Math.sqrt(3) * rc * rc - Math.PI * bore * bore, tot = side + 2 * cap;
      const onSide = () => {
        const k = (R() * 6) | 0, a = V[k], b = V[(k + 1) % 6], t = R();
        return at(F, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (R() - 0.5) * h);
      };
      const onCap = s => () => {
        for (let i = 0; i < 64; i++) {
          const k = (R() * 6) | 0, a = V[k], b = V[(k + 1) % 6];
          let r1 = R(), r2 = R();
          if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
          const x = a[0] * r1 + b[0] * r2, y = a[1] * r1 + b[1] * r2;
          if (x * x + y * y >= bore * bore) return at(F, x, y, s * h / 2);
        }
        return at(F, V[0][0], V[0][1], s * h / 2);
      };
      const onEdge = () => {
        const k = (R() * 6) | 0, a = V[k], b = V[(k + 1) % 6], t = R(), m = R();
        if (m < 0.8) return jit(at(F, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (m < 0.4 ? 0.5 : -0.5) * h));
        return jit(at(F, a[0], a[1], (t - 0.5) * h));
      };
      const ws = bore > 0 ? 0.56 : 0.64;
      P.push([w * ws * side / tot, onSide], [w * ws * cap / tot, onCap(1)], [w * ws * cap / tot, onCap(-1)], [w * 0.26, onEdge]);
      if (bore > 0) P.push([w * 0.1, tube(F, bore, h)], [w * 0.04, ring(F, bore, h / 2)], [w * 0.04, ring(F, bore, -h / 2)]);
      else P.push([w * 0.1, onCap(1)]);
    }

    // Shares N points among the parts by weight, centres and scales to a unit sphere,
    // then orders points by height so morphs move them mostly sideways.
    function assemble(P) {
      let tot = 0;
      for (const p of P) tot += p[0];
      const out = new Float32Array(N * 3);
      let i = 0;
      for (let k = 0; k < P.length; k++) {
        const n = k === P.length - 1 ? N - i : Math.round(P[k][0] / tot * N);
        for (let j = 0; j < n && i < N; j++, i++) {
          const q = P[k][1]();
          out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2];
        }
      }
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let p = 0; p < N * 3; p++) { const a = p % 3; if (out[p] < mn[a]) mn[a] = out[p]; if (out[p] > mx[a]) mx[a] = out[p]; }
      const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      let rmax = 0;
      for (let p = 0; p < N; p++) {
        const x = out[p * 3] - c[0], y = out[p * 3 + 1] - c[1], z = out[p * 3 + 2] - c[2];
        out[p * 3] = x; out[p * 3 + 1] = y; out[p * 3 + 2] = z;
        rmax = Math.max(rmax, Math.hypot(x, y, z));
      }
      const s = 1 / (rmax || 1);
      for (let p = 0; p < N * 3; p++) out[p] *= s;
      const idx = new Array(N), key = new Float32Array(N);
      for (let p = 0; p < N; p++) { idx[p] = p; key[p] = out[p * 3 + 1] + (R() - 0.5) * 0.14; }
      idx.sort((a, b) => key[a] - key[b]);
      const sorted = new Float32Array(N * 3);
      for (let p = 0; p < N; p++) {
        const j = idx[p] * 3;
        sorted[p * 3] = out[j]; sorted[p * 3 + 1] = out[j + 1]; sorted[p * 3 + 2] = out[j + 2];
      }
      return sorted;
    }

    return { R, TAU, rn, sgn, cross, unit, sub, mid, dist, jit, frame, at, tube, disc, ring, seg, helix, sphere,
             cylinder, box, hexPrism, assemble };
  }

  // The built-in project shapes, each with exactly N points inside a unit sphere.
  function makeShapes(N) {
    const { R, TAU, rn, sgn, sub, mid, dist, jit, frame, at, tube, disc, ring, seg, helix, sphere,
            cylinder, box, hexPrism, assemble } = kit(N, 20261108);

    function arm() {
      const P = [], Y = [0, 1, 0], Z = [0, 0, 1];
      cylinder(P, frame([-0.3, -0.96, 0], Y), 0.56, 0.1, 1350, true);
      cylinder(P, frame([-0.3, -0.86, 0], Y), 0.34, 0.1, 520, true);
      cylinder(P, frame([-0.3, -0.66, 0], Y), 0.21, 0.32, 520, false);
      cylinder(P, frame([-0.3, -0.42, 0], Z), 0.2, 0.44, 640, true);
      const S = [-0.3, -0.42, 0], E = [0.02, 0.5, 0], W = [0.7, 0.34, 0];
      box(P, mid(S, E), sub(E, S), dist(S, E) / 2, 0.1, 0.13, 1250);
      cylinder(P, frame(E, Z), 0.15, 0.36, 480, true);
      box(P, mid(E, W), sub(W, E), dist(E, W) / 2, 0.075, 0.095, 950);
      cylinder(P, frame(W, Z), 0.1, 0.26, 300, true);
      cylinder(P, frame([0.7, 0.22, 0], Y), 0.075, 0.16, 240, true);
      box(P, [0.7, 0.1, 0], [1, 0, 0], 0.17, 0.035, 0.075, 260);
      box(P, [0.58, -0.05, 0], [0, 1, 0], 0.12, 0.026, 0.055, 220);
      box(P, [0.82, -0.05, 0], [0, 1, 0], 0.12, 0.026, 0.055, 220);
      return assemble(P);
    }

    // The fastener project's own idea: the bolt lies at an angle, as parts do in a bin, and an
    // oriented box (dashed) fits it tightly and turns with it. A nut sits beside it.
    function boltNut() {
      const P = [], B = [], Y = [0, 1, 0];
      hexPrism(B, frame([0, 0.68, 0], Y), 0.36, 0.24, 0, 2000);
      B.push([120, ring(frame([0, 0.555, 0], Y), 0.3, 0)]);
      B.push([420, tube(frame([0, 0.33, 0], Y), 0.18, 0.44)]);
      const F = frame([0, 0, 0], Y);
      B.push([1500, helix(F, 0.2, -1.0, 0.11, 0.085, 0)]);
      B.push([520, helix(F, 0.165, -1.0, 0.11, 0.085, Math.PI)]);
      B.push([140, disc(frame([0, -1.0, 0], Y), 0, 0.16, 0)], [90, ring(frame([0, -1.0, 0], Y), 0.165, 0)]);
      // The oriented box in the bolt's own frame: corner k has x, y, z from bits 2, 1 and 0 of k.
      const lo = [-0.42, -1.06, -0.36], hi = [0.42, 0.86, 0.36], C = [];
      for (let k = 0; k < 8; k++) C.push([k & 4 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 1 ? hi[2] : lo[2]]);
      const dashed = (a, b) => () => {
        for (;;) {
          const s = R(), d = dist(a, b) * s / 0.08;
          if (d - Math.floor(d) < 0.6) return jit([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]);
        }
      };
      for (let k = 0; k < 8; k++) for (const bit of [1, 2, 4]) if (!(k & bit)) B.push([95 * dist(C[k], C[k | bit]), dashed(C[k], C[k | bit])]);
      // Tilt the bolt and its box together, then move them left of the nut.
      const ca = Math.cos(-0.6), sa = Math.sin(-0.6);
      for (const [w, f] of B) P.push([w, () => { const q = f(); return [q[0] * ca - q[1] * sa - 0.42, q[0] * sa + q[1] * ca + 0.1, q[2]]; }]);
      const NF = frame([0.72, -0.72, 0.08], [0.3, 1, 0.45]);
      hexPrism(P, NF, 0.32, 0.25, 0.16, 2000);
      P.push([280, helix(NF, 0.15, -0.12, 0.12, 0.085, 0.6)]);
      return assemble(P);
    }

    function gear() {
      const P = [], Zt = 18, rr = 0.78, rt = 0.96, hw = 0.12, rh = 0.3, rb = 0.13, hl = 0.25, per = TAU / Zt;
      // Tooth outline radius by angle; tooth 2 has its tip chipped.
      const gr = th => {
        const q = th / per, k = Math.floor(q), u = q - k;
        let r;
        if (u < 0.12 || u > 0.88) r = rr;
        else if (u < 0.3) r = rr + (rt - rr) * (u - 0.12) / 0.18;
        else if (u < 0.7) r = rt;
        else r = rt - (rt - rr) * (u - 0.7) / 0.18;
        if (((k % Zt) + Zt) % Zt === 2 && u > 0.42 && u <= 0.88) r = Math.min(r, rr + (rt - rr) * 0.2);
        return r;
      };
      const M = 3600, ox = new Float32Array(M + 1), oy = new Float32Array(M + 1), cum = new Float32Array(M + 1);
      for (let i = 0; i <= M; i++) {
        const th = i / M * TAU, r = gr(Math.min(th, TAU - 1e-6));
        ox[i] = Math.cos(th) * r; oy[i] = Math.sin(th) * r;
        if (i) cum[i] = cum[i - 1] + Math.hypot(ox[i] - ox[i - 1], oy[i] - oy[i - 1]);
      }
      const onOutline = () => {
        const s = R() * cum[M];
        let lo = 1, hi = M;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
        const t = (s - cum[lo - 1]) / ((cum[lo] - cum[lo - 1]) || 1);
        return [ox[lo - 1] + (ox[lo] - ox[lo - 1]) * t, oy[lo - 1] + (oy[lo] - oy[lo - 1]) * t];
      };
      const holes = [];
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + TAU / 12; holes.push([Math.cos(a) * 0.54, Math.sin(a) * 0.54]); }
      const inHole = (x, y) => holes.some(h => (x - h[0]) * (x - h[0]) + (y - h[1]) * (y - h[1]) < 0.01);
      const face = z => () => {
        for (let i = 0; i < 64; i++) {
          const th = R() * TAU, R0 = gr(th) * 0.995, r = Math.sqrt(rn(rh * rh, R0 * R0));
          const x = Math.cos(th) * r, y = Math.sin(th) * r;
          if (!inHole(x, y)) return [x, y, z];
        }
        return [rh, 0, z];
      };
      const flank = () => { const p = onOutline(); return [p[0], p[1], rn(-hw, hw)]; };
      const edge = z => () => { const p = onOutline(); return jit([p[0], p[1], z]); };
      const holeRim = z => () => { const h = holes[(R() * 6) | 0], a = R() * TAU; return jit([h[0] + Math.cos(a) * 0.1, h[1] + Math.sin(a) * 0.1, z]); };
      const holeWall = () => { const h = holes[(R() * 6) | 0], a = R() * TAU; return [h[0] + Math.cos(a) * 0.1, h[1] + Math.sin(a) * 0.1, rn(-hw, hw)]; };
      P.push([1600, face(hw)], [1150, face(-hw)], [1500, flank], [950, edge(hw)], [850, edge(-hw)], [260, holeRim(hw)], [200, holeRim(-hw)], [120, holeWall]);
      const HF = frame([0, 0, 0], [0, 0, 1]);
      cylinder(P, HF, rh, hl * 2, 520, false);
      P.push([200, disc(HF, rb, rh, hl)], [160, disc(HF, rb, rh, -hl)]);
      P.push([220, tube(HF, rb, hl * 2)], [80, ring(HF, rb, hl)], [70, ring(HF, rb, -hl)]);
      // A few loose chips drifting off the damaged tooth.
      const thB = (2 + 0.65) * per;
      P.push([110, () => { const th = thB + (R() - 0.5) * 0.12, r = rt + 0.04 + 0.32 * Math.pow(R(), 1.6); return [Math.cos(th) * r, Math.sin(th) * r, rn(-hw, hw) * 1.4]; }]);
      return assemble(P);
    }

    function ball() {
      const P = [], c = [0, 0.3, 0], r = 0.6, Y = [0, 1, 0];
      P.push([2500, sphere(c, r)]);
      const ca = Math.cos(0.4), sa = Math.sin(0.4), cb = Math.cos(0.6), sb = Math.sin(0.6);
      const tilt = v => { const x = v[0] * ca - v[1] * sa, y = v[0] * sa + v[1] * ca, z = v[2]; return [x * cb + z * sb, y, -x * sb + z * cb]; };
      const ex = tilt([1, 0, 0]), ey = tilt([0, 1, 0]);
      const seam = (n, d, w) => P.push([w, ring(frame([c[0] + n[0] * d, c[1] + n[1] * d, c[2] + n[2] * d], n), Math.sqrt(r * r - d * d) * 1.01, 0)]);
      const d = r * Math.cos(0.96);
      seam(ey, 0, 520); seam(ex, 0, 520); seam(ex, d, 430); seam(ex, -d, 430);
      const yc = -0.74, hx = 0.98, hz = 0.4;
      const L = (a, b, w) => P.push([w, seg([a[0], yc, a[1]], [b[0], yc, b[1]])]);
      L([-hx, -hz], [hx, -hz], 360); L([-hx, hz], [hx, hz], 360);
      L([-hx, -hz], [-hx, hz], 150); L([hx, -hz], [hx, hz], 150);
      L([0, -hz], [0, hz], 150);
      P.push([300, ring(frame([0, yc, 0], Y), 0.24, 0)]);
      for (const s of [-1, 1]) {
        const x0 = s * hx, x1 = s * (hx - 0.36);
        L([x0, -0.16], [x1, -0.16], 70); L([x0, 0.16], [x1, 0.16], 70); L([x1, -0.16], [x1, 0.16], 60);
        P.push([90, () => { const a = (R() - 0.5) * Math.PI; return jit([x1 - s * Math.cos(a) * 0.16, yc, Math.sin(a) * 0.16]); }]);
      }
      P.push([420, () => [rn(-hx, hx), yc, rn(-hz, hz)]]);
      P.push([200, () => { const a = R() * TAU, q = Math.sqrt(R()) * 0.3; return [Math.cos(a) * q, yc, Math.sin(a) * q * 0.8]; }]);
      return assemble(P);
    }

    // Samples a closed or open polyline by length; points are [x, y, z].
    const line = (P, pts, w, closed) => {
      const n = pts.length - (closed ? 0 : 1);
      for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; P.push([w * dist(a, b), seg(a, b)]); }
    };

    // The sorting robot, after its CAD model: two curved scrapers and a bristle brush at the
    // front (+x), a covered conveyor rising to a bucket at the rear, its two bucket arms, two drive
    // wheels, a caster and the battery on a flat chassis. y is up, z is across the robot.
    function sorter() {
      const P = [], Y = [0, 1, 0], Z = [0, 0, 1];
      // Chassis plate: rounded rear corners, a slight taper to the brush. Faint face, strong edge.
      const out = [[0.5, 0, -0.27], [0.24, 0, -0.36]];
      for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 - k * Math.PI / 12; out.push([-0.78 + Math.cos(a) * 0.17, 0, -0.19 + Math.sin(a) * 0.17]); }
      for (let k = 0; k <= 6; k++) { const a = Math.PI + k * Math.PI / 12; out.push([-0.78 + Math.cos(a) * 0.17, 0, 0.19 - Math.sin(a) * 0.17]); }
      out.push([0.24, 0, 0.36], [0.5, 0, 0.27]);
      line(P, out, 260, true);
      const inside = (x, z) => {
        let c = false;
        for (let i = 0, j = out.length - 1; i < out.length; j = i++) {
          const a = out[i], b = out[j];
          if ((a[2] > z) !== (b[2] > z) && x < (b[0] - a[0]) * (z - a[2]) / (b[2] - a[2]) + a[0]) c = !c;
        }
        return c;
      };
      P.push([620, () => { for (;;) { const x = rn(-0.95, 0.5), z = rn(-0.36, 0.36); if (inside(x, z)) return [x, 0, z]; } }]);
      // Drive wheels outside the plate, with spokes; a caster under the rear.
      for (const s of [-1, 1]) {
        const F = frame([-0.06, 0.01, s * 0.43], Z);
        cylinder(P, F, 0.17, 0.06, 420, false);
        P.push([70, ring(F, 0.05, s * 0.03)]);
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6; P.push([22, seg(at(F, Math.cos(a) * 0.05, Math.sin(a) * 0.05, s * 0.03), at(F, Math.cos(a) * 0.16, Math.sin(a) * 0.16, s * 0.03))]); }
      }
      P.push([70, sphere([-0.8, -0.1, 0], 0.055)], [30, seg([-0.8, 0, 0], [-0.8, -0.05, 0])]);
      // Brush: bristles standing out from a core across the front, between two side plates.
      const bc = [0.6, -0.03, 0], br = 0.12, bw = 0.26;
      P.push([950, () => { const a = R() * TAU, z = rn(-bw, bw), r = 0.03 + (br - 0.03) * Math.sqrt(R()); return [bc[0] + Math.cos(a) * r, bc[1] + Math.sin(a) * r, z]; }]);
      P.push([90, tube(frame(bc, Z), 0.03, bw * 2)]);
      for (const s of [-1, 1]) line(P, [[0.46, -0.06, s * 0.29], [0.74, -0.06, s * 0.29], [0.74, 0.14, s * 0.29], [0.46, 0.14, s * 0.29]], 150, true);
      // Scrapers: curved blades near the floor that funnel erasers in toward the brush.
      for (const s of [-1, 1]) {
        const A = [0.66, s * 0.3], B = [0.94, s * 0.34], C = [1.08, s * 0.62];
        const q = t => { const u = 1 - t; return [u * u * A[0] + 2 * u * t * B[0] + t * t * C[0], u * u * A[1] + 2 * u * t * B[1] + t * t * C[1]]; };
        P.push([260, () => { const p = q(R()); return [p[0], rn(-0.15, -0.03), p[1]]; }]);
        P.push([140, () => { const p = q(R()); return jit([p[0], -0.03, p[1]]); }], [110, () => { const p = q(R()); return jit([p[0], -0.15, p[1]]); }]);
      }
      // Conveyor: a ribbed belt on two rollers, rising from the brush to the rear, under a cover.
      const L0 = [0.44, 0.1], L1 = [-0.42, 0.64], len = Math.hypot(L1[0] - L0[0], L1[1] - L0[1]);
      const d = [(L1[0] - L0[0]) / len, (L1[1] - L0[1]) / len], nrm = [-d[1], d[0]];
      const cv = (s, o, z) => [L0[0] + d[0] * s + nrm[0] * o, L0[1] + d[1] * s + nrm[1] * o, z];
      const hb = 0.17, rr = 0.045;
      for (const s of [0, len]) cylinder(P, frame(cv(s, 0, 0), Z), rr, hb * 2, 150, false);
      P.push([220, () => cv(rn(0, len), rr, rn(-hb, hb))], [110, () => cv(rn(0, len), -rr, rn(-hb, hb))]);
      P.push([380, () => { const s = (Math.floor(R() * 18) + 0.5) * len / 18; return jit(cv(s, rr, rn(-hb, hb))); }]);
      for (const z of [-0.2, 0.2]) line(P, [cv(-0.03, -0.07, z), cv(len + 0.03, -0.07, z), cv(len + 0.03, 0.07, z), cv(-0.03, 0.07, z)], 110, true);
      const c0 = 0.12, c1 = len + 0.06, hc = 0.24, co = 0.14;
      line(P, [cv(c0, co, -hc), cv(c1, co, -hc), cv(c1, co, hc), cv(c0, co, hc)], 300, true);
      P.push([520, () => cv(rn(c0, c1), co, rn(-hc, hc))]);
      for (const s of [0.3, 0.62]) for (const z of [-0.2, 0.2]) { const top = cv(s, -0.07, z); P.push([45, seg([top[0], 0, z], top)]); }
      // Bucket at the rear under the top of the belt: an open, tapered box.
      const T = [[-0.8, 0.44, -0.2], [-0.4, 0.44, -0.2], [-0.4, 0.44, 0.2], [-0.8, 0.44, 0.2]];
      const Bt = [[-0.72, 0.12, -0.14], [-0.48, 0.12, -0.14], [-0.48, 0.12, 0.14], [-0.72, 0.12, 0.14]];
      line(P, T, 260, true); line(P, Bt, 200, true);
      for (let k = 0; k < 4; k++) P.push([80, seg(T[k], Bt[k])]);
      const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      P.push([380, () => { const k = (R() * 4) | 0, h = R(), t = R(); return lerp(lerp(T[k], T[(k + 1) % 4], t), lerp(Bt[k], Bt[(k + 1) % 4], t), h); }]);
      // Bucket arms reaching back, with the rollers that meet the base station.
      for (const s of [-1, 1]) {
        const a = [-0.5, 0.22, s * 0.25], b = [-1.06, 0.46, s * 0.25];
        box(P, mid(a, b), sub(b, a), dist(a, b) / 2, 0.025, 0.02, 200);
        cylinder(P, frame(b, Z), 0.06, 0.05, 110, true);
      }
      // Battery pack beside the belt supports.
      box(P, [-0.22, 0.06, -0.29], [1, 0, 0], 0.14, 0.05, 0.055, 220);
      return assemble(P);
    }

    // The servo driver: its SG90 hobby servo with the horn, wired to the NE555 timer that drives it,
    // under the pulse train the timer makes, drawn at the measured 13.9% duty cycle.
    function servo() {
      const P = [], S = [], Y = [0, 1, 0];
      // SG90 proportions: a body about 23 by 12 by 22.5 mm, tabs two-thirds up that make it about
      // 32 mm long, and the output shaft over a round boss at one end, beside a smaller bump.
      const sc = [0.32, -0.28, 0], bh = 0.39, bw = 0.21, top = sc[1] + bh;
      box(S, sc, [1, 0, 0], 0.4, bh, bw, 1700);
      // Its edges again, so the case reads on light pages too.
      const E = [];
      for (let k = 0; k < 8; k++) E.push([sc[0] + (k & 4 ? 0.4 : -0.4), sc[1] + (k & 2 ? bh : -bh), sc[2] + (k & 1 ? bw : -bw)]);
      for (let k = 0; k < 8; k++) for (const bit of [1, 2, 4]) if (!(k & bit)) S.push([300 * dist(E[k], E[k | bit]), seg(E[k], E[k | bit])]);
      for (const s of [-1, 1]) {
        box(S, [sc[0] + s * 0.48, sc[1] + 0.18, 0], [1, 0, 0], 0.08, 0.04, bw, 240);
        S.push([45, ring(frame([sc[0] + s * 0.5, sc[1] + 0.221, 0], Y), 0.035, 0)]);
      }
      const hc = [sc[0] + 0.19, top, 0];
      cylinder(S, frame([hc[0], top + 0.05, 0], Y), bw, 0.1, 420, true);
      cylinder(S, frame([hc[0] - 0.22, top + 0.035, 0], Y), 0.08, 0.07, 130, true);
      cylinder(S, frame([hc[0], top + 0.15, 0], Y), 0.075, 0.1, 120, true);
      // Horn: a tapered arm lying flat on the shaft, with its row of holes.
      const th = Math.PI - 0.45, hd = [Math.cos(th), 0, Math.sin(th)], hp = [-hd[2], 0, hd[0]], HL = 0.6, hy = top + 0.215;
      const hpt = (a, b, y) => [hc[0] + hd[0] * a + hp[0] * b, y, hc[2] + hd[2] * a + hp[2] * b];
      const half = a => 0.085 - 0.04 * a / HL;
      S.push([300, () => { const a = rn(0, HL), b = rn(-1, 1) * half(a); return hpt(a, b, hy); }]);
      S.push([260, () => { const a = rn(0, HL), s = sgn(); return jit(hpt(a, s * half(a), hy + (R() < 0.5 ? 0.015 : -0.015))); }]);
      S.push([60, () => { const t = (R() - 0.5) * Math.PI; return jit(hpt(HL + Math.cos(t) * half(HL), Math.sin(t) * half(HL), hy)); }]);
      S.push([120, ring(frame([hc[0], hy, 0], Y), 0.1, 0)]);
      for (const a of [0.22, 0.32, 0.42, 0.5]) S.push([24, ring(frame(hpt(a, 0, hy + 0.016), Y), 0.016, 0)]);
      // Tip the servo's top toward the viewer, so the horn reads from the page's low camera.
      const ct = Math.cos(0.6), st = Math.sin(0.6);
      const tip = q => { const y = q[1] - sc[1], z = q[2] - sc[2]; return [q[0], sc[1] + y * ct - z * st, sc[2] + y * st + z * ct]; };
      for (const [w, f] of S) P.push([w, () => tip(f())]);
      // NE555 in its eight-pin package, notch toward the back, with pins bent down to the bench.
      const cc = [-0.62, -0.6, 0.22];
      box(P, cc, [1, 0, 0], 0.2, 0.045, 0.12, 760);
      for (const s of [-1, 1]) for (const x of [-0.15, -0.05, 0.05, 0.15]) {
        const a = [cc[0] + x, cc[1], cc[2] + s * 0.12], b = [cc[0] + x, cc[1], cc[2] + s * 0.16], c = [cc[0] + x, cc[1] - 0.12, cc[2] + s * 0.16];
        P.push([14, seg(a, b)], [22, seg(b, c)]);
      }
      P.push([40, () => { const t = R() * Math.PI - Math.PI / 2; return jit([cc[0] - 0.2 + Math.cos(t) * 0.035, cc[1] + 0.046, cc[2] + Math.sin(t) * 0.035]); }]);
      // The servo's three-wire lead, from the end of its body to the timer.
      for (const z of [-0.035, 0, 0.035]) {
        const p0 = tip([sc[0] - 0.4, sc[1] - 0.22, z]), p1 = [sc[0] - 0.7, sc[1] - 0.22, z + 0.05], p2 = [cc[0] + 0.45, cc[1] + 0.02, cc[2] - 0.05], p3 = [cc[0] + 0.2, cc[1] + 0.02, cc[2] + z];
        P.push([130, () => {
          const t = R(), u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
          return jit([a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + e * p3[2]]);
        }]);
      }
      // Pulse train behind, like the scope trace: three periods at the measured 13.9% duty.
      const x0 = -1.02, per = 0.62, lo = 0.36, hi = 0.66, zt = -0.3, wav = [[x0, lo, zt]];
      for (let k = 0; k < 3; k++) {
        const xs = x0 + 0.2 + k * per, xe = xs + per * 0.139;
        wav.push([xs, lo, zt], [xs, hi, zt], [xe, hi, zt], [xe, lo, zt]);
      }
      wav.push([x0 + 0.2 + 3 * per, lo, zt]);
      line(P, wav, 620, false);
      return assemble(P);
    }

    return [arm(), boltNut(), gear(), ball(), sorter(), servo()];
  }

  /* The NBA project's own dashboard: a screen tracing a real game's win-probability curve
     (curve: [[t, p], ...], both from 0 to 1), with its 50% line and quarter marks, on a stand,
     with a ball in front. */
  function makeDashboard(N, curve) {
    const { R, TAU, rn, jit, frame, ring, seg, sphere, dist, assemble } = kit(N, 4242);
    const P = [], W = 1.0, H = 0.6, D = 0.05;
    const X = t => (t * 2 - 1) * W * 0.86, Yp = p => (p * 2 - 1) * H * 0.78;
    // The screen: a faint face, a strong rim and a thin edge for depth.
    P.push([700, () => [rn(-W, W), rn(-H, H), -D]]);
    const rim = [[-W, -H], [W, -H], [W, H], [-W, H]];
    for (let k = 0; k < 4; k++) {
      const a = rim[k], b = rim[(k + 1) % 4], len = dist([a[0], a[1], 0], [b[0], b[1], 0]);
      P.push([300 * len, seg([a[0], a[1], 0], [b[0], b[1], 0])], [120 * len, seg([a[0], a[1], -2 * D], [b[0], b[1], -2 * D])]);
    }
    // The curve itself, sampled evenly along its length.
    for (let k = 1; k < curve.length; k++) {
      const a = [X(curve[k - 1][0]), Yp(curve[k - 1][1]), 0.03], b = [X(curve[k][0]), Yp(curve[k][1]), 0.03];
      P.push([2600 * dist(a, b), seg(a, b)]);
    }
    // 50% line and quarter marks, dashed and faint.
    const dash = (a, b, w) => P.push([w, () => {
      for (;;) {
        const s = R(), d = dist(a, b) * s / 0.06;
        if (d - Math.floor(d) < 0.5) return jit([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2]]);
      }
    }]);
    dash([X(0), Yp(0.5), 0.02], [X(1), Yp(0.5), 0.02], 260);
    for (const q of [0.25, 0.5, 0.75]) dash([X(q), Yp(0), 0.02], [X(q), Yp(1), 0.02], 110);
    // Stand: a neck and a foot.
    P.push([260, seg([0, -H, -D], [0, -H - 0.28, -D])], [220, ring(frame([0, -H - 0.3, -D], [0, 1, 0]), 0.3, 0)]);
    // A ball in front of the lower left corner, below the curve, with its seams.
    const c = [-W * 0.98, -H * 1.3, 0.4], r = 0.28;
    P.push([1500, sphere(c, r)]);
    for (const n of [[0, 1, 0], [1, 0, 0], [0.6, 0, 0.8]]) P.push([180, ring(frame(c, n), r * 1.01, 0)]);
    return assemble(P);
  }

  // A wide, loose field of points that sits behind text-heavy sections.
  function makeDust(N) {
    const R = mulberry(77), out = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      out[i * 3] = (R() * 2 - 1) * 2.6;
      out[i * 3 + 1] = (R() * 2 - 1) * 1.5;
      out[i * 3 + 2] = (R() * 2 - 1) * 1.2;
    }
    return out;
  }

  // Particle lettering: samples text drawn in the page's display font, weighted
  // toward the letter edges so the shapes read crisply.
  function makeText(N, lines, family) {
    const W = 2400, H = 900, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    let size = 320;
    g.font = '600 ' + size + 'px ' + family;
    const widest = Math.max.apply(null, lines.map(l => g.measureText(l).width));
    size = Math.floor(size * Math.min(1, W * 0.9 / widest, H * 0.9 / (lines.length * size * 0.95)));
    g.font = '600 ' + size + 'px ' + family;
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 0.95));
    const px = g.getImageData(0, 0, W, H).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && px[(y * W + x) * 4 + 3] > 127;
    const fill = [], edge = [];
    let x0 = W, x1 = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (!on(x, y)) continue;
      (on(x - 3, y) && on(x + 3, y) && on(x, y - 3) && on(x, y + 3) ? fill : edge).push(x, y);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
    }
    const R = mulberry(31), out = new Float32Array(N * 3), S = (x1 - x0) / 2.8 || 1;
    for (let i = 0; i < N; i++) {
      const src = (R() < 0.45 && edge.length) || !fill.length ? edge : fill;
      const k = ((R() * src.length / 2) | 0) * 2;
      out[i * 3] = (src[k] - W / 2 + (R() - 0.5) * 2) / S;
      out[i * 3 + 1] = -(src[k + 1] - H / 2 + (R() - 0.5) * 2) / S;
      out[i * 3 + 2] = (R() - 0.5) * 0.06;
    }
    return out;
  }

  const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aFrom;
layout(location=1) in vec3 aTo;
layout(location=2) in vec4 aRand;
layout(location=3) in vec3 aDir;
layout(location=4) in vec3 aPrev;
uniform float uMorph, uTime, uFocal, uAspect, uCam, uSize, uScale, uPush, uFlat, uBlend;
uniform vec2 uCenter, uMouse, uVel;
uniform vec3 uRip;
uniform mat3 uRot;
out float vA;
out float vB;
void main(){
  // Solid shapes assemble bottom to top with a burst; flat figures redraw left to right and stay crisp.
  float delay = mix(clamp(aFrom.y * 0.5 + 0.5, 0.0, 1.0) * 0.32 + aRand.x * 0.13,
                    clamp(aFrom.x * 0.31 + 0.5, 0.0, 1.0) * 0.42 + aRand.x * 0.06, uFlat);
  float t = clamp((uMorph - delay) / 0.95, 0.0, 1.0);
  float f = 2.0 - 2.0 * t;
  float e = t < 0.5 ? 4.0 * t * t * t : 1.0 - f * f * f * 0.5;
  vec3 p = mix(aFrom, aTo, e) + aDir * sin(3.14159265 * e) * mix(0.16, 0.02, uFlat);
  // After a hand-over the points ease in from where they were, so nothing jumps.
  p = mix(p, aPrev, uBlend) + aDir * sin(uTime * 0.8 + aRand.w) * 0.006;
  vec3 q = p * uRot;
  float d = uCam - q.z;
  // Points the camera has flown past are dropped.
  if (d < 0.12) { vA = 0.0; vB = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec2 n = vec2(q.x * uFocal / uAspect, q.y * uFocal) / d * uScale + uCenter;
  vec2 asp = vec2(uAspect, 1.0);
  // Cursor: points near it are pushed away and dragged along with its motion.
  vec2 dm = (n - uMouse) * asp;
  float r = length(dm);
  float k = uPush * pow(max(0.0, 1.0 - r / 0.3), 2.0);
  vec2 away = r > 1e-4 ? dm / r : vec2(0.0);
  n += (away * 0.085 * k + uVel * 0.045 * k) / asp;
  // Click: a ring that travels outward and fades.
  vec2 dr = (n - uRip.xy) * asp;
  float rr = length(dr);
  float g = (rr - uRip.z * 1.15) / 0.07;
  float w = exp(-g * g) * exp(-uRip.z * 1.5);
  n += (rr > 1e-4 ? dr / rr : vec2(0.0)) * 0.05 * w / asp;
  gl_Position = vec4(n, 0.0, 1.0);
  float depth = clamp(q.z * 0.5 + 0.5, 0.0, 1.0);
  vA = mix(0.32, 1.0, depth * depth * (3.0 - 2.0 * depth)) * (1.0 + w * 1.6 + k * 0.7) * smoothstep(0.12, 0.7, d);
  vB = aRand.z;
  gl_PointSize = min(26.0, uSize * aRand.y * (4.2 / d) * (1.0 + aRand.z * 0.7) * mix(1.0, uScale, 0.6));
}`;

  const FS = `#version 300 es
precision highp float;
in float vA;
in float vB;
uniform vec3 uAccent, uInk;
uniform float uFade;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = min(1.0, exp(-r2 * 2.6) * vA * uFade * (0.8 + vB * 0.6) * 1.5);
  o = vec4(mix(uAccent, uInk, vB), a);
}`;

  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  function program(gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const pr = gl.createProgram();
    gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    return gl.getProgramParameter(pr, gl.LINK_STATUS) ? pr : null;
  }

  function create(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) { canvas.hidden = true; return null; }

    const N = 9000, CAM = 4.2, SPIN = 0.22;
    // Built-in shapes: arm, bolt, gear, ball, sorter, servo, then dust; added shapes follow.
    const shapes = makeShapes(N), DUST = shapes.push(makeDust(N)) - 1;
    const from = new Float32Array(N * 3), to = new Float32Array(N * 3), cur = new Float32Array(N * 3), prev = new Float32Array(N * 3);
    const rand = new Float32Array(N * 4), dir = new Float32Array(N * 3), rot = new Float32Array(9);
    const rnd = mulberry(4242);
    for (let i = 0; i < N; i++) {
      rand[i * 4] = rnd();
      rand[i * 4 + 1] = 0.55 + 0.95 * rnd() * rnd();
      rand[i * 4 + 2] = rnd() < 0.045 ? 1 : 0;
      rand[i * 4 + 3] = rnd() * TAU;
      const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - z * z);
      dir[i * 3] = s * Math.cos(a); dir[i * 3 + 1] = z; dir[i * 3 + 2] = s * Math.sin(a);
      // Opening state: a loose ball that assembles into the first shape.
      const rr = 0.25 + 0.75 * Math.cbrt(rnd()), z2 = rnd() * 2 - 1, a2 = rnd() * TAU, s2 = Math.sqrt(1 - z2 * z2);
      from[i * 3] = rr * s2 * Math.cos(a2) * 1.1; from[i * 3 + 1] = rr * z2 * 0.9; from[i * 3 + 2] = rr * s2 * Math.sin(a2) * 1.1;
    }

    // GPU state lives in G so it can be rebuilt after the browser drops the context.
    function initGL() {
      const pr = program(gl);
      if (!pr) return null;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = (loc, size, data, usage) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, usage);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return b;
      };
      const bFrom = buf(0, 3, from, gl.DYNAMIC_DRAW), bTo = buf(1, 3, to, gl.DYNAMIC_DRAW);
      buf(2, 4, rand, gl.STATIC_DRAW); buf(3, 3, dir, gl.STATIC_DRAW);
      const bPrev = buf(4, 3, prev, gl.DYNAMIC_DRAW);
      const U = {};
      ['uMorph', 'uTime', 'uFocal', 'uAspect', 'uCam', 'uSize', 'uScale', 'uPush', 'uFlat', 'uBlend', 'uCenter', 'uMouse', 'uVel', 'uRip', 'uRot', 'uAccent', 'uInk', 'uFade']
        .forEach(n => { U[n] = gl.getUniformLocation(pr, n); });
      const css = getComputedStyle(canvas);
      gl.useProgram(pr);
      gl.uniform3fv(U.uAccent, hexToRgb(css.getPropertyValue('--cloud-base').trim() || '#E8DCDA'));
      gl.uniform3fv(U.uInk, hexToRgb(css.getPropertyValue('--cloud-hi').trim() || '#E9C46A'));
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      // Added light on dark pages; ordinary alpha (ink) on light ones.
      if (css.getPropertyValue('--cloud-blend').trim() === 'normal') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      gl.clearColor(0, 0, 0, 0);
      return { pr, vao, bFrom, bTo, bPrev, U };
    }
    let G = initGL();
    if (!G) { canvas.hidden = true; return null; }

    // Scene state
    let RM = mqReduce.matches, idx = -1, morphT = 99, time = 0, yaw = -0.4, tiltX = 0, tiltY = 0, fade = 0;
    // seen: the canvas is on screen; drawing pauses while it is not.
    let W = 0, H = 0, dpr = 1, raf = 0, last = 0, lost = false, seen = true;
    const place = { x: 0.5, y: 0, s: 0.8, a: 1, cam: CAM, flat: 0 }, goal = Object.assign({}, place);
    const flatShapes = new Set([DUST]);
    let scrubbing = false, morphGoal = 0, pair = '';
    // flat: this morph runs between two flat figures. blend: how much of the hand-over is left (1 to 0).
    // shown: the shape the points are at or heading to.
    let flat = 0, blend = 0, shown = -1;
    const figure = k => flatShapes.has(k) && k !== DUST;
    const ms = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, push: 0, on: false };
    const rip = { x: 0, y: 0, t: 99 };

    function upload() {
      gl.bindBuffer(gl.ARRAY_BUFFER, G.bFrom); gl.bufferSubData(gl.ARRAY_BUFFER, 0, from);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.bTo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, to);
      gl.bindBuffer(gl.ARRAY_BUFFER, G.bPrev); gl.bufferSubData(gl.ARRAY_BUFFER, 0, prev);
    }
    // CPU copy of the shader's morph, so a new morph can start from mid-flight.
    function computeCurrent() {
      for (let i = 0; i < N; i++) {
        const j = i * 3, r = rand[i * 4];
        const delay = flat ? clamp(from[j] * 0.31 + 0.5, 0, 1) * 0.42 + r * 0.06 : clamp(from[j + 1] * 0.5 + 0.5, 0, 1) * 0.32 + r * 0.13;
        const t = clamp((morphT - delay) / 0.95, 0, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
        const s = Math.sin(Math.PI * e) * (flat ? 0.02 : 0.16);
        for (let a = 0; a < 3; a++) {
          const v = from[j + a] + (to[j + a] - from[j + a]) * e + dir[j + a] * s;
          cur[j + a] = v + (prev[j + a] - v) * blend;
        }
      }
    }
    // Turns the target shape so it arrives three-quarter on to the viewer.
    function aim(src, ang) {
      const c = Math.cos(ang), s = Math.sin(ang);
      for (let i = 0; i < N * 3; i += 3) {
        const x = src[i], z = src[i + 2];
        to[i] = c * x + s * z; to[i + 1] = src[i + 1]; to[i + 2] = -s * x + c * z;
      }
    }
    function rotRows(yw, pt) {
      const c = Math.cos(yw), s = Math.sin(yw), cb = Math.cos(pt), sb = Math.sin(pt);
      rot[0] = c; rot[1] = 0; rot[2] = s;
      rot[3] = sb * s; rot[4] = cb; rot[5] = -sb * c;
      rot[6] = -cb * s; rot[7] = sb; rot[8] = cb * c;
      return rot;
    }

    function render() {
      if (!W || lost) return;
      const aspect = W / H, fit = Math.min(1, aspect / 1.25);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const U = G.U;
      gl.useProgram(G.pr);
      gl.bindVertexArray(G.vao);
      gl.uniform1f(U.uMorph, morphT);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uFocal, 0.92 * Math.sqrt(CAM * CAM - 1));
      gl.uniform1f(U.uAspect, aspect);
      gl.uniform1f(U.uCam, place.cam);
      gl.uniform1f(U.uSize, 3.2 * clamp(H / 820, 0.75, 1.25) * dpr);
      gl.uniform1f(U.uScale, place.s * fit);
      gl.uniform1f(U.uPush, ms.push);
      gl.uniform1f(U.uFlat, flat);
      gl.uniform1f(U.uBlend, blend);
      gl.uniform2f(U.uCenter, place.x, place.y);
      gl.uniform2f(U.uMouse, ms.x, ms.y);
      gl.uniform2f(U.uVel, ms.vx, ms.vy);
      gl.uniform3f(U.uRip, rip.x, rip.y, rip.t);
      gl.uniform1f(U.uFade, fade * place.a);
      const fl = place.flat;
      gl.uniformMatrix3fv(U.uRot, false, rotRows(yaw + tiltX * 0.35 * (1 - 0.6 * fl), 0.28 * (1 - fl) - tiltY * 0.14 * (1 - 0.5 * fl)));
      gl.drawArrays(gl.POINTS, 0, N);
    }

    function frame(now) {
      raf = 0;
      if (document.hidden || lost || !seen) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      time += dt;
      if (scrubbing) morphT += (morphGoal - morphT) * (RM ? 1 : 1 - Math.exp(-dt * 7));
      else morphT = Math.min(99, morphT + dt);
      if (blend) { blend *= Math.exp(-dt * 6); if (RM || blend < 0.002) blend = 0; }
      fade = RM ? 1 : Math.min(1, fade + dt / 1.2);
      rip.t = Math.min(99, rip.t + dt);
      const kp = RM ? 1 : 1 - Math.exp(-dt * 5);
      for (const key of ['x', 'y', 's', 'a', 'cam', 'flat']) place[key] += (goal[key] - place[key]) * kp;
      // Shapes sway gently so they stay three-quarter on (still with reduced motion); flat shapes and lettering settle face-on.
      yaw = (RM ? -0.4 : Math.sin(time * SPIN) * 0.6) * (1 - place.flat);
      if (!RM) {
        const km = 1 - Math.exp(-dt * 14), kv = 1 - Math.exp(-dt * 10);
        const nx = ms.x + (ms.tx - ms.x) * km, ny = ms.y + (ms.ty - ms.y) * km;
        if (dt > 0) {
          ms.vx += (clamp((nx - ms.x) / dt, -4, 4) - ms.vx) * kv;
          ms.vy += (clamp((ny - ms.y) / dt, -4, 4) - ms.vy) * kv;
        }
        ms.x = nx; ms.y = ny;
        ms.push += ((ms.on ? 1 : 0) - ms.push) * (1 - Math.exp(-dt * 5));
        const kt = 1 - Math.exp(-dt * 2.5);
        tiltX += ((ms.on ? ms.tx : 0) - tiltX) * kt;
        tiltY += ((ms.on ? ms.ty : 0) - tiltY) * kt;
      }
      render();
      if (!RM || Math.abs(morphGoal - morphT) > 1e-3 || blend) raf = requestAnimationFrame(frame);
    }
    function wake() {
      if (raf || document.hidden || lost || !seen) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      W = w; H = h; dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      render();
    }

    // Time-driven morph to shape k, starting from wherever the points are now.
    function setShape(k) {
      if (k === idx || !(k >= 0 && k < shapes.length)) return;
      if (idx !== -1) { computeCurrent(); from.set(cur); }
      blend = 0;
      flat = figure(shown) && figure(k) ? 1 : 0;
      idx = k; shown = k; scrubbing = false; pair = '';
      aim(shapes[k], flatShapes.has(k) ? 0 : -0.45);
      if (RM) { from.set(to); morphT = 99; } else morphT = 0;
      upload();
      wake();
    }
    // Scroll-driven morph: m runs 0 to 1 as the page scrolls from shape a to shape b.
    function scrub(a, b, m) {
      m = clamp(m, 0, 1);
      if (RM) m = m < 0.5 ? 0 : 1;
      const key = a + '>' + b;
      if (key !== pair) {
        // Hand over from wherever the points are now, so a fast scroll never makes them jump.
        if (idx !== -1 && !RM) { computeCurrent(); prev.set(cur); blend = 1; } else blend = 0;
        flat = figure(a) && figure(b) ? 1 : 0;
        pair = key;
        aim(shapes[a], flatShapes.has(a) ? 0 : -0.45); from.set(to);
        aim(shapes[b], flatShapes.has(b) ? 0 : -0.45);
        upload();
        morphT = m * 1.45;
      }
      scrubbing = true; idx = -2; shown = m < 0.5 ? a : b;
      morphGoal = m * 1.45;
      wake();
    }
    // Eases toward place p; with jump, goes there at once (the first frame on a page).
    function setPlace(p, jump) {
      Object.assign(goal, p);
      if (RM || jump) Object.assign(place, goal);
      wake();
    }

    // Input: the cursor is tracked in the canvas's clip space, which is what the shader uses,
    // and only while it is over the canvas. Returns null outside it.
    function toClip(e) {
      if (!seen) return null;
      const r = canvas.getBoundingClientRect();
      if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
      return [(e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2];
    }
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const p = toClip(e);
      if (!p) { ms.on = false; return; }
      ms.tx = p[0]; ms.ty = p[1];
      if (!ms.on) { ms.on = true; ms.x = ms.tx; ms.y = ms.ty; }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { ms.on = false; });
    addEventListener('blur', () => { ms.on = false; });
    addEventListener('pointerdown', e => {
      const p = RM || e.button > 0 ? null : toClip(e);
      if (!p) return;
      rip.x = p[0]; rip.y = p[1]; rip.t = 0;
    }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; wake(); }).observe(canvas);
    }

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else addEventListener('resize', resize);
    document.addEventListener('visibilitychange', wake);
    const onReduce = () => {
      RM = mqReduce.matches;
      if (RM) { from.set(to); morphT = 99; blend = 0; ms.push = 0; rip.t = 99; Object.assign(place, goal); upload(); }
      wake();
    };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduce);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; raf = 0; });
    canvas.addEventListener('webglcontextrestored', () => {
      G = initGL();
      lost = !G;
      if (G) { upload(); resize(); wake(); } else canvas.hidden = true;
    });

    resize();
    requestAnimationFrame(() => canvas.classList.add('on'));
    // Adds a lettering shape and returns its index for setShape and scrub.
    function addText(lines, family) {
      shapes.push(makeText(N, lines, family));
      flatShapes.add(shapes.length - 1);
      return shapes.length - 1;
    }
    // Adds a shape from N points (x, y, z in a roughly unit-sized space) and returns its index.
    // Passing the index k of a shape added earlier replaces that shape instead.
    function addShape(points, flat, k) {
      if (!points || points.length !== N * 3) throw new Error('addShape needs exactly ' + N + ' points (' + N * 3 + ' numbers)');
      const a = points instanceof Float32Array ? points : new Float32Array(points);
      if (k > DUST && k < shapes.length) { shapes[k] = a; pair = ''; } else { shapes.push(a); k = shapes.length - 1; }
      if (flat) flatShapes.add(k); else flatShapes.delete(k);
      reaches[k] = 0;
      return k;
    }
    // How far shape k reaches from its upright axis: the widest it can get as it sways.
    const reaches = [];
    function reach(k) {
      const s = shapes[k];
      if (!s) return 0;
      if (!reaches[k]) {
        let m = 0;
        for (let i = 0; i < s.length; i += 3) m = Math.max(m, Math.hypot(s[i], s[i + 2]));
        reaches[k] = m;
      }
      return reaches[k];
    }
    // Adds the NBA dashboard drawn from a real game's curve and returns its index.
    const addDashboard = curve => addShape(makeDashboard(N, curve), false);
    return { setShape, setPlace, scrub, addText, addShape, addDashboard, reach, count: N };
  }

  window.Cloud = { create };
})();
