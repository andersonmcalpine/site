# Anderson McAlpine Portfolio

A static site: plain HTML, CSS and JavaScript, with no framework and no dependencies beyond Python 3. All text lives in `content/`. `build.py` turns it into `index.html` and `work/*.html`, checks it, and checks every link.

## Edit Content

| What | Where |
|---|---|
| Name, web address, intro line, home page facts, email, LinkedIn, experience, education, skills, contact | `content/site.json` |
| The About page | `content/about.md` |
| The resume (page and PDF) | `content/resume.json` |
| A project | `content/projects/NN-slug.md` (the number sets the order) |
| Project images | `images/` |
| Demo data | `assets/data/` |

Edit those files only. The pages are rebuilt from them, so changes made directly in `index.html` or `work/` are overwritten.

## The Home Page

The home page reads top to bottom in plainly labelled bands that alternate light and dark, with a section bar that stays under the header:

- The first screen shows the name, `intro` and the `facts` list from `content/site.json` (each a `label` and a `value`; the email is added at the end), beside a particle field that cycles through every project's shape, five seconds each, with its title and link. Hovering pauses it; the numbers jump to a project and stop the cycle.
- About uses the title and the first sentence of the lede in `content/about.md`, plus the first section made of `###` items, one sentence each.
- Work shows one card per project in its colour (see `color` below).
- Experience and Education form one timeline from `experience` and `education`; Skills lists `skills`; Contact uses `contact`.

## Add a Project

Copy an existing project file, rename it with the next number, and edit it:

```markdown
---
kind: Robotics
context: independent project
year: 2026
shape: arm
color: dusk
summary: One sentence for the home page.
lede: One or two sentences that open the project page.
result: 0.90
result_label: what the number measures
details:
- Status: Ongoing
- Tools: Python, C++
---

# Project Title

## A Section

A paragraph. Leave a blank line between paragraphs.

![Alt text describing the image](images/photo.jpg "Caption shown under the image.")
```

- `color` is the project's colour: its card on the home page and the background of its page. One of `dusk`, `sage`, `ochre`, `clay`, `rose` or `mauve`.
- `shape` picks the particle shape: `arm`, `sorter`, `bolt`, `gear`, `ball`, `servo`, `dust`, `dashboard` (the NBA screen; it draws the curve from the page's `winprob` demo, so that page needs one with `src=`), or particle lettering such as `text:Drone` (use `|` for a second line).
- `year` and `context` are optional; everything else is required.
- Images need alt text and a caption. Figures sit in the text column; on a project's page, photos and screenshots are toned into its colour and show full colour on hover.
- Several image lines with no blank line between them become a row of smaller tiles, each with its own caption; with an odd count the first spans the row. Use this for screenshots, so no single one fills the screen.
- An SVG path is read from `content/` (for example `figures/gear-confusion.svg`) and written into the page so the site's styles colour it.
- An interactive demo is one line: `[[demo NAME "Caption."]]`, with `src=assets/data/file.json` for demos that read data. The demos are `gearbox`, `obb`, `vibration`, `winprob`, `pwm` and `sort` (in `assets/demos.js`).

## The Resume

`content/resume.json` holds the resume: education, experience, projects with their tools and dates, and skill groups, each entry with its bullet points. `resume.html` shows it as one Letter page in Jake's Resume layout (`assets/jake.css`), and printing that page prints the sheet alone.

On a Mac the build also renders the same sheet to `resume.pdf` with WebKit (`tools/resume.py` and `tools/pdf.swift`). The PDF keeps real text in reading order, with the bullets as text, and sets the title, author, subject and keywords (every skill), so applicant-tracking software and AI screeners read it cleanly. The build stops if the resume runs past one page. The home and resume pages also carry the same facts as structured data (schema.org `Person`).

## Charts

The charts are SVG files in `content/figures/`, drawn by `tools/charts.py` from the data in `content/data/`. They carry no colours of their own, so each one takes its project's colour. After changing the data or the drawing code:

```bash
python3 tools/charts.py
```

`--arm` re-exports the arm data from the simulator in the Robotic Arm repository's `sim/` folder (those charts are off the page while its geometry is a placeholder). `--gear DIR` reruns the DS 3000 notebook's classical pipeline on the course CSVs in `DIR` (needs numpy, pandas and scikit-learn) and writes `content/data/gear-results.json` and `assets/data/gear-test.json`. Each data file names its source.

## Build and Check

```bash
python3 build.py
```

It stops with a list of problems, and writes nothing, if a field is missing, a shape is unknown, an image or demo is missing, or any link or anchor points nowhere. It also writes `404.html`, `sitemap.xml` and `robots.txt`, and on a Mac redraws the link-preview images in `images/og/` (see `tools/og.py`) and `resume.pdf` (see below). To check without writing:

```bash
python3 build.py --check
```

## Preview

```bash
python3 tools/serve.py
```

Then open http://localhost:8800. The particle effects need the page served over HTTP, not opened as a file. This server tells the browser not to reuse old copies, so a rebuilt page shows up on the next visit; with `python3 -m http.server` the browser can keep showing an older build until a hard refresh.
