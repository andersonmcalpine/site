"""Build the portfolio site from content/ into index.html and work/*.html.

    python3 build.py          check the content, write the pages, then check every link
    python3 build.py --check  the same checks without writing anything

Content lives in content/site.json and content/projects/NN-slug.md (see README.md).
The pages are plain HTML next to this file, so the folder can be served as it is.
Only the Python standard library is used.
"""
import hashlib
import html
import json
import re
import sys
from pathlib import Path

import build_pages

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / 'content'
MARK = '<!-- Built from content/ by build.py. Edit the content, then run python3 build.py. -->'
SHAPES = {'arm', 'sorter', 'bolt', 'gear', 'ball', 'servo', 'dashboard', 'dust'}
REQUIRED = ['kind', 'shape', 'color', 'summary', 'lede']
# Project colours: each case page is tinted with its project's colour (the .theme-* classes in
# assets/site.css), and the home page's project cards use the same colour.
COLORS = {'dusk': '#8C9AC0', 'sage': '#8EA48A', 'ochre': '#D2A24C', 'clay': '#C2775C', 'rose': '#C9ADA7', 'mauve': '#B3A7B1'}
ARROW = '<span class="ar" aria-hidden="true">↗</span>'
DEMOS = {'gearbox', 'obb', 'vibration', 'winprob', 'pwm', 'sort'}
# [[demo NAME "Caption."]] or [[demo NAME "Caption." src=assets/data/file.json]]
DEMO = re.compile(r'^\[\[demo (?P<name>[a-z]+) "(?P<cap>[^"]+)"(?: src=(?P<src>\S+))?\]\]$')
IMAGE = re.compile(r'^!\[(?P<alt>[^\]]*)\]\((?P<src>\S+?)(?:\s+"(?P<cap>[^"]*)")?\)$')

errors = []


def fail(where, message):
    errors.append(f'{where}: {message}')


def esc(text):
    return html.escape(str(text), quote=True)


def inline(text):
    """Escape text and turn [label](url) into links."""
    out, pos = [], 0
    for m in re.finditer(r'\[([^\]]+)\]\(([^)\s]+)\)', text):
        out.append(esc(text[pos:m.start()]))
        out.append(f'<a href="{esc(m.group(2))}">{esc(m.group(1))}</a>')
        pos = m.end()
    out.append(esc(text[pos:]))
    return ''.join(out)


# Content

def read_front_matter(block, where):
    meta, key = {}, None
    for n, line in enumerate(block.splitlines(), 2):
        if line.startswith('- '):
            if key is None:
                fail(f'{where}:{n}', 'list item with no key above it')
                continue
            if not isinstance(meta[key], list):
                meta[key] = []
            meta[key].append(line[2:].strip())
        elif ':' in line:
            key, value = (part.strip() for part in line.split(':', 1))
            meta[key] = value
        elif line.strip():
            fail(f'{where}:{n}', f'cannot read "{line.strip()}"; write it as key: value')
    return meta


def read_project(path):
    where = path.relative_to(ROOT)
    name = re.fullmatch(r'(\d+)-([a-z0-9-]+)\.md', path.name)
    if not name:
        fail(where, 'name the file NN-slug.md, for example 05-drone.md')
        return None
    text = path.read_text(encoding='utf-8')
    fm = re.match(r'---\n(.*?)\n---\n', text, re.S)
    if not fm:
        fail(where, 'start the file with a --- front matter block')
        return None
    meta = read_front_matter(fm.group(1), where)
    body = text[fm.end():]
    title = re.search(r'^# (.+)$', body, re.M)
    if not title:
        fail(where, 'add the project title as a # heading under the front matter')
        return None
    p = dict(meta, slug=name.group(2), order=int(name.group(1)), title=title.group(1).strip(), where=where)

    for key in REQUIRED:
        if not str(p.get(key, '')).strip():
            fail(where, f'"{key}" is missing or empty')
    # The headline figure is optional (only for a measured, meaningful result), but needs both parts.
    if bool(str(p.get('result', '')).strip()) != bool(str(p.get('result_label', '')).strip()):
        fail(where, 'give both "result" and "result_label", or neither')
    shape = p.get('shape', '')
    if shape not in SHAPES and not shape.startswith('text:'):
        fail(where, f'shape "{shape}" is not one of {", ".join(sorted(SHAPES))}, or text:Word')
    if p.get('color') and p['color'] not in COLORS:
        fail(where, f'color "{p["color"]}" is not one of {", ".join(COLORS)}')
    details = p.get('details') or []
    if isinstance(details, str):
        details = [details] if details else []
    p['details'] = []
    for item in details:
        label, sep, value = item.partition(':')
        if not sep or not value.strip():
            fail(where, f'detail "{item}" needs the form Label: value')
        p['details'].append((label.strip(), value.strip()))

    p['sections'] = []
    for chunk in re.split(r'^## ', body[title.end():], flags=re.M)[1:]:
        head, _, rest = chunk.partition('\n')
        blocks = [b.strip() for b in re.split(r'\n\s*\n', rest) if b.strip()]
        for b in blocks:
            if b.startswith('[[demo'):
                demo = DEMO.match(b)
                if not demo:
                    fail(where, f'cannot read the demo line "{b[:60]}"; write [[demo NAME "Caption."]]')
                elif demo['name'] not in DEMOS:
                    fail(where, f'demo "{demo["name"]}" is not one of {", ".join(sorted(DEMOS))}')
                elif demo['src'] and not (ROOT / demo['src']).is_file():
                    fail(where, f'demo data {demo["src"]} does not exist')
                elif demo['name'] == 'winprob' and demo['src']:
                    p['curve'] = demo['src']
                continue
            # One image line is a figure; several lines with no blank line between are a row of tiles.
            for line in b.splitlines() if b.startswith('![') else []:
                img = IMAGE.match(line.strip())
                if not img:
                    fail(where, f'cannot read the image line "{line[:60]}"')
                    continue
                if not img['alt'].strip():
                    fail(where, f'{img["src"]} needs alt text')
                if not (img['cap'] or '').strip():
                    fail(where, f'{img["src"]} needs a caption in quotes')
                if not figure_file(img['src']).is_file():
                    fail(where, f'{img["src"]} does not exist')
        p['sections'].append((head.strip(), blocks))
    if not p['sections']:
        fail(where, 'add at least one ## section')
    if shape == 'dashboard' and not p.get('curve'):
        fail(where, 'the dashboard shape draws the game from a winprob demo; add one with src=')
    return p


def figure_file(src):
    # SVG figures live in content/ and are inlined so the site's CSS can style them.
    return CONTENT / src if src.endswith('.svg') else ROOT / src


def load():
    site = json.loads((CONTENT / 'site.json').read_text(encoding='utf-8'))
    for key in ('name', 'url', 'title', 'description', 'intro', 'about', 'email', 'linkedin', 'resume', 'contact'):
        if not site.get(key):
            fail('content/site.json', f'"{key}" is missing or empty')
    projects = [p for p in map(read_project, sorted((CONTENT / 'projects').glob('*.md'))) if p]
    if not projects:
        fail('content/projects', 'no projects found')
    seen = {}
    for p in projects:
        if p['slug'] in seen:
            fail(p['where'], f'slug "{p["slug"]}" is also used by {seen[p["slug"]]}')
        seen[p['slug']] = p['where']
    for n, fact in enumerate(site.get('facts', []), 1):
        if not fact.get('label') or not fact.get('value'):
            fail('content/site.json', f'fact {n} needs a "label" and a "value"')
    projects.sort(key=lambda p: p['order'])
    for i, p in enumerate(projects):
        p['num'] = f'{i + 1:02d}'
    return site, projects


# Templates

def dashboard_curve(projects):
    """The game the dashboard shape draws: the curve of its project's winprob demo, sampled at
    161 even steps in time, with time and win probability both from 0 to 1."""
    src = next((p['curve'] for p in projects if p['shape'] == 'dashboard'), None)
    if not src:
        return None
    pts = json.loads((ROOT / src).read_text(encoding='utf-8'))['points']
    end, out, j = pts[-1][0], [], 0
    for k in range(161):
        t = end * k / 160
        while j < len(pts) - 1 and pts[j + 1][0] <= t:
            j += 1
        out.append([round(t / end, 3), round(pts[j][1], 3)])
    return out


def site_data(site, projects):
    data = {
        'projects': [{'id': p['slug'], 'title': p['title'], 'num': p['num']} for p in projects],
        'sections': [{'id': 'top', 'label': 'Home'}, {'id': 'work', 'label': 'Work'},
                     {'id': 'about', 'label': 'About', 'page': 'about.html'},
                     {'id': 'experience', 'label': 'Experience and Education'},
                     {'id': 'skills', 'label': 'Skills'},
                     {'id': 'contact', 'label': 'Contact'},
                     {'id': 'resume', 'label': 'Resume', 'page': 'resume.html'}],
        'email': site['email'], 'linkedin': site['linkedin'], 'resume': site['resume'],
    }
    curve = dashboard_curve(projects)
    if curve:
        data['curve'] = curve
    return json.dumps(data, ensure_ascii=False).replace('</', '<\\/')


def asset(prefix, name):
    """Link an asset with a fingerprint of its contents, so browsers fetch it again after any change."""
    digest = hashlib.sha1((ROOT / 'assets' / name).read_bytes()).hexdigest()[:8]
    return f'{prefix}assets/{name}?v={digest}'


def page(site, projects, *, title, description, prefix, note, nav, main, demos=False, path='', og='home',
         html_class='', theme='', cloud=True, styles=(), head=''):
    """One page. theme tints it with a project colour; cloud adds the fixed particle canvas;
    styles are extra stylesheets in assets/; head is extra markup for <head>, such as structured data."""
    sprite = (ROOT / 'assets' / 'sprite.svg').read_text(encoding='utf-8').strip()
    if theme:
        html_class = f'{html_class} tinted theme-{theme}'.strip()
    tone = COLORS.get(theme, '#22223B')
    extra = ''.join(f'\n<link rel="stylesheet" href="{asset(prefix, name)}">' for name in styles)
    canvas = '<canvas class="cloud" aria-hidden="true"></canvas>\n' if cloud else ''
    top = ('#top', 'Back to Top') if path == '' else (f'{prefix}index.html', 'Home')
    return f'''<!doctype html>
<html lang="en"{f' class="{html_class}"' if html_class else ''}>
<head>
{MARK}
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.classList.add('js')</script>
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="theme-color" content="{tone}">
<link rel="canonical" href="{esc(site["url"] + path)}">
<link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="{prefix}assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="{prefix}assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(site["name"])}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(site["url"] + path)}">
<meta property="og:image" content="{esc(site["url"])}images/og/{og}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Poppins:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="{asset(prefix, 'site.css')}">
<link rel="stylesheet" href="{asset(prefix, 'nav.css')}">
<link rel="stylesheet" href="{asset(prefix, 'pages.css')}">{extra}{f"""
<link rel="stylesheet" href="{asset(prefix, 'demos.css')}">""" if demos else ""}
<script src="{asset(prefix, 'cloud.js')}" defer></script>
<script src="{asset(prefix, 'site.js')}" defer></script>
<script src="{asset(prefix, 'nav.js')}" defer></script>{f"""
<script src="{asset(prefix, 'demos.js')}" defer></script>""" if demos else ""}
<script type="application/json" id="site-data">{site_data(site, projects)}</script>{head}
</head>
<body>
{sprite}
<a class="skip" href="#main">Skip to Content</a>
{canvas}
<header class="hd">
  <div class="hd-bar">
    <a class="brand" href="{prefix}index.html" aria-label="{esc(site['name'])}, home"><i class="sq" aria-hidden="true"></i><span class="brand-name">{esc(site['name'])}</span></a>
    {note}
    <nav class="hd-links" aria-label="Main">
{nav}
    </nav>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
  </div>
</header>

<main id="main">
{main}
</main>

<footer class="ft">
  <div class="wrap ft-row">
    <span>{esc(site['name'])}, {esc(site.get('location', ''))}</span>
    <a href="{top[0]}">{top[1]}</a>
  </div>
</footer>
</body>
</html>
'''


def nav_links(site, prefix, on_home, current=''):
    rows = []
    for key, label, target in (('work', 'Work', None), ('about', 'About', 'about.html'), ('experience', 'Experience', None),
                               ('contact', 'Contact', None), ('resume', 'Resume', 'resume.html')):
        if target:
            mark = ' aria-current="true"' if key == current else ''
            rows.append(f'      <a href="{prefix}{target}"{mark}>{label}</a>')
            continue
        # On the home page the links scroll and track the section in view.
        href = f'#{key}' if on_home else f'{prefix}index.html#{key}'
        spy = f' data-spy="{key}"' if on_home else ''
        rows.append(f'      <a href="{href}"{spy}>{label}</a>')
    return '\n'.join(rows)


def kind_line(*parts):
    return ''.join(f'<span>{esc(x)}</span>' for x in parts if x)


def first_image(p):
    """The first photo or render in a project: the opening screen shows it when there is no WebGL."""
    for _, blocks in p['sections']:
        for b in blocks:
            img = IMAGE.match(b)
            if img and not img['src'].endswith('.svg'):
                return img['src']
    return ''


def sentence(text):
    m = re.match(r'(.+?[.!?])(?:\s|$)', text)
    return m.group(1) if m else text


def approach(about):
    """The first about.md section made of ### items, as (heading, [(title, first sentence)])."""
    for head, items in about['sections']:
        rows, title = [], None
        for kind, value in items:
            if kind == 'h3':
                title = value
            elif kind == 'p' and title:
                rows.append((title, sentence(value)))
                title = None
        if rows:
            return head, rows
    return '', []


def band_head(num, label, sid, head):
    return (f'    <header class="band-hd cols">\n'
            f'      <p class="eyebrow"><span class="n">{num}</span>{esc(label)}</p>\n'
            f'      <h2 id="{sid}-h">{esc(head)}</h2>\n'
            f'    </header>')


def timeline(head, items, sid=''):
    anchor = f' id="{sid}"' if sid else ''
    rows = ''.join(f'''
      <div class="tl-item">
        <p class="tl-date">{esc(r["dates"])}</p>
        <div class="tl-card">
          <h4>{esc(r["title"])}</h4>
          <p class="tl-org">{esc(r["org"])}</p>
          <p>{inline(r["text"])}</p>
        </div>
      </div>''' for r in items)
    return f'\n      <h3 class="tl-h"{anchor}><span>{esc(head)}</span></h3>{rows}'


def card(p, prefix=''):
    """A project card in the project's colour; the whole card is the link (its ::before covers it).
    The panel carries the project number and, when the project has one, its headline figure."""
    fig = (f'\n          <p class="card-fig"><b>{esc(p["result"])}</b><span>{esc(p["result_label"])}</span></p>'
           if p.get('result') else '')
    return f'''
      <article class="card theme-{p["color"]} reveal" aria-labelledby="c-{p["slug"]}">
        <div class="card-panel">
          <span class="num-o" aria-hidden="true">{p["num"]}</span>{fig}
        </div>
        <div class="card-body">
          <p class="card-meta">{kind_line(p["kind"], p.get("year"))}</p>
          <h3 id="c-{p["slug"]}" style="view-transition-name: t-{p["slug"]}">{esc(p["title"])}</h3>
          <p class="card-sum">{inline(p["summary"])}</p>
          <a class="link stretch" href="{prefix}work/{p["slug"]}.html" aria-label="View Project: {esc(p["title"])}"><span class="u">View Project</span> {ARROW}</a>
        </div>
      </article>'''


def skill_rows(site):
    return ''.join(f'''
      <div class="sk cols">
        <h3>{esc(s["group"])}</h3>
        <ul class="tags">{"".join(f"<li>{esc(x.strip())}</li>" for x in s["items"].split(","))}</ul>
      </div>''' for s in site.get('skills', []))


BAR = (('about', 'About'), ('work', 'Work'), ('experience', 'Experience'), ('education', 'Education'),
       ('skills', 'Skills'), ('contact', 'Contact'))


def home(site, projects, about, resume):
    """The home page: name and facts beside the first project's particles, a section bar,
    then About, Work, Experience and Education, Skills and Contact in alternating bands."""
    first, c = projects[0], site['contact']
    # The opening field cycles through every project (site.js); the numbers jump to one.
    cycle = [{'shape': p['shape'], 'href': f'work/{p["slug"]}.html', 'num': p['num'], 'title': p['title']} for p in projects]
    cycle_buttons = ''.join(f'<button class="cy-n" type="button" aria-label="{p["num"]}, {esc(p["title"])}" '
                            f'aria-pressed="{"true" if i == 0 else "false"}">{p["num"]}</button>'
                            for i, p in enumerate(projects))
    img = first_image(first)
    fallback = f'\n      <img class="field-img" src="{esc(img)}" alt="" width="960" height="540">' if img else ''
    facts = ''.join(f'\n        <div><dt>{esc(f["label"])}</dt><dd>{inline(f["value"])}</dd></div>'
                    for f in site.get('facts', []))
    facts += f'\n        <div><dt>Email</dt><dd><a href="mailto:{esc(site["email"])}">{esc(site["email"])}</a></dd></div>'
    name = ' '.join(f'<span>{esc(w)}</span>' for w in site['name'].split())
    bar = ''.join(f'\n        <a href="#{k}">{v}</a>' for k, v in BAR)
    how_head, how = approach(about)
    how_html = ''.join(f'\n        <li>\n          <h4>{esc(a)}</h4>\n          <p>{inline(b)}</p>\n        </li>' for a, b in how)
    how_block = f'''
    <div class="cols how">
      <h3 class="eyebrow">{esc(how_head)}</h3>
      <ul class="how-list">{how_html}
      </ul>
    </div>''' if how else ''
    word = c.get('lettering', 'Hello')
    main = f'''  <section class="hero" id="top" aria-labelledby="hero-h">
    <div class="hero-text">
      <h1 id="hero-h">{name}</h1>
      <p class="hero-role">{inline(site["intro"])}</p>
      <dl class="facts">{facts}
      </dl>
      <div class="actions">
        <a class="btn" href="{esc(site["resume"])}" download>Download Resume</a>
        <a class="btn alt" href="#contact">Contact</a>
      </div>
    </div>
    <div class="field dark cycle" data-shape="{esc(first["shape"])}" data-cycle="{esc(json.dumps(cycle, ensure_ascii=False))}">{fallback}
      <canvas class="field-cloud" aria-hidden="true" data-parallax="0.25"></canvas>
      <a class="field-link" href="work/{first["slug"]}.html"><span class="field-cap"><span class="n">{first["num"]}</span><span class="u">{esc(first["title"])}</span> {ARROW}</span></a>
      <div class="cy" role="group" aria-label="Projects">{cycle_buttons}</div>
    </div>
  </section>

  <nav class="bar" aria-label="Sections">
    <div class="bar-in">
      <div class="bar-list">{bar}
        <span class="bar-ind" aria-hidden="true"></span>
      </div>
    </div>
  </nav>

  <section class="band dark" id="about" aria-labelledby="about-h">
{band_head("01", "About", "about", about["title"])}
    <div class="cols about reveal">
      <div class="about-main">
        <p class="lead">{inline(sentence(about["lede"]))}</p>
        <a class="link" href="about.html"><span class="u">Full Profile</span> {ARROW}</a>
      </div>
    </div>{how_block}
  </section>

  <section class="band light" id="work" aria-labelledby="work-h">
{band_head("02", "Work", "work", "Selected Projects")}
    <div class="cards">{"".join(card(p) for p in projects)}
    </div>
  </section>

  <section class="band dark deep" id="experience" aria-labelledby="experience-h">
{band_head("03", "Experience", "experience", "Experience and Education")}
    <div class="tl">
      <span class="tl-fill" aria-hidden="true"></span>{timeline("Experience", site.get("experience", []))}{timeline("Education", site.get("education", []), "education")}
    </div>
  </section>

  <section class="band light soft" id="skills" aria-labelledby="skills-h">
{band_head("04", "Skills", "skills", "Technical Skills")}
    <div class="sk-list">{skill_rows(site)}
    </div>
  </section>

  <section class="band dark night" id="contact" aria-labelledby="contact-h">
{band_head("05", "Contact", "contact", c.get("heading", "Get in Touch"))}
    <div class="cols">
      <div class="reach">
        <div class="reach-text">
          <p class="reach-note">{inline(c.get("note", ""))}</p>
          <a class="email link" href="mailto:{esc(site["email"])}"><span class="u">{esc(site["email"]).replace("@", "<wbr>@")}</span></a>
          <div class="links">
            <button class="link" type="button" data-copy="{esc(site["email"])}" aria-live="polite"><span class="u">Copy Email</span></button>
            <a class="link" href="{esc(site["linkedin"])}"><span class="u">LinkedIn</span> {ARROW}</a>
            <a class="link" href="{esc(site["resume"])}" download><span class="u">Download Resume</span> {ARROW}</a>
          </div>
        </div>
        <div class="field hello" data-shape="text:{esc(word)}">
          <p class="field-word" aria-hidden="true">{esc(word)}</p>
          <canvas class="field-cloud" aria-hidden="true"></canvas>
        </div>
      </div>
    </div>
  </section>'''
    return page(site, projects, title=site['title'], description=site['description'], prefix='',
                note='', nav=nav_links(site, '', True), main=main, path='', og='home',
                html_class='home light', cloud=False, styles=('home.css',), head=person_ld(site, resume))


def about_page(site, projects, about, h):
    return page(site, projects, title=f'About | {site["name"]}', description=about.get('lede') or site['description'], prefix='',
                note='<p class="hd-note note">About</p>', nav=nav_links(site, '', False, 'about'),
                main=build_pages.about_main(site, projects, about, h), path='about.html', og='about',
                html_class='light', cloud=False)


def resume_page(site, projects, resume, h):
    return page(site, projects, title=f'Resume | {site["name"]}', description=site['description'], prefix='',
                note='<p class="hd-note note">Resume</p>', nav=nav_links(site, '', False, 'resume'),
                main=build_pages.resume_main(site, resume, h), path='resume.html', og='resume',
                html_class='light', cloud=False, styles=('jake.css',), head=person_ld(site, resume))


def block_html(block, prefix):
    demo = DEMO.match(block)
    if demo:
        src = f' data-src="{prefix}{esc(demo["src"])}"' if demo['src'] else ''
        return (f'    <figure class="c-fig wrap reveal demo-fig">\n      <div class="demo" data-demo="{demo["name"]}"{src}></div>\n'
                f'      <figcaption>{inline(demo["cap"])}</figcaption>\n    </figure>')
    lines = block.splitlines()
    if all(line.startswith('- ') for line in lines):
        # A list; "Term: text" items lead with the term.
        items = []
        for line in lines:
            term, sep, rest = line[2:].partition(': ')
            items.append(f'<li><b>{esc(term)}</b> {inline(rest)}</li>' if sep else f'<li>{inline(line[2:])}</li>')
        return '        <ul class="c-list">\n          ' + '\n          '.join(items) + '\n        </ul>'
    if not block.startswith('!['):
        return f'        <p>{inline(" ".join(block.split()))}</p>'
    imgs = [IMAGE.match(line.strip()) for line in block.splitlines()]
    if len(imgs) == 1:
        media, cap = figure_media(imgs[0], prefix)
        kind = ' c-chart' if imgs[0]['src'].endswith('.svg') else ''
        return f'    <figure class="c-fig c-side{kind} wrap reveal">\n      {media}\n      <figcaption>{inline(cap)}</figcaption>\n    </figure>'
    # A row of smaller tiles, each with its own caption; with an odd count the first spans the row.
    tiles = []
    for k, img in enumerate(imgs):
        media, cap = figure_media(img, prefix)
        wide = ' wide' if len(imgs) % 2 and k == 0 else ''
        tiles.append(f'      <figure class="tile{wide}">\n        {media}\n        <figcaption>{inline(cap)}</figcaption>\n      </figure>')
    return f'    <div class="c-fig c-side c-tiles wrap reveal">\n' + '\n'.join(tiles) + '\n    </div>'


def figure_media(img, prefix):
    """An image's markup and caption: an SVG is written into the page so the site's CSS colours it;
    a photo or screenshot is toned into the page until hovered; clicking it does nothing."""
    src, alt, cap = img['src'], img['alt'], (img['cap'] or '').strip()
    if src.endswith('.svg'):
        svg = figure_file(src).read_text(encoding='utf-8').strip()
        svg = re.sub(r'<title id="[^"]*">.*?</title>', '', svg, count=1, flags=re.S)
        return svg.replace('<svg ', f'<svg aria-label="{esc(alt)}" ', 1), cap
    return (f'<span class="duo"><img src="{prefix}{esc(src)}" alt="{esc(alt)}" loading="lazy"></span>'), f'{cap} Hover for full colour.'


def case(site, projects, i):
    p, n = projects[i], projects[(i + 1) % len(projects)]
    prefix = '../'
    secs = []
    for k, (head, blocks) in enumerate(p['sections']):
        figs = [b for b in blocks if b.startswith('![') or DEMO.match(b)]
        paras = [b for b in blocks if b not in figs]
        body = '\n'.join(block_html(b, prefix) for b in paras)
        figures = '\n'.join(block_html(b, prefix) for b in figs)
        secs.append(f'''  <section class="c-sec" data-cloud data-shape="dust" data-x="0" data-y="0" data-s="1.15" data-a="0.3" aria-labelledby="s-{k}">
    <div class="wrap grid">
      <h2 id="s-{k}" class="reveal">{esc(head)}</h2>
      <div class="c-body reveal">
{body}
      </div>
    </div>
{figures}
  </section>''')
    details = '\n'.join(f'        <div><dt>{esc(a)}</dt><dd>{inline(b)}</dd></div>' for a, b in p['details'])
    context = ', '.join(x for x in (p['kind'], p.get('context')) if x)
    kind = kind_line(p['num'], context, p.get('year'))
    res, res_row = '', ''
    if p.get('result'):
        res = f'      <p class="res rise" style="--d:220ms"><b>{esc(p["result"])}</b><span>{esc(p["result_label"])}</span></p>\n'
        res_row = f'        <div><dt>Result</dt><dd><b>{esc(p["result"])}</b>{esc(p["result_label"])}</dd></div>\n'
    # Lettering is 2.8 units wide in the engine, against about 1.7 for the solid shapes,
    # so it is drawn smaller and a little further left to stay inside a 4:3 window.
    x, scale = ('0.5', '0.44') if p['shape'].startswith('text:') else ('0.56', '0.86')
    main = f'''  <section class="scene c-scene" data-cloud data-shape="{esc(p["shape"])}" data-x="{x}" data-y="-0.04" data-s="{scale}" data-a="1" aria-labelledby="c-title">
    <div class="dots rise" style="--d:200ms" aria-hidden="true"></div>
    <div class="giant rise" data-parallax="0.3" aria-hidden="true"><span>{p["num"]}</span></div>
    <i class="hair mid rise" style="--d:320ms" aria-hidden="true"></i>
    <div class="copy">
      <a class="back rise" href="{prefix}index.html#work">All Work</a>
      <p class="kind rise" style="--d:60ms">{kind}</p>
      <h1 class="title" id="c-title" style="view-transition-name: t-{p["slug"]}">{esc(p["title"])}</h1>
      <p class="blurb rise" style="--d:160ms">{inline(p["lede"])}</p>
{res}    </div>
  </section>

  <section class="c-sec" data-cloud data-shape="dust" data-x="0" data-y="0" data-s="1.15" data-a="0.3" aria-label="Project details">
    <div class="wrap">
      <dl class="c-meta reveal">
{details}
{res_row}      </dl>
    </div>
  </section>

{chr(10).join(secs)}

  <section class="c-sec c-next" data-cloud data-shape="dust" data-x="0" data-y="0" data-s="1.15" data-a="0.3" aria-labelledby="next-h">
    <div class="wrap">
      <h2 class="next-label" id="next-h">Next Project</h2>
      <div class="cards">{card(n, prefix)}
      </div>
    </div>
  </section>'''
    note = f'<p class="hd-note note">Project {p["num"]} of {len(projects):02d}. {esc(context)}.</p>'
    has_demo = any(DEMO.match(b) for _, blocks in p['sections'] for b in blocks)
    return page(site, projects, title=f'{p["title"]} | {site["name"]}', description=p['summary'], prefix=prefix,
                note=note, nav=nav_links(site, prefix, False), main=main, demos=has_demo,
                path=f'work/{p["slug"]}.html', og=p['slug'], theme=p['color'])


def not_found(site, projects):
    base = site['url']
    main = f'''  <section class="ph solo nf" id="top" aria-labelledby="nf-title">
    <div class="ph-text">
      <p class="eyebrow"><span class="n">404</span><span>Page not found</span></p>
      <h1 id="nf-title">Page Not Found</h1>
      <p class="ph-lede">The link may be out of date or mistyped. The work, the About page and the resume are a click away.</p>
      <div class="actions">
        <a class="btn" href="{base}">Go Home</a>
        <a class="btn alt" href="{base}#work">See the Work</a>
      </div>
    </div>
  </section>'''
    return page(site, projects, title=f'Page Not Found | {site["name"]}', description=site['description'], prefix=base,
                note='', nav=nav_links(site, base, False), main=main, path='404.html', og='home',
                html_class='light', cloud=False)


def sitemap(site, paths):
    urls = '\n'.join(f'  <url><loc>{esc(site["url"] + p)}</loc></url>' for p in paths)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'


def share_images(site, projects, about):
    """Redraw the link-preview images from the current titles (macOS only; keeps the old ones elsewhere)."""
    try:
        from tools.og import render
    except Exception as e:  # noqa: BLE001 - any import problem just means no redraw
        print(f'share images not redrawn ({e})')
        return
    jobs = [('home', site['name'], 'Robotics and AI engineering'),
            ('about', 'Mechatronics and AI Engineering', 'About'),
            ('resume', site['name'], 'Resume, open to internships from May 2027')]
    jobs += [(p['slug'], p['title'], f'Project {p["num"]}, {p["kind"]}') for p in projects]
    for name, title, kicker in jobs:
        try:
            render(ROOT / 'images' / 'og' / f'{name}.png', title, kicker, site['name'])
        except RuntimeError as e:
            fail(f'share image {name}', str(e))
        except Exception as e:  # noqa: BLE001 - no Swift here: keep the existing images
            print(f'share images not redrawn ({e})')
            return


def read_resume():
    """content/resume.json: the resume (Jake's Resume layout) behind resume.html and resume.pdf."""
    path = CONTENT / 'resume.json'
    try:
        resume = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:
        fail('content/resume.json', f'cannot read it ({e})')
        return {}
    for key in ('contact', 'education', 'experience', 'projects', 'skills'):
        if key not in resume:
            fail('content/resume.json', f'"{key}" is missing')
    for kind, need in (('education', ('school', 'degree')), ('experience', ('title', 'org')), ('projects', ('name',)),
                       ('skills', ('group', 'items'))):
        for n, item in enumerate(resume.get(kind, []), 1):
            for key in need:
                if not item.get(key):
                    fail('content/resume.json', f'{kind} {n} needs "{key}"')
    return resume


def keywords(resume):
    """Every skill on the resume, for the PDF's keywords and the structured data."""
    return [x.strip() for s in resume.get('skills', []) for x in s['items'].split(',') if x.strip()]


def person_ld(site, resume):
    """Structured data (schema.org Person) for search engines and AI readers: who, where, school, skills."""
    city, _, region = resume.get('contact', {}).get('location', '').partition(',')
    data = {
        '@context': 'https://schema.org', '@type': 'Person', 'name': site['name'], 'url': site['url'],
        'email': f'mailto:{site["email"]}', 'description': site['about'],
        'address': {'@type': 'PostalAddress', 'addressLocality': city.strip(), 'addressRegion': region.strip(), 'addressCountry': 'CA'},
        'alumniOf': [{'@type': 'CollegeOrUniversity', 'name': e['school']} for e in resume.get('education', [])],
        'knowsAbout': keywords(resume), 'sameAs': [site['linkedin']],
    }
    return '\n<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + '</script>'


def resume_pdf(site, resume, h):
    """Redraw resume.pdf from the resume sheet (macOS only; keeps the old PDF elsewhere)."""
    try:
        from tools.resume import render
    except Exception as e:  # noqa: BLE001 - any import problem just means no redraw
        print(f'resume.pdf not redrawn ({e})')
        return
    meta = {'title': f'{site["name"]} Resume', 'author': site['name'], 'subject': site['about'], 'keywords': keywords(resume)}
    try:
        render(build_pages.jake_html(site, resume, h), ROOT / site['resume'], meta)
    except RuntimeError as e:
        if 'past one page' in str(e):
            fail('content/resume.json', str(e))
        else:
            print(f'resume.pdf not redrawn ({e})')



# Checks on the finished pages

def check_links(pages):
    """Every local href and src must point at a file, and every #fragment at an id on that page."""
    ids = {path: set(re.findall(r'\sid="([^"]+)"', text)) for path, text in pages.items()}
    count = 0
    for path, text in pages.items():
        for ref in re.findall(r'\s(?:href|src)="([^"]+)"', text):
            if re.match(r'(https?:|mailto:|data:|//)', ref) or ref.startswith('https://fonts'):
                continue
            count += 1
            target, _, frag = ref.partition('#')
            target = target.split('?', 1)[0]
            file = (path.parent / target).resolve() if target else path
            if not file.exists() and file not in pages:
                fail(path.relative_to(ROOT), f'link to {ref}: no such file')
                continue
            if frag and frag != 'top' and file in pages and frag not in ids[file]:
                fail(path.relative_to(ROOT), f'link to {ref}: no element with id "{frag}"')
    return count


def main():
    write = '--check' not in sys.argv[1:]
    site, projects = load()
    about = build_pages.read_about(CONTENT / 'about.md', fail)
    if errors:
        report(1)
    h = {'esc': esc, 'inline': inline, 'ARROW': ARROW, 'prefix': ''}
    resume = read_resume()
    if errors:
        report(1)
    pages = {ROOT / 'index.html': home(site, projects, about, resume),
             ROOT / 'about.html': about_page(site, projects, about, h),
             ROOT / 'resume.html': resume_page(site, projects, resume, h),
             ROOT / '404.html': not_found(site, projects)}
    for i, p in enumerate(projects):
        pages[ROOT / 'work' / f'{p["slug"]}.html'] = case(site, projects, i)
    links = check_links(pages)
    if errors:
        report(1)
    if write:
        share_images(site, projects, about)
        resume_pdf(site, resume, h)
        if errors:
            report(1)
        listed = [str(path.relative_to(ROOT)) for path in pages if path.name != '404.html']
        (ROOT / 'sitemap.xml').write_text(sitemap(site, ['' if x == 'index.html' else x for x in listed]), encoding='utf-8')
        (ROOT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {site["url"]}sitemap.xml\n', encoding='utf-8')
        (ROOT / 'work').mkdir(exist_ok=True)
        for path, text in pages.items():
            path.write_text(text, encoding='utf-8')
        # Remove pages for projects that no longer exist, but only ones this script wrote.
        for old in (ROOT / 'work').glob('*.html'):
            if old not in pages and MARK in old.read_text(encoding='utf-8'):
                old.unlink()
                print(f'removed {old.relative_to(ROOT)} (its project is gone)')
    names = ', '.join(str(path.relative_to(ROOT)) for path in pages)
    print(f'{"Built" if write else "Checked"} {len(pages)} pages ({names}); {links} local links resolve.')


def report(code):
    print(f'Stopped: {len(errors)} problem{"s" if len(errors) != 1 else ""} to fix first.', file=sys.stderr)
    for e in errors:
        print(f'  {e}', file=sys.stderr)
    sys.exit(code)


if __name__ == '__main__':
    main()
