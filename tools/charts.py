"""Draw the case-study charts as SVG in the site's style, from the data in content/data/.

    python3 tools/charts.py               redraw content/figures/*.svg
    python3 tools/charts.py --arm DIR     first re-export the arm data from the simulator in DIR
                                          (the Robotic Arm repo's sim/ folder; needs numpy and scipy)
    python3 tools/charts.py --drives DIR  first re-read the ODESC backups in DIR (the Robotic Arm repo's drives/)
    python3 tools/charts.py --gear DIR    first rerun the gear models on the course CSVs in DIR
                                          (the DS 3000 project's Code folder; needs numpy, pandas, scikit-learn)

The SVGs carry classes, not colours: site.css colours them with the page's tokens, so each
chart takes its project's colour. build.py writes them into the page, so text stays text.
"""
import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'content' / 'data'
FIGS = ROOT / 'content' / 'figures'
MINUS = '−'


# Data

def export_arm(sim):
    """Step response and gravity sag per joint, exactly as the simulator's control analysis computes them."""
    import os
    import numpy as np
    from scipy import signal
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(sim))
    from arm_sim.config import load
    from arm_sim.control import analyze_joints, validate
    here = os.getcwd()
    os.chdir(sim)
    try:
        arm = load()
        rows = validate(arm, analyze_joints(arm, 400))
    finally:
        os.chdir(here)

    def thin(t, ys, n):
        i = np.unique(np.linspace(0, len(t) - 1, n).round().astype(int))
        return [np.round(np.asarray(v)[i], 4).tolist() for v in [t] + ys]

    t_sag = np.linspace(0, 20, 4000)
    joints = []
    for r in rows:
        st = r['step']
        t, lin, ideal, hall = thin(st['t'], [st['linear'], st['ideal'], st['hall']], 300)
        j = {'name': r['joint'], 'step': {'t': t, 'linear': lin, 'ideal': ideal, 'hall': hall}}
        if r['grav_max_Nm'] >= 1e-6:
            _, y = signal.step(signal.lti(*r['max']['model'].S_dist), T=t_sag)
            sag = -y * r['grav_max_Nm'] / r['N'] * 360 / r['N']
            # Dense where the joint drops, sparse along the slow recovery.
            idx = np.unique(np.concatenate([np.arange(0, 400, 2), np.linspace(400, len(t_sag) - 1, 160).round().astype(int)]))
            j['sag'] = {'t': np.round(t_sag[idx], 4).tolist(), 'deg': np.round(sag[idx], 4).tolist()}
        joints.append(j)
    out = {'source': 'Exported from the arm simulator (Robotic Arm/sim, arm_sim control analysis, '
                     '400 poses, seed 0) by tools/charts.py.', 'joints': joints}
    (DATA / 'arm-control.json').write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')


def export_drives(src):
    """Each drive's motor, calibration and tuning from the newest ODESC backup per board in src
    (the Robotic Arm repo's drives/ folder): what the six joints actually run with."""
    import glob
    newest = {}
    for f in sorted(glob.glob(str(src / 'odesc-*-*.json'))):
        serial = Path(f).name.split('-')[1]
        newest[serial] = f
    rows = []
    for serial, f in newest.items():
        a = json.loads(Path(f).read_text(encoding='utf-8'))['axis0']
        m, c = a['motor']['config'], a['controller']['config']
        kt = m['torque_constant']
        rows.append({'node': a['config']['can']['node_id'], 'motor': 'REV NEO' if kt > 0.015 else 'NEO 550',
                     'current_A': m['current_lim'], 'R_mohm': round(m['phase_resistance'] * 1000, 1),
                     'L_uH': round(m['phase_inductance'] * 1e6, 2), 'kt': round(kt, 4), 'cpr': a['encoder']['config']['cpr'],
                     'pos_gain': round(c['pos_gain'], 2), 'vel_gain': round(c['vel_gain'], 4), 'vel_int': round(c['vel_integrator_gain'], 4),
                     'traj': [a['trap_traj']['config']['vel_limit'], a['trap_traj']['config']['accel_limit']], 'file': Path(f).name})
    rows.sort(key=lambda r: r['node'])
    out = {'source': 'Exported from the ODESC configuration backups (Robotic Arm/drives) by tools/charts.py --drives.', 'drives': rows}
    (DATA / 'arm-drives.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
    print('drives:', [(r['node'], r['motor'], r['R_mohm']) for r in rows])


GEAR_FILES = [('No fault', 'no_fault.csv'), ('Eccentricity', 'eccentricity.csv'), ('Missing tooth', 'missing_tooth.csv'),
              ('Root crack', 'root_crack.csv'), ('Surface defect', 'surface_fault.csv'), ('Chipped tooth', 'tooth_chipped_fault.csv')]


def export_gear(src):
    """Rerun the DS 3000 notebook's classical pipeline on the course CSVs in src: the same 1024-sample
    windows, stratified 70/15/15 split (seed 42), 14 features, scaler and KNN (k = 5), which
    reproduces its 97.7% test accuracy exactly. Writes the confusion matrix, one test window per
    condition for the figure, two feature checks, and every test window for the demo."""
    import numpy as np
    import pandas as pd
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import StandardScaler
    from sklearn.neighbors import KNeighborsClassifier
    W, FS = 1024, 5000
    X, y, op = [], [], []
    for k, (_, fname) in enumerate(GEAR_FILES):
        d = pd.read_csv(src / fname).sort_values('time_x').reset_index(drop=True)
        s, sp, ld = d[['sensor1', 'sensor2']].values, d['speedSet'].values, d['load_value'].values
        for a in range(0, len(d) - W + 1, W):
            X.append(s[a:a + W]); y.append(k); op.append((float(sp[a]), int(ld[a])))
    X, y = np.array(X), np.array(y)
    names = [n for n, _ in GEAR_FILES]
    # The notebook encodes labels alphabetically; the split only needs the same grouping, which
    # stratifying on any one-to-one relabelling gives, but keep its order so the split matches.
    alpha = {n: i for i, n in enumerate(sorted(['No fault', 'eccentricity', 'missing tooth', 'Root crack', 'surface defect', 'chipped tooth']))}
    raw = ['No fault', 'eccentricity', 'missing tooth', 'Root crack', 'surface defect', 'chipped tooth']
    ya = np.array([alpha[raw[k]] for k in y])
    idx = np.arange(len(X))
    itr, itmp, _, ytmp = train_test_split(idx, ya, test_size=0.30, random_state=42, stratify=ya)
    _, ite = train_test_split(itmp, test_size=0.50, random_state=42, stratify=ytmp)

    def notebook(w):
        out = []
        for s in (w[:, 0], w[:, 1]):
            f = np.abs(np.fft.rfft(s))
            i = int(np.argmax(f))
            out += [s.mean(), s.std(), s.min(), s.max(), np.sqrt(np.mean(s * s)), i, f[i]]
        return [out[0], out[1], out[2], out[3], out[4], out[7], out[8], out[9], out[10], out[11], out[5], out[6], out[12], out[13]]

    def offset_free(w):
        out = []
        for s in (w[:, 0], w[:, 1]):
            z = s - s.mean()
            f = np.abs(np.fft.rfft(z))
            i = int(np.argmax(f[1:])) + 1
            out += [z.std(), z.max() - z.min(), np.mean((z / z.std()) ** 4), i * FS / W, f[i]]
        return out

    # Trained on the notebook's labels, because KNN breaks tied votes by label order; results come
    # back in this file's condition order.
    back, cols6 = {alpha[raw[k]]: k for k in range(6)}, [alpha[raw[k]] for k in range(6)]

    def knn(F, cols=None):
        F = F if cols is None else F[:, cols]
        sc = StandardScaler().fit(F[itr])
        m = KNeighborsClassifier(n_neighbors=5).fit(sc.transform(F[itr]), ya[itr])
        T = sc.transform(F[ite])
        return np.array([back[v] for v in m.predict(T)]), m.predict_proba(T)[:, cols6]

    F = np.array([notebook(w) for w in X])
    pred, prob = knn(F)
    cm = np.zeros((6, 6), int)
    for a, b in zip(y[ite], pred):
        cm[a, b] += 1
    acc = lambda p: round(float((p == y[ite]).mean()), 4)
    order = sorted(ite, key=lambda i: (y[i], i))
    # One correctly classified test window per condition, all at the same speed setting and load.
    common = sorted(set.intersection(*[{op[i] for i in ite if y[i] == k} for k in range(6)]), reverse=True)[0]
    pick = {k: next(i for i in order if y[i] == k and op[i] == common and pred[list(ite).index(i)] == k) for k in range(6)}

    def env(s, n):
        z = (s - s.mean()) * 1000
        return [v for b in np.array_split(z, n) for v in (round(float(b.min()), 1), round(float(b.max()), 1))]

    out = {'source': 'Rerun of the DS 3000 notebook pipeline on the course CSVs by tools/charts.py --gear.',
           'classes': names, 'fs': FS, 'window': W, 'windows': len(X), 'split': [len(itr), len(itmp) - len(ite), len(ite)],
           'accuracy': acc(pred), 'confusion': cm.tolist(),
           'checks': {'dominant_bin_is_dc': bool((F[:, 10] == 0).all() and (F[:, 12] == 0).all()),
                      'mean_level_only': acc(knn(F, [0, 5])[0]),
                      'offset_free': acc(knn(np.array([offset_free(w) for w in X]))[0])},
           'examples': {'speedSet': common[0], 'load': common[1],
                        'traces': [env(X[pick[k]][:, 0], 160) for k in range(6)]}}
    (DATA / 'gear-results.json').write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    pos = {i: j for j, i in enumerate(ite)}
    demo = {'source': out['source'], 'classes': names, 'ms': W / FS * 1000, 'k': 5,
            'windows': [{'c': int(y[i]), 'p': int(pred[pos[i]]), 'v': int(round(prob[pos[i]][pred[pos[i]]] * 5)),
                         'sd': round(float(X[i][:, 0].std() * 1000), 1), 'pp': round(float(np.ptp(X[i][:, 0]) * 1000), 1),
                         'lv': round(float(X[i][:, 0].mean()), 4), 'e': [round(v) for v in env(X[i][:, 0], 96)]} for i in order]}
    (ROOT / 'assets' / 'data' / 'gear-test.json').write_text(json.dumps(demo, separators=(',', ':')), encoding='utf-8')
    print('gear: accuracy', out['accuracy'], 'checks', out['checks'], 'examples at', common)


# Drawing

def num(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return (MINUS + s[1:]) if s.startswith('-') else ('0' if s == '-0' else s)


def ticks(lo, hi, n=4):
    """Round tick values from at or below lo to at or above hi, about n steps."""
    step = (hi - lo) / n
    mag = 10 ** math.floor(math.log10(step))
    step = min((m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= step), default=10 * mag)
    v = math.floor(lo / step + 1e-9) * step
    out = [round(v, 10)]
    while out[-1] < hi - step * 1e-6:
        v += step
        out.append(round(v, 10))
    return out


class Panel:
    """A plot area at (x, y) of size w by h, mapping data limits onto it."""

    def __init__(self, x, y, w, h, xlim, ylim):
        self.x, self.y, self.w, self.h, self.xlim, self.ylim = x, y, w, h, xlim, ylim

    def sx(self, v):
        a, b = self.xlim
        return self.x + (v - a) / (b - a) * self.w

    def sy(self, v):
        a, b = self.ylim
        return self.y + self.h - (v - a) / (b - a) * self.h

    def axes(self, xt, yt, xlabel=None, ylabel=None, xfmt=num, yfmt=num):
        """Left and bottom axes, light horizontal grid lines and tick labels."""
        x0, y0, x1, y1 = self.x, self.y, self.x + self.w, self.y + self.h
        out = [f'<path class="gr" d="{" ".join(f"M{x0:.1f} {self.sy(v):.1f}H{x1:.1f}" for v in yt)}"/>',
               f'<path class="ax" d="M{x0:.1f} {y0 - 4:.1f}V{y1:.1f}H{x1 + 4:.1f}"/>']
        out += [f'<text class="tk" x="{x0 - 8:.1f}" y="{self.sy(v) + 4:.1f}" text-anchor="end">{yfmt(v)}</text>' for v in yt]
        out += [f'<text class="tk" x="{self.sx(v):.1f}" y="{y1 + 17:.1f}" text-anchor="middle">{xfmt(v)}</text>' for v in xt]
        if xlabel:
            out.append(f'<text class="lb" x="{(x0 + x1) / 2:.1f}" y="{y1 + 36:.1f}" text-anchor="middle">{xlabel}</text>')
        if ylabel:
            out.append(f'<text class="lb" transform="translate({x0 - 44:.1f} {(y0 + y1) / 2:.1f}) rotate(-90)" text-anchor="middle">{ylabel}</text>')
        return out

    def line(self, xs, ys, cls):
        pts = ' L'.join(f'{self.sx(a):.1f} {self.sy(b):.1f}' for a, b in zip(xs, ys))
        return f'<path class="{cls}" d="M{pts}"/>'


def svg(w, h, body):
    return (f'<svg class="chart" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" xmlns="http://www.w3.org/2000/svg">\n'
            + '\n'.join(body) + '\n</svg>\n')


def legend(x, y, items):
    """A row of short line samples with labels, from (x, y); each label is spaced by its length."""
    out = []
    for cls, label in items:
        out.append(f'<path class="{cls}" d="M{x} {y}h22"/>')
        out.append(f'<text class="lg" x="{x + 30}" y="{y + 4}">{label}</text>')
        x += 30 + len(label) * 6.6 + 22
    return out


def arm_step(data):
    W, H, cols = 660, 430, 3
    joints = data['joints']
    body = legend(16, 12, [('s1', 'Linear model'), ('s2', 'Drive sim, ideal encoder'),
                           ('s3', 'Drive sim, hall sensors, friction, gravity')])
    pw, ph, gx, gy, left, top = 168, 120, 46, 64, 64, 46
    for i, j in enumerate(joints):
        st = j['step']
        hi = max(max(st['linear']), max(st['ideal']), max(st['hall']))
        yt = ticks(0, hi, 3)
        p = Panel(left + (i % cols) * (pw + gx), top + (i // cols) * (ph + gy), pw, ph, (0, 3), (0, yt[-1]))
        last_row = i // cols == (len(joints) - 1) // cols
        body += p.axes([0, 1, 2, 3], yt, 'Time (s)' if last_row else None,
                       'Joint angle (deg)' if i % cols == 0 else None)
        body += [p.line(st['t'], st['hall'], 's3'), p.line(st['t'], st['linear'], 's1'), p.line(st['t'], st['ideal'], 's2')]
        body.append(f'<text class="nm" x="{p.x + p.w:.1f}" y="{p.y + p.h - 8:.1f}" text-anchor="end">{j["name"]}</text>')
    return svg(W, H, body)


def arm_sag(data):
    loaded = [j for j in data['joints'] if 'sag' in j]
    W, H = 660, 200
    pw, ph, gx, left, top = 118, 120, 46, 64, 16
    body = []
    for i, j in enumerate(loaded):
        lo = min(j['sag']['deg'])
        yt = ticks(lo, 0, 3)
        p = Panel(left + i * (pw + gx), top, pw, ph, (0, 20), (yt[0], 0))
        body += p.axes([0, 10, 20], yt, 'Time (s)', 'Sag (deg)' if i == 0 else None)
        body.append(p.line(j['sag']['t'], j['sag']['deg'], 's1'))
        body.append(f'<text class="nm" x="{p.x + p.w:.1f}" y="{p.y + p.h - 8:.1f}" text-anchor="end">{j["name"]}</text>')
    return svg(W, H, body)


def arm_drives(data):
    """The six drives as a table: motor, current limit, measured phase resistance and inductance,
    and the tuned position, velocity and integrator gains."""
    cols = [('Node', 20, lambda r: str(r['node']), 'start'), ('Motor', 66, lambda r: r['motor'], 'start'),
            ('Current limit', 238, lambda r: f"{r['current_A']:.0f} A", 'end'), ('Resistance', 328, lambda r: f"{r['R_mohm']:.1f} mΩ", 'end'),
            ('Inductance', 414, lambda r: f"{r['L_uH']:.2f} µH", 'end'), ('Pos gain', 490, lambda r: f"{r['pos_gain']:.2f}", 'end'),
            ('Vel gain', 566, lambda r: f"{r['vel_gain']:.4f}", 'end'), ('Integrator', 644, lambda r: f"{r['vel_int']:.3f}", 'end')]
    top, rh, rows = 24, 32, data['drives']
    body = [f'<text class="tk" x="{x}" y="{top}" text-anchor="{a}">{h}</text>' for h, x, _, a in cols]
    body.append(f'<path class="ax" d="M16 {top + 10}H644"/>')
    for i, r in enumerate(rows):
        y = top + 10 + rh * (i + 1)
        body += [f'<text class="nm" x="{x}" y="{y - 11}" text-anchor="{a}">{f(r)}</text>' for _, x, f, a in cols]
        body.append(f'<path class="gr" d="M16 {y}H644"/>')
    return svg(660, top + 10 + rh * len(rows) + 8, body)


def gear_conditions(data):
    """One held-out test window of each condition, all at the same speed setting and load, drawn as
    sensor 1's displacement about its own mean (min and max per column), each on its own scale,
    since one surface-defect spike would flatten the rest on a shared one."""
    names, traces, ms = data['classes'], data['examples']['traces'], data['window'] / data['fs'] * 1000
    pw, ph, gx, gy, left, top = 168, 92, 46, 58, 64, 14
    body = []
    for k, (name, tr) in enumerate(zip(names, traces)):
        lim = max(abs(v) for v in tr)
        yt = ticks(-lim, lim, 2)
        p = Panel(left + (k % 3) * (pw + gx), top + (k // 3) * (ph + gy), pw, ph, (0, ms), (yt[0], yt[-1]))
        body += p.axes([0, 100, 200], yt, 'Time (ms)' if k >= 3 else None, 'Displacement (µm)' if k % 3 == 0 else None)
        n = len(tr) // 2
        xs = [ms * (j + 0.5) / n for j in range(n) for _ in (0, 1)]
        body.append(p.line(xs, tr, 's1 thin'))
        body.append(f'<text class="nm" x="{p.x + p.w:.1f}" y="{p.y - 4:.1f}" text-anchor="end">{name}</text>')
    return svg(660, top + 2 * ph + gy + 40, body)


def gear_confusion(data):
    """The KNN's test-set confusion matrix: true condition by row, prediction by column."""
    names, cm = data['classes'], data['confusion']
    n, cell, left, top = len(names), 52, 150, 96
    body = []
    for j, name in enumerate(names):
        x = left + cell * (j + 0.5)
        body.append(f'<text class="tk" transform="translate({x + 4:.1f} {top - 10}) rotate(-40)">{name}</text>')
    for i, row in enumerate(cm):
        y = top + cell * i
        body.append(f'<text class="nm" x="{left - 12}" y="{y + cell / 2 + 4:.1f}" text-anchor="end">{names[i]}</text>')
        total = sum(row)
        for j, v in enumerate(row):
            x = left + cell * j
            if v:
                body.append(f'<rect class="{"pt" if i == j else "hl"}" x="{x + 1}" y="{y + 1}" width="{cell - 2}" height="{cell - 2}" fill-opacity="{0.25 + 0.75 * v / total:.2f}"/>')
            else:
                body.append(f'<rect class="cell" x="{x + 1}" y="{y + 1}" width="{cell - 2}" height="{cell - 2}"/>')
            if v:
                body.append(f'<text class="{"ko" if i == j else "nm"}" x="{x + cell / 2}" y="{y + cell / 2 + 5:.1f}" text-anchor="middle">{v}</text>')
    x1, y1 = left + cell * n, top + cell * n
    body.append(f'<text class="lb" x="{(left + x1) / 2:.1f}" y="{y1 + 26}" text-anchor="middle">Predicted condition (test set, {sum(map(sum, cm))} windows)</text>')
    body.append(f'<text class="lb" transform="translate({18} {(top + y1) / 2:.1f}) rotate(-90)" text-anchor="middle">True condition</text>')
    return svg(660, y1 + 40, body)


def fastener_sweep(data):
    """Bin-picking precision and recall against confidence threshold, one line per NMS IoU,
    with the default and selected operating points marked. Both panels span 0.16 so their slopes compare."""
    W, H = 660, 300
    cls = {0.7: 's2', 0.5: 's3', 0.3: 's1'}
    body = legend(16, 12, [('s2', 'NMS IoU 0.70 (default)'), ('s3', 'NMS IoU 0.50'), ('s1', 'NMS IoU 0.30 (selected)')])
    dflt, best = data['default'], data['selected']
    f2 = lambda v: f'{v:.2f}'
    for i, (key, ylabel, lo) in enumerate([('precision', 'Precision', 0.76), ('recall', 'Recall', 0.84)]):
        p = Panel(64 + i * 330, 46, 240, 190, (0.25, 0.7), (lo, lo + 0.16))
        body += p.axes([0.25, 0.4, 0.5, 0.6, 0.7], [round(lo + k * 0.04, 2) for k in range(5)],
                       'Confidence threshold', ylabel, xfmt=f2, yfmt=f2)
        for s in sorted(data['series'], key=lambda s: s['nms_iou'] == best['nms_iou']):
            body.append(p.line(s['conf'], s[key], cls[s['nms_iou']]))
        for op, above in ((dflt, key == 'recall'), (best, key == 'precision')):
            s = next(s for s in data['series'] if s['nms_iou'] == op['nms_iou'])
            v = s[key][s['conf'].index(op['conf'])]
            x, y = p.sx(op['conf']), p.sy(v)
            body.append(f'<rect class="pt" x="{x - 4:.1f}" y="{y - 4:.1f}" width="8" height="8"/>')
            anchor = 'start' if op is dflt else 'end'
            body.append(f'<text class="nm" x="{x + (6 if op is dflt else -6):.1f}" y="{y + (-10 if above else 20):.1f}" '
                        f'text-anchor="{anchor}">{v:.3f}</text>')
    return svg(W, H, body)


def resistor(x, y0, y1):
    """A vertical zigzag resistor at x from y0 to y1."""
    step = (y1 - y0) / 6
    zig = ''.join(f'L{x + (6 if i % 2 == 0 else -6)} {y0 + step * (i + 0.5):.1f}' for i in range(6))
    return f'M{x} {y0}{zig}L{x} {y1}'


def capacitor(x, y):
    """Two horizontal plates at x, the top one at y."""
    return f'M{x - 12} {y}h24M{x - 12} {y + 8}h24'


def servo_circuit(data):
    """The driver redrawn from the report's two schematics: the LM317T stage, the NE555 astable
    with its diode-steered potentiometer, and the servo on the regulated rail."""
    reg, tim = data['regulator'], data['timer']
    W, H, top, bot = 660, 370, 50, 330
    wires = [
        f'M27.5 {top}H100', f'M180 {top}H626V125',                          # input; regulated rail to the servo
        f'M72 {top}V170', capacitor(72, 170), f'M72 178V{bot}',               # input capacitor
        f'M140 90V130H200',                                                 # ADJ to the divider
        f'M200 {top}V66', resistor(200, 66, 106), 'M200 106V146', resistor(200, 146, 186), f'M200 186V{bot}',
        f'M258 {top}V170', capacitor(258, 170), f'M258 178V{bot}',            # output capacitor
        f'M350 {top}V66', resistor(350, 66, 106), 'M350 106V120', resistor(350, 120, 180),
        'M350 180V196', resistor(350, 196, 236), 'M350 236V280', capacitor(350, 280), f'M350 288V{bot}',
        'M350 260H445V180H470', 'M445 210H470',                              # timing node to THR and TRIG
        'M362 150H470',                                                     # wiper to DIS
        'M385 150V195', 'M377 195H393L385 211Z', 'M377 211H393', 'M385 211V260',  # diode, anode up
        f'M495 {top}V120', f'M545 {top}V120',                               # VCC and RESET to the rail
        'M495 240V270', capacitor(495, 270), f'M495 278V{bot}', f'M545 240V{bot}',
        'M570 150H600', f'M626 175V{bot}',                                  # output to the servo signal; servo ground
        f'M72 {bot}H626', f'M72 {bot}V342M60 342h24M65 347h14M70 352h4',      # ground bus and symbol
    ]
    body = [f'<path class="s1" d="{"".join(wires)}"/>',
            f'<circle class="s1" cx="24" cy="{top}" r="3.5"/>',
            '<rect class="s1" x="100" y="34" width="80" height="56"/>',
            '<rect class="s1" x="470" y="120" width="100" height="120"/>',
            '<rect class="s1" x="600" y="125" width="52" height="50"/>',
            '<path class="pt" d="M357 150l8 -4v8z"/>']
    dots = [(72, top), (200, top), (258, top), (350, top), (495, top), (545, top), (200, 130), (385, 150),
            (350, 260), (385, 260), (445, 210)] + [(x, bot) for x in (72, 200, 258, 350, 495, 545)]
    body += [f'<circle class="pt" cx="{x}" cy="{y}" r="2.5"/>' for x, y in dots]
    text = [  # (class, x, y, anchor, label)
        ('nm', 24, 36, 'middle', data['supply']), ('nm', 140, 27, 'middle', reg['ic']),
        ('tk', 106, 54, 'start', 'IN'), ('tk', 174, 54, 'end', 'OUT'), ('tk', 140, 84, 'middle', 'ADJ'),
        ('tk', 90, 178, 'start', reg['Cin']),
        ('nm', 208, 82, 'start', 'RA'), ('tk', 208, 96, 'start', reg['RA']),
        ('nm', 208, 162, 'start', 'RB'), ('tk', 208, 176, 'start', reg['RB']),
        ('tk', 276, 178, 'start', reg['Cout']), ('nm', 304, 42, 'middle', 'VCC'),
        ('nm', 338, 82, 'end', 'R1'), ('tk', 338, 96, 'end', tim['R1']),
        ('nm', 338, 146, 'end', 'Pot'), ('tk', 338, 160, 'end', tim['pot']),
        ('nm', 338, 212, 'end', 'R2'), ('tk', 338, 226, 'end', tim['R2']),
        ('nm', 332, 284, 'end', 'C'), ('tk', 332, 298, 'end', tim['C']),
        ('nm', 397, 200, 'start', 'D'), ('tk', 397, 214, 'start', tim['D']),
        ('nm', 520, 112, 'middle', tim['ic']),
        ('tk', 476, 154, 'start', 'DIS'), ('tk', 476, 184, 'start', 'THR'), ('tk', 476, 214, 'start', 'TRIG'),
        ('tk', 495, 136, 'middle', 'VCC'), ('tk', 545, 136, 'middle', 'RST'),
        ('tk', 495, 232, 'middle', 'CTRL'), ('tk', 545, 232, 'middle', 'GND'), ('tk', 564, 154, 'end', 'OUT'),
        ('tk', 458, 146, 'middle', '7'), ('tk', 458, 176, 'middle', '6'), ('tk', 458, 206, 'middle', '2'),
        ('tk', 490, 114, 'end', '8'), ('tk', 550, 114, 'start', '4'), ('tk', 490, 254, 'end', '5'),
        ('tk', 550, 254, 'start', '1'), ('tk', 585, 146, 'middle', '3'),
        ('tk', 479, 278, 'end', tim['Ccont']), ('nm', 626, 154, 'middle', 'Servo'),
    ]
    body += [f'<text class="{c}" x="{x}" y="{y}" text-anchor="{a}">{s}</text>' for c, x, y, a, s in text]
    return svg(W, H, body)


def servo_pwm(data):
    """The output at both ends of the potentiometer, drawn from the measured frequency and pulse width."""
    # Only the timing was measured, so the vertical axis is the logic level, not volts.
    W, H, end, hi = 660, 304, 40, 1
    body = []
    for i, c in enumerate(data['cases']):
        p = Panel(64, 28 + i * 140, 500, 90, (0, end), (0, 1.25))
        body += p.axes([0, 10, 20, 30, 40], [0, 1], 'Time (ms)' if i == len(data['cases']) - 1 else None, 'Output',
                       yfmt=lambda v: 'High' if v else 'Low')
        period, width = 1000 / c['freq_Hz'], c['pulse_ms']
        xs, ys, t = [0], [0], 1.0
        while t + width <= end:
            xs += [t, t, t + width, t + width]
            ys += [0, hi, hi, 0]
            t += period
        body.append(p.line(xs + [end], ys + [0], 's1'))
        body.append(f'<text class="nm" x="{p.x}" y="{p.y - 12}">{c["name"]}: {width:.2f} ms pulses at {c["freq_Hz"]} Hz, '
                    f'duty {c["duty"]}</text>')
    return svg(W, H, body)


def sorter_results(data):
    """Each validation test's success rate as a bar, passes solid and the miss hollow, with the one
    numeric target drawn across its row."""
    rows, rh = data['rows'], 56
    p = Panel(220, 12, 380, rh * len(rows), (0, 100), (0, len(rows)))
    x0, y0, x1, y1 = p.x, p.y, p.x + p.w, p.y + p.h
    xt = [0, 25, 50, 75, 100]
    body = [f'<path class="gr" d="{" ".join(f"M{p.sx(v):.1f} {y0:.1f}V{y1:.1f}" for v in xt[1:])}"/>',
            f'<path class="ax" d="M{x0:.1f} {y0 - 4:.1f}V{y1:.1f}H{x1 + 4:.1f}"/>']
    body += [f'<text class="tk" x="{p.sx(v):.1f}" y="{y1 + 17:.1f}" text-anchor="middle">{v}</text>' for v in xt]
    body.append(f'<text class="lb" x="{(x0 + x1) / 2:.1f}" y="{y1 + 38:.1f}" text-anchor="middle">Success rate (%)</text>')
    for i, r in enumerate(rows):
        yc, xe = y0 + rh * (i + 0.5), p.sx(r['result'])
        cls = 'pt' if r['status'] == 'Pass' else 's1'
        body.append(f'<rect class="{cls}" x="{x0:.1f}" y="{yc - 9:.1f}" width="{xe - x0:.1f}" height="18"/>')
        body.append(f'<text class="nm" x="{x0 - 12:.1f}" y="{yc - 2:.1f}" text-anchor="end">{r["name"]}</text>')
        body.append(f'<text class="tk" x="{x0 - 12:.1f}" y="{yc + 13:.1f}" text-anchor="end">{r["detail"]}</text>')
        body.append(f'<text class="nm" x="{xe + 8:.1f}" y="{yc + 4:.1f}">{r["result"]}%, {r["status"].lower()}</text>')
        if r['target'] is not None:
            xt_ = p.sx(r['target'])
            body.append(f'<path class="s2" d="M{xt_:.1f} {yc - 14:.1f}V{yc + 14:.1f}"/>')
            body.append(f'<text class="tk" x="{xt_:.1f}" y="{yc - 20:.1f}" text-anchor="middle">Target {r["target"]}%</text>')
    return svg(660, y1 + 50, body)


def sorter_colour(data):
    """Top: the belt and target profiles per normalised channel. Bottom: the same two profiles on the
    line between them, each with its 0.07 threshold, so the gap between the two regions shows."""
    b, t = data['belt'], data['target']
    d = math.dist(b['rgb'], t['rgb'])
    f2 = lambda v: f'{v:.2f}'

    def marks(p, x, y, belt):
        if belt:
            return f'<circle class="s1" cx="{p.sx(x):.1f}" cy="{y:.1f}" r="5"/>'
        return f'<rect class="pt" x="{p.sx(x) - 4.5:.1f}" y="{y - 4.5:.1f}" width="9" height="9"/>'

    def frame(p, rows, xt, xlabel):
        ys = [p.sy(len(rows) - 1 - k) for k in range(len(rows))]
        out = [f'<path class="gr" d="{" ".join(f"M{p.x:.1f} {y:.1f}H{p.x + p.w:.1f}" for y in ys)}"/>',
               f'<path class="ax" d="M{p.x:.1f} {p.y - 4:.1f}V{p.y + p.h:.1f}H{p.x + p.w + 4:.1f}"/>']
        out += [f'<text class="tk" x="{p.x - 12:.1f}" y="{y + 4:.1f}" text-anchor="end">{r}</text>' for r, y in zip(rows, ys)]
        out += [f'<text class="tk" x="{p.sx(v):.1f}" y="{p.y + p.h + 17:.1f}" text-anchor="middle">{f2(v)}</text>' for v in xt]
        out.append(f'<text class="lb" x="{p.x + p.w / 2:.1f}" y="{p.y + p.h + 37:.1f}" text-anchor="middle">{xlabel}</text>')
        return out, ys

    p = Panel(120, 30, 480, 150, (0.2, 0.5), (-0.5, 2.5))
    body, ys = frame(p, ['Red', 'Green', 'Blue'], [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
                     'Normalised value (channel ÷ clear)')
    for k, y in enumerate(ys):
        bv, tv = b['rgb'][k], t['rgb'][k]
        body.append(f'<path class="s3" d="M{p.sx(bv):.1f} {y:.1f}H{p.sx(tv):.1f}"/>')
        body += [marks(p, bv, y, True), marks(p, tv, y, False)]
        body += [f'<text class="tk" x="{p.sx(v):.1f}" y="{y + 20:.1f}" text-anchor="middle">{v:.3f}</text>' for v in (bv, tv)]
        if k == 0:
            body.append(f'<text class="nm" x="{p.sx(bv):.1f}" y="{y - 12:.1f}" text-anchor="middle">{b["name"]}</text>')
            body.append(f'<text class="nm" x="{p.sx(tv):.1f}" y="{y - 12:.1f}" text-anchor="middle">{t["name"]}</text>')

    q = Panel(120, 278, 480, 70, (0, 0.25), (-0.5, 1.5))
    more, (yb, yt) = frame(q, [b['name'], t['name']], [0, 0.05, 0.1, 0.15, 0.2, 0.25],
                           'Distance from the belt profile, along the line to the target profile')
    body += more
    rb, rt = b['threshold'], t['threshold']
    body.append(f'<path class="s2" d="M{q.sx(0):.1f} {yb:.1f}H{q.sx(rb):.1f}M{q.sx(rb):.1f} {yb - 7:.1f}V{yb + 7:.1f}"/>')
    body.append(marks(q, 0, yb, True))
    body.append(f'<text class="tk" x="{q.sx(rb) + 8:.1f}" y="{yb + 4:.1f}">present beyond {rb}</text>')
    lo, hi = q.sx(d - rt), q.sx(d + rt)
    body.append(f'<path class="s1" d="M{lo:.1f} {yt:.1f}H{hi:.1f}M{lo:.1f} {yt - 7:.1f}V{yt + 7:.1f}M{hi:.1f} {yt - 7:.1f}V{yt + 7:.1f}"/>')
    body.append(marks(q, d, yt, False))
    body.append(f'<text class="tk" x="{lo - 8:.1f}" y="{yt + 4:.1f}" text-anchor="end">match within {rt}</text>')
    body.append(f'<text class="nm" x="{q.sx(d):.1f}" y="{yt - 12:.1f}" text-anchor="middle">{d:.3f} from belt</text>')
    return svg(660, q.y + q.h + 48, body)


CHARTS = {'servo-circuit.svg': ('servo-circuit.json', servo_circuit), 'servo-pwm.svg': ('servo-pwm.json', servo_pwm),
          'arm-step.svg': ('arm-control.json', arm_step), 'arm-sag.svg': ('arm-control.json', arm_sag),
          'arm-drives.svg': ('arm-drives.json', arm_drives),
          'gear-conditions.svg': ('gear-results.json', gear_conditions), 'gear-confusion.svg': ('gear-results.json', gear_confusion),
          'fastener-sweep.svg': ('fastener-sweep.json', fastener_sweep),
          'sorter-results.svg': ('sorter-results.json', sorter_results), 'sorter-colour.svg': ('sorter-colour.json', sorter_colour)}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--arm', type=Path, help="the Robotic Arm repo's sim/ folder")
    ap.add_argument('--drives', type=Path, help="the Robotic Arm repo's drives/ folder of ODESC backups")
    ap.add_argument('--gear', type=Path, help="the DS 3000 project's Code folder with the course CSVs")
    a = ap.parse_args()
    if a.arm:
        export_arm(a.arm.resolve())
    if a.drives:
        export_drives(a.drives.resolve())
    if a.gear:
        export_gear(a.gear.resolve())
    FIGS.mkdir(exist_ok=True)
    for name, (src, draw) in CHARTS.items():
        (FIGS / name).write_text(draw(json.loads((DATA / src).read_text(encoding='utf-8'))), encoding='utf-8')
        print(f'wrote content/figures/{name}')


if __name__ == '__main__':
    main()
