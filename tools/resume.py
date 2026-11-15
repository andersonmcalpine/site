"""Write resume.pdf from the resume sheet that resume.html shows (Jake's Resume layout).

From build.py:  from tools.resume import render;  render(sheet_html, out_path, meta)

A private copy for applications, with a phone number the site never shows:

    python3 tools/resume.py OUT.pdf --phone "(555) 555-0100"

The number is only passed on the command line, so it is never stored in the site's files.

The sheet is wrapped in a bare page with assets/jake.css inlined, then tools/pdf.swift lays it
out with WebKit on one US Letter page and sets the title, author, subject and keywords. The text
stays real text, so applicant-tracking software and AI screeners read it cleanly. Needs macOS with
Swift; the helper is compiled once into the temp folder and reused, as tools/og.py does.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def helper():
    """Path to the compiled Swift helper, building it when pdf.swift has changed."""
    src = HERE / 'pdf.swift'
    digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
    # In a folder of its own: WebKit keeps a cache folder in the temp folder named after the program.
    exe = Path(tempfile.gettempdir()) / f'site-pdf-{digest}' / 'render'
    if not exe.exists():
        exe.parent.mkdir(parents=True, exist_ok=True)
        part = exe.with_suffix('.part')
        try:
            subprocess.run(['swiftc', '-O', '-o', str(part), str(src)], check=True, capture_output=True)
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            raise RuntimeError('resume: cannot compile tools/pdf.swift; it needs Swift (xcode-select --install)') from e
        os.replace(part, exe)
    return exe


def render(sheet, out, meta):
    """Render the sheet's HTML to out (a PDF). Raises RuntimeError, for example when it runs past one page."""
    css = (ROOT / 'assets' / 'jake.css').read_text(encoding='utf-8')
    page = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{meta["title"]}</title>'
            f'<style>{css}\nhtml, body {{ margin: 0; background: #fff; }}</style></head><body>{sheet}</body></html>')
    with tempfile.TemporaryDirectory() as tmp:
        html, info = Path(tmp) / 'resume.html', Path(tmp) / 'meta.json'
        html.write_text(page, encoding='utf-8')
        info.write_text(json.dumps(meta), encoding='utf-8')
        done = subprocess.run([str(helper()), str(html), str(Path(out).resolve()), str(info)],
                              capture_output=True, encoding='utf-8', timeout=60)
        if done.returncode:
            # WebKit logs to stderr too; the helper's own message is the line starting "pdf:".
            msg = [line for line in done.stderr.splitlines() if line.startswith('pdf:')]
            raise RuntimeError(msg[-1] if msg else f'resume: helper failed with code {done.returncode}')


def main():
    ap = argparse.ArgumentParser(description='Write a private application copy of the resume PDF.')
    ap.add_argument('out', type=Path, help='where to write the PDF (keep it outside the site folder)')
    ap.add_argument('--phone', default='', help='a phone number for the contact line')
    a = ap.parse_args()
    if a.out.resolve().is_relative_to(ROOT):
        sys.exit('resume: write the private copy outside the site folder, so it is never published')
    sys.path.insert(0, str(ROOT))
    import build
    import build_pages
    site, _ = build.load()
    resume = build.read_resume()
    if build.errors:
        sys.exit('\n'.join(build.errors))
    h = {'esc': build.esc, 'inline': build.inline, 'ARROW': build.ARROW, 'prefix': ''}
    meta = {'title': f'{site["name"]} Resume', 'author': site['name'], 'subject': site['about'],
            'keywords': build.keywords(resume)}
    render(build_pages.jake_html(site, resume, h, a.phone), a.out, meta)
    print(f'wrote {a.out}')


if __name__ == '__main__':
    main()
