"""Share images (Open Graph, 1200x630 PNG) and favicon exports for the site.

    python3 tools/og.py OUT.png "Title" "Kicker"   one share image
    python3 tools/og.py --icons                    assets/favicon-32.png and apple-touch-icon.png from favicon.svg

From build.py:  from tools.og import render;  render(out_path, title, kicker)

A kicker that starts with a project number ("Project 02, Computer vision" or "02 ...") adds the giant numeral.
The art (dots, hairline, gold square) is built here as SVG; tools/og.swift
draws it with AppKit, sets the text in the system font, and writes the PNG. Needs macOS with Swift
(Xcode or the Command Line Tools); the helper is compiled once into the temp folder and reused.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
W, H = 1200, 630
M = 72            # outer margin
BOTTOM = 556      # baseline of the title's last line; the copy stacks up from here
BRAND_Y = 44      # top of the brand row (gold square and name)
NUM_TOP = 112     # the giant numeral never rises above this

INDIGO, BLUSH, MAUVE, SLATE, GOLD = '#22223B', '#F2E9E4', '#B3A7B1', '#4A4E69', '#E9C46A'
TITLE = {'width': 900, 'size': 84, 'minSize': 72, 'maxLines': 3, 'leading': 1.04, 'tracking': -0.02,
         'color': BLUSH}


def helper():
    """Path to the compiled Swift helper, building it when og.swift has changed."""
    src = HERE / 'og.swift'
    digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
    exe = Path(tempfile.gettempdir()) / f'site-og-{digest}'
    if not exe.exists():
        part = exe.with_suffix('.part')
        try:
            subprocess.run(['swiftc', '-O', '-o', str(part), str(src)], check=True)
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            raise RuntimeError('og: cannot compile tools/og.swift; it needs Swift (xcode-select --install)') from e
        os.replace(part, exe)
    return exe


def run(job):
    """Send one job to the helper and return what it prints. Raises RuntimeError with its message on failure."""
    out = subprocess.run([str(helper())], input=json.dumps(job), capture_output=True, encoding='utf-8')
    if out.returncode:
        raise RuntimeError(out.stderr.strip() or f'og: helper failed with code {out.returncode}')
    return out.stdout


def raster(svg, out, width, height, texts=(), opaque=True):
    """Draw an SVG layer plus text boxes (see og.swift) into a PNG."""
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    run({'out': str(out), 'width': width, 'height': height, 'opaque': opaque, 'svg': svg, 'texts': list(texts)})


def measure(box):
    """Size, line count and cap height the helper picks for a text box."""
    job = {'out': '', 'width': W, 'height': H, 'svg': '', 'measure': True, 'texts': [box]}
    fit = json.loads(run(job))[0]
    return fit['size'], int(fit['lines']), fit['cap']


def art(hair, dots_x):
    """Everything but the text: background, dot matrix, hairline at y=hair and the gold square."""
    dots_y = max(hair - 180, NUM_TOP)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs><pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse">
<circle cx="4.5" cy="4.5" r="1.2" fill="{SLATE}"/></pattern></defs>
<rect width="{W}" height="{H}" fill="{INDIGO}"/>
<rect x="{dots_x}" y="{dots_y}" width="408" height="{hair - 30 - dots_y}" fill="url(#dots)" opacity="0.5"/>
<rect x="156" y="{hair}" width="{W - 156}" height="1" fill="{SLATE}" opacity="0.75"/>
<rect x="{M}" y="{BRAND_Y + 6}" width="14" height="14" fill="{GOLD}"/>
</svg>'''


def numeral(kicker, hair, cap_ratio):
    """The giant project number standing on the hairline, cropped by the left edge as on the case pages."""
    num = re.match(r'(?:Project )?(\d+)', kicker)
    if not num:
        return None
    size = min(300, (hair - 20 - NUM_TOP) / cap_ratio)
    return {'text': num[1], 'x': -0.1 * size, 'top': hair - 20 - cap_ratio * size, 'width': 2000,
            'size': size, 'tracking': -0.07, 'color': BLUSH}


def render(out_path, title, kicker, brand='Anderson McAlpine'):
    """Write a 1200x630 share image: the brand top left, the title in blush with the kicker above it in mauve.

    The title, kicker and hairline stack up from the bottom; the numeral (if any) fills the space above.
    Raises RuntimeError with the helper's message, for example when the title needs more than three lines.
    """
    size, lines, cap = measure(dict(TITLE, text=title, x=0, top=0))
    title_top = BOTTOM - cap - (lines - 1) * size * TITLE['leading']
    kicker_top = title_top - 52
    hair = round(kicker_top - 34)
    boxes = [
        # The name beside the gold square, its cap height centred on the square.
        {'text': brand, 'x': M + 28, 'top': BRAND_Y + 5, 'width': 600, 'size': 24, 'tracking': -0.01, 'color': BLUSH},
        {'text': kicker, 'x': M, 'top': kicker_top, 'width': W - 2 * M, 'size': 26, 'color': MAUVE},
        dict(TITLE, text=title, x=M - 4, top=title_top),  # 4 px in: big type's side bearing lines up with the kicker
    ]
    num = numeral(kicker, hair, cap / size)
    # The dots sit behind the numeral as on the case pages; without one they balance the card on the right.
    dots_x = 36 if num else W - M - 408
    raster(art(hair, dots_x), out_path, W, H, ([num] if num else []) + boxes)


def icons():
    """Export the PNG favicons from assets/favicon.svg."""
    svg = (ROOT / 'assets' / 'favicon.svg').read_text(encoding='utf-8')
    raster(svg, ROOT / 'assets' / 'favicon-32.png', 32, 32, opaque=False)  # keep the rounded corners
    # Apple touch icon: full-bleed indigo (iOS rounds the corners itself) with the mark padded inside.
    inner = re.sub(r'<svg[^>]*>', '', svg, count=1).replace('</svg>', '')
    box = re.search(r'viewBox="([^"]+)"', svg)[1]
    touch = f'''<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
<rect width="180" height="180" fill="{INDIGO}"/><svg x="22" y="22" width="136" height="136" viewBox="{box}">{inner}</svg></svg>'''
    raster(touch, ROOT / 'assets' / 'apple-touch-icon.png', 180, 180)


if __name__ == '__main__':
    args = sys.argv[1:]
    try:
        if args == ['--icons']:
            icons()
        elif len(args) == 3:
            render(*args)
        else:
            sys.exit(__doc__)
    except RuntimeError as e:
        sys.exit(str(e))
