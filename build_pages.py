"""About and Resume page templates for build.py.

    read_about(path, fail)                   read content/about.md
    about_main(site, projects, about, h)     the HTML inside <main> for about.html
    jake_html(site, resume, h)               the resume sheet (Jake's Resume layout) from content/resume.json
    resume_main(site, resume, h)             the HTML inside <main> for resume.html

h holds build.py's helpers: {'esc': esc, 'inline': inline, 'ARROW': ARROW, 'prefix': ''}.
Both pages use the page head and bands in site.css; what they add is in assets/pages.css, and
the resume sheet's own layout is in assets/jake.css. Only the Python standard library is used.
"""
import re
from pathlib import Path

FIELDS = ('lede', 'photo', 'photo_alt')


# Reading content/about.md

def read_about(path, fail):
    """Read about.md into {title, lede, photo, photo_alt, sections, where}.

    Each section is (heading, items); an item is ('p', text), ('h3', text) or
    ('list', [(when, title, detail)]). Problems are reported through fail(where, message).
    """
    path = Path(path)
    root = path.resolve().parent.parent
    where = f'{path.parent.name}/{path.name}'
    about = {'title': '', 'lede': '', 'photo': '', 'photo_alt': '', 'sections': [], 'where': where}
    if not path.is_file():
        fail(where, 'file not found')
        return about
    text = path.read_text(encoding='utf-8')
    fm = re.match(r'---\n(.*?)\n---\n', text, re.S)
    if not fm:
        fail(where, 'start the file with a --- front matter block')
        return about
    for n, line in enumerate(fm.group(1).splitlines(), 2):
        key, sep, value = (part.strip() for part in line.partition(':'))
        if not line.strip():
            continue
        if not sep or key not in FIELDS:
            fail(f'{where}:{n}', f'cannot read "{line.strip()}"; the fields are {", ".join(FIELDS)}')
            continue
        about[key] = value

    body = text[fm.end():]
    title = re.search(r'^# (.+)$', body, re.M)
    if not title:
        fail(where, 'add the page title as a # heading under the front matter')
        return about
    about['title'] = title.group(1).strip()
    if not about['lede']:
        fail(where, '"lede" is missing or empty')
    check_photo(about, root, where, fail)

    chunks = re.split(r'^## ', body[title.end():], flags=re.M)
    if chunks[0].strip():
        fail(where, 'put the text under a ## section heading')
    for chunk in chunks[1:]:
        head, _, rest = chunk.partition('\n')
        items = []
        for block in re.split(r'\n\s*\n', rest):
            if block.strip():
                items += read_block(block.strip(), where, fail)
        if not items:
            fail(where, f'section "{head.strip()}" is empty')
        about['sections'].append((head.strip(), items))
    if not about['sections']:
        fail(where, 'add at least one ## section')
    return about


def check_photo(about, root, where, fail):
    """A photo is optional; when set it must be a file under images/ and have alt text."""
    photo = about['photo']
    if not photo:
        return
    if not photo.startswith('images/') or '..' in Path(photo).parts:
        fail(where, f'photo "{photo}" must be a path under images/')
    elif not (root / photo).is_file():
        fail(where, f'photo {photo} does not exist')
    if not about['photo_alt']:
        fail(where, 'photo_alt is missing; describe the photo')


def read_block(block, where, fail):
    """Turn one blank-line-separated block into items: a ### heading, a paragraph or a list."""
    lines = block.splitlines()
    items = []
    if lines[0].startswith('### '):
        items.append(('h3', lines[0][4:].strip()))
        lines = lines[1:]
    if not lines:
        return items
    listed = [line.startswith('- ') for line in lines]
    if all(listed):
        rows = []
        for line in lines:
            parts = [part.strip() for part in line[2:].split('|')]
            if len(parts) not in (2, 3) or not all(parts):
                fail(where, f'write "{line[:60]}" as "- when | what" or "- when | what | detail"')
                continue
            rows.append((parts + [''])[:3])
        items.append(('list', rows))
    elif any(listed):
        fail(where, f'leave a blank line between a paragraph and a list near "{lines[0][:60]}"')
    elif lines[0].startswith('!['):
        fail(where, 'images are not read here; set photo: and photo_alt: in the front matter')
    elif any(line.startswith('#') for line in lines):
        fail(where, f'only ## sections and ### headings are read, near "{lines[0][:60]}"')
    else:
        items.append(('p', ' '.join(' '.join(lines).split())))
    return items


# Shared pieces

def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def role(when, title, org, texts, h, extra=''):
    """One entry in the site's .role pattern: dates on the left, then title, organisation and text."""
    esc, inline = h['esc'], h['inline']
    dates = f'\n            <p class="role-dates">{esc(when)}</p>' if when else ''
    org = f'\n              <p class="role-org">{inline(org)}</p>' if org else ''
    paras = ''.join(f'\n              <p>{inline(t)}</p>' for t in texts if t)
    return f'''          <li class="role">{dates}
            <div>
              <h3>{title}</h3>{org}{paras}{extra}
            </div>
          </li>'''


def band_head(num, sid, head):
    """A band's opening: a hairline, the number in the label column, the heading beside it."""
    return (f'    <header class="band-hd cols">\n'
            f'      <p class="eyebrow"><span class="n">{num}</span></p>\n'
            f'      <h2 id="{sid}-h">{head}</h2>\n'
            f'    </header>')


# About

def timeline(rows, h):
    """List rows (when | what | detail) as the home page's timeline: date, dot on the rail, card."""
    esc, inline = h['esc'], h['inline']
    items = []
    for when, title, detail in rows:
        org = f'\n          <p class="tl-org">{inline(detail)}</p>' if detail else ''
        items.append(f'''
      <div class="tl-item">
        <p class="tl-date">{esc(when)}</p>
        <div class="tl-card">
          <h3>{inline(title)}</h3>{org}
        </div>
      </div>''')
    return f'    <div class="tl">\n      <span class="tl-fill" aria-hidden="true"></span>{"".join(items)}\n    </div>'


def about_body(items, h):
    """Paragraphs become prose, ### headings with their paragraphs become a two-column list,
    lists become a timeline; each sits in the band's content column."""
    inline = h['inline']
    out, prose, cells = [], [], []

    def flush():
        if prose:
            out.append('    <div class="band-body cols reveal">\n      <div class="col2 prose">\n'
                       + '\n'.join(f'        <p>{inline(t)}</p>' for t in prose) + '\n      </div>\n    </div>')
            prose.clear()
        if cells:
            out.append('    <div class="band-body cols">\n      <ul class="col2 how-list">\n' + '\n'.join(
                f'        <li><h3>{inline(head)}</h3>' + ''.join(f'<p>{inline(t)}</p>' for t in paras) + '</li>'
                for head, paras in cells) + '\n      </ul>\n    </div>')
            cells.clear()

    for kind, value in items:
        if kind == 'h3':
            if prose:
                flush()
            cells.append((value, []))
        elif kind == 'p':
            (cells[-1][1] if cells else prose).append(value)
        else:
            flush()
            out.append(timeline(value, h))
    flush()
    return '\n'.join(out)


def about_main(site, projects, about, h):
    """Return the HTML inside <main> for about.html: a page head beside the photo (or the initials
    in particles), one band per ## heading, then a band leading on to the resume."""
    esc, inline, pre = h['esc'], h['inline'], h.get('prefix', '')
    initials = ''.join(word[0] for word in site['name'].split())
    if about.get('photo'):
        field = (f'    <div class="field dark">\n      <img class="ph-photo" src="{pre}{esc(about["photo"])}" '
                 f'alt="{esc(about["photo_alt"])}">\n    </div>')
    else:
        field = (f'    <div class="field dark" data-shape="text:{esc(initials)}">\n'
                 f'      <p class="field-word" aria-hidden="true">{esc(initials)}</p>\n'
                 f'      <canvas class="field-cloud" aria-hidden="true" data-parallax="0.25"></canvas>\n    </div>')
    place = f'<span>{esc(site["location"])}</span>' if site.get('location') else ''

    bands, seen, light = [], set(), False
    for k, (head, items) in enumerate(about['sections']):
        sid = slug(head) or f'part-{k + 1}'
        if sid in seen:
            sid = f'{sid}-{k + 1}'
        seen.add(sid)
        # A timeline sits on a deep band; other sections alternate dark and light.
        if any(kind == 'list' for kind, _ in items):
            tone = 'dark deep'
        else:
            tone, light = ('light soft' if light else 'dark'), not light
        bands.append(f'''  <section class="band {tone}" id="{sid}" aria-labelledby="{sid}-h">
{band_head(f"{k + 1:02d}", sid, esc(head))}
{about_body(items, h)}
  </section>''')

    return f'''  <section class="ph" id="top" aria-labelledby="ab-title">
    <div class="ph-text">
      <p class="eyebrow"><span class="n">About</span>{place}</p>
      <h1 id="ab-title">{esc(about["title"])}</h1>
      <p class="ph-lede">{inline(about["lede"])}</p>
      <div class="actions">
        <a class="btn" href="{pre}index.html#work">Selected Work</a>
        <a class="btn alt" href="mailto:{esc(site["email"])}">Email</a>
        <a class="btn alt" href="{esc(site["linkedin"])}">LinkedIn</a>
      </div>
    </div>
{field}
  </section>

{chr(10).join(bands)}

  <section class="band dark night" id="next" aria-labelledby="next-h">
{band_head("Next", "next", "Resume")}
    <div class="band-body cols reveal">
      <div class="col2">
        <p class="lead">Education, experience, projects and skills on one page, ready to print or download.</p>
        <div class="actions">
          <a class="btn" href="{pre}resume.html">View Resume</a>
          <a class="btn alt" href="{pre}{esc(site["resume"])}" download>Download PDF</a>
        </div>
      </div>
    </div>
  </section>'''


# Resume

def jake_html(site, resume, h, phone=''):
    """The resume sheet in Jake's Resume layout, from content/resume.json. Plain text in reading
    order (name, contact, Education, Experience, Projects, Technical Skills), so a screening
    tool that reads the page or the PDF gets clean text. phone is only for private application
    copies (tools/resume.py); the site never shows one."""
    esc, inline = h['esc'], h['inline']
    c = resume['contact']
    contact = ' | '.join(x for x in (
        esc(c.get('location', '')), esc(phone),
        f'<a href="mailto:{esc(site["email"])}">{esc(site["email"])}</a>',
        f'<a href="{esc(site["linkedin"])}">{esc(c.get("linkedin_label") or site["linkedin"])}</a>') if x)

    def row(left, right, cls='jk-row'):
        return f'<div class="{cls}"><span>{left}</span><span>{right}</span></div>'

    def points(items):
        return '<ul>' + ''.join(f'<li>{inline(p)}</li>' for p in items) + '</ul>' if items else ''

    edu = ''.join(f'''
    <div class="jk-entry">
      {row(f"<b>{esc(e['school'])}</b>", esc(e.get('place', '')))}
      {row(f"<i>{esc(e['degree'])}</i>", f"<i>{esc(e.get('dates', ''))}</i>", 'jk-row jk-sub')}{f'<p class="jk-note">{inline(e["note"])}</p>' if e.get('note') else ''}
    </div>''' for e in resume['education'])
    work = ''.join(f'''
    <div class="jk-entry">
      {row(f"<b>{esc(r['title'])}</b>", esc(r.get('dates', '')))}
      {row(f"<i>{esc(r['org'])}</i>", f"<i>{esc(r.get('place', ''))}</i>", 'jk-row jk-sub')}
      {points(r.get('points', []))}
    </div>''' for r in resume['experience'])
    projects = ''.join(f'''
    <div class="jk-entry">
      {row(f"<b>{esc(p['name'])}</b> | <i>{esc(p['tech'])}</i>" if p.get('tech') else f"<b>{esc(p['name'])}</b>", esc(p.get('dates', '')))}
      {points(p.get('points', []))}
    </div>''' for p in resume['projects'])
    skills = ''.join(f'<p><b>{esc(s["group"])}</b>: {esc(s["items"])}</p>' for s in resume['skills'])
    return f'''<article class="jake" aria-label="Resume of {esc(site["name"])}">
  <header class="jk-head">
    <p class="jk-name">{esc(site["name"])}</p>
    <p class="jk-contact">{contact}</p>
  </header>
  <section><h2>Education</h2>{edu}
  </section>
  <section><h2>Experience</h2>{work}
  </section>
  <section><h2>Projects</h2>{projects}
  </section>
  <section><h2>Technical Skills</h2>
    <div class="jk-skills">{skills}</div>
  </section>
</article>'''


def resume_main(site, resume, h):
    """Return the HTML inside <main> for resume.html: a short page head with Download PDF and
    Print, then the sheet itself; printing prints the sheet alone (pages.css)."""
    esc, pre = h['esc'], h.get('prefix', '')
    return f'''  <section class="ph solo rs-head" id="top" aria-labelledby="rs-title">
    <div class="ph-text">
      <p class="eyebrow"><span class="n">Resume</span><span>One page, US Letter</span></p>
      <h1 id="rs-title">{esc(site["name"])}</h1>
      <p class="ph-lede">The resume as a single page in Jake's Resume layout, the same as the PDF.</p>
      <div class="actions">
        <a class="btn" href="{pre}{esc(site["resume"])}" download>Download PDF</a>
        <button class="btn alt" type="button" onclick="window.print()">Print</button>
      </div>
    </div>
  </section>

  <section class="band soft rs-paper" aria-label="Resume">
    <div class="paper-wrap reveal">
{jake_html(site, resume, h)}
    </div>
  </section>'''
