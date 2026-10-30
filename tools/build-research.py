#!/usr/bin/env python3
"""Build the research section (research/index.html + one page per article) from tools/research/*.html.
Each source file starts with a JSON header in an HTML comment, then the article body.
Run after editing any article:  python3 tools/build-research.py"""
import json, pathlib, re, html

root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'tools' / 'research'
out = root / 'research'
SITE = 'https://emacagency.github.io'

CATS = [('all', 'الكل'), ('space', 'الفضاء'), ('life', 'علوم الحياة'), ('health', 'الصحة العالمية'), ('climate', 'المناخ'), ('food', 'الغذاء'), ('water', 'المياه'), ('energy', 'الطاقة')]
ORDER = ['mars', 'cell', 'climate-carbon', 'food-security', 'freshwater', 'disease-map', 'water-sustainability', 'alternative-energy']

# card art: small hologram-style illustrations, 320x200
H = '#9FDCEB'
THUMB = {
 'mars': f'''<defs><radialGradient id="tm" cx=".38" cy=".36" r=".75"><stop offset="0" stop-color="#F6B08E" stop-opacity=".5"/><stop offset=".7" stop-color="#B5583A" stop-opacity=".25"/><stop offset="1" stop-color="#F2A07B" stop-opacity=".9"/></radialGradient></defs>
  <circle cx="200" cy="104" r="74" fill="url(#tm)"/><g fill="none" stroke="#F6C2A6" stroke-opacity=".35"><ellipse cx="200" cy="104" rx="74" ry="22"/><ellipse cx="200" cy="104" rx="74" ry="48"/><ellipse cx="200" cy="104" rx="30" ry="74"/><ellipse cx="200" cy="104" rx="56" ry="74"/></g>
  <ellipse cx="200" cy="104" rx="118" ry="30" fill="none" stroke="#F6C2A6" stroke-opacity=".3" stroke-dasharray="2 5" transform="rotate(-14 200 104)"/><circle cx="88" cy="128" r="5" fill="#F6C2A6"/>
  <g stroke="{H}"><line x1="226" y1="80" x2="238" y2="58"/><circle cx="238" cy="58" r="3" fill="{H}"/><line x1="176" y1="118" x2="160" y2="100"/><circle cx="160" cy="100" r="3" fill="{H}"/></g>
  <text x="244" y="54" fill="{H}" font-family="IBM Plex Mono" font-size="9">JEZERO 18.4N</text>''',
 'cell': f'''<g fill="none"><path d="M70 100c0-52 50-78 100-78s96 30 96 78-44 80-96 80-100-28-100-80z" stroke="{H}" stroke-opacity=".7" stroke-width="1.5"/><path d="M76 100c0-48 46-72 94-72s90 28 90 72-42 74-90 74-94-26-94-74z" stroke="{H}" stroke-opacity=".2"/>
  <circle cx="150" cy="98" r="34" stroke="#B9A6F2" stroke-width="1.5"/><circle cx="150" cy="98" r="34" fill="#B9A6F2" fill-opacity=".12"/><circle cx="144" cy="94" r="10" fill="#E0D3FC" fill-opacity=".5"/>
  <path d="M106 80c8-26 60-34 82-6M104 118c10 26 66 30 86 4M110 70c14-20 60-24 80 0" stroke="#7FD4C1" stroke-opacity=".6"/>
  <g stroke="#F59E7C" stroke-width="1.5"><rect x="206" y="66" width="34" height="14" rx="7" transform="rotate(20 223 73)"/><rect x="196" y="126" width="30" height="13" rx="6.5" transform="rotate(-30 211 132)"/><rect x="96" y="140" width="30" height="12" rx="6" transform="rotate(12 111 146)"/></g>
  <path d="M214 98a16 10 0 0 1 24 0M212 104a18 11 0 0 1 28 0M210 110a20 12 0 0 1 32 0" stroke="#F2C46B"/></g>
  <g fill="#BFE9F5" fill-opacity=".7"><circle cx="190" cy="60" r="1.4"/><circle cx="120" cy="56" r="1.4"/><circle cx="230" cy="150" r="1.4"/><circle cx="96" cy="104" r="1.4"/><circle cx="180" cy="150" r="1.4"/><circle cx="250" cy="96" r="1.4"/><circle cx="138" cy="148" r="1.4"/><circle cx="200" cy="40" r="1.4"/></g>''',
 'climate-carbon': ''.join(f'<rect x="{20 + i * 2}" y="26" width="2.2" height="70" fill="{c}"/>' for i, c in enumerate(['#2E6DA4'] * 8 + ['#3A6C98', '#2F5F8C', '#254F78', '#20232E', '#2E5A84'] * 4 + ['#20232E'] * 20 + ['#5B3A36', '#7A3F33', '#20232E', '#96452F', '#B04A33', '#7A3F33', '#C34E35', '#D3513A', '#B04A33', '#E0533A', '#E0533A', '#D3513A', '#E0533A', '#E0533A', '#E0533A', '#E0533A', '#E0533A'] * 4 + ['#E0533A'] * 10)) +
   f'<path d="M20 180 C80 178 120 170 160 160 S240 130 300 112" fill="none" stroke="#E27A55" stroke-width="2"/><path d="M20 180 C80 178 120 170 160 160 S240 130 300 112 V184 H20z" fill="#E27A55" fill-opacity=".12"/><text x="300" y="104" text-anchor="end" fill="#F7A285" font-family="IBM Plex Mono" font-size="10">38.6 Gt CO₂</text><text x="300" y="20" text-anchor="end" fill="{H}" font-family="IBM Plex Mono" font-size="10">1880 → 2025</text>',
 'food-security': f'''<g fill="none" stroke="{H}" stroke-opacity=".18"><path d="M20 70h280M20 110h280M20 150h280"/></g>
  <g fill="#cb8d3e"><path d="M120 80l14-6 22 4 14 14-6 22 8 18-14 22-20 4-14-16-8-22-10-14z" fill-opacity=".75"/><path d="M60 60l26-8 16 10-6 16-22 4-16-8z" fill-opacity=".35"/><path d="M190 64l40-6 36 8 10 18-14 16-28 6-22-10-16-14z" fill-opacity=".45"/><path d="M230 120l18 4 6 14-10 12-14-6z" fill-opacity=".65"/></g>
  <g fill="#f6d4ae"><path d="M142 120l10 10-4 14-10-4z"/></g>
  <text x="300" y="186" text-anchor="end" fill="#E2B076" font-family="IBM Plex Mono" font-size="11">673M · 8.2%</text>''',
 'freshwater': f'''<g fill="none" stroke="#55a5d1"><path d="M160 30c30 40 52 64 52 92a52 52 0 0 1-104 0c0-28 22-52 52-92z" stroke-width="1.6"/><path d="M160 30c30 40 52 64 52 92a52 52 0 0 1-104 0c0-28 22-52 52-92z" fill="#2584b2" fill-opacity=".14"/>
  <path d="M116 132c14 8 30 8 44 0s30-8 44 0" stroke-opacity=".7"/><path d="M118 146c14 8 28 8 42 0s28-8 42 0" stroke-opacity=".45"/></g>
  <g fill="#87c3e7" font-family="IBM Plex Mono" font-size="10"><text x="40" y="60">2.5% FRESH</text><text x="40" y="76" fill-opacity=".6">97.5% SALT</text><text x="230" y="176">2.1B</text></g>''',
 'disease-map': f'''<g fill="none" stroke="{H}" stroke-opacity=".14"><ellipse cx="160" cy="100" rx="140" ry="76"/><path d="M20 100h280M160 24v152"/></g>
  <g fill="#df7789"><circle cx="164" cy="112" r="16" fill-opacity=".35"/><circle cx="164" cy="112" r="7"/><circle cx="148" cy="98" r="11" fill-opacity=".3"/><circle cx="148" cy="98" r="4"/><circle cx="220" cy="92" r="13" fill-opacity=".3"/><circle cx="220" cy="92" r="5"/><circle cx="252" cy="118" r="10" fill-opacity=".28"/><circle cx="252" cy="118" r="4"/><circle cx="96" cy="118" r="6" fill-opacity=".3"/><circle cx="96" cy="118" r="2.5"/></g>
  <g stroke="#f49fac" stroke-opacity=".5" fill="none"><circle cx="164" cy="112" r="26"/><circle cx="164" cy="112" r="38" stroke-opacity=".2"/></g>
  <text x="300" y="186" text-anchor="end" fill="#f49fac" font-family="IBM Plex Mono" font-size="11">282M · 10.7M</text>''',
 'water-sustainability': f'''<g fill="none" stroke="{H}" stroke-opacity=".5"><rect x="40" y="60" width="100" height="80" rx="4"/><rect x="180" y="60" width="100" height="80" rx="4"/></g>
  <line x1="160" y1="50" x2="160" y2="150" stroke="{H}" stroke-width="2" stroke-dasharray="3 3"/>
  <g fill="#7CCBF0"><circle cx="70" cy="90" r="3"/><circle cx="96" cy="112" r="3"/><circle cx="120" cy="80" r="3"/><circle cx="60" cy="124" r="3"/><circle cx="200" cy="96" r="3"/><circle cx="230" cy="80" r="3"/><circle cx="252" cy="118" r="3"/><circle cx="214" cy="126" r="3"/><circle cx="168" cy="104" r="3"/></g>
  <g fill="#F2C46B"><circle cx="84" cy="96" r="5.5"/><circle cx="128" cy="118" r="5.5"/></g><g fill="#96CAA0"><circle cx="110" cy="98" r="5.5"/><circle cx="66" cy="106" r="5.5"/></g>
  <path d="M14 100h22l-6-6m6 6-6 6" stroke="#fff" fill="none" stroke-width="1.5"/><text x="300" y="180" text-anchor="end" fill="{H}" font-family="IBM Plex Mono" font-size="10">≈ 3–4 kWh / m³</text>''',
 'alternative-energy': f'''<g fill="none"><ellipse cx="160" cy="104" rx="104" ry="42" stroke="{H}" stroke-opacity=".5"/><ellipse cx="160" cy="104" rx="70" ry="24" stroke="{H}" stroke-opacity=".3"/>
  <ellipse cx="160" cy="104" rx="87" ry="33" stroke="#F49FAC" stroke-width="3" stroke-opacity=".8"/><ellipse cx="160" cy="104" rx="87" ry="33" stroke="#9FDCEB" stroke-width="1" stroke-dasharray="4 6"/>
  <rect x="148" y="58" width="24" height="92" rx="2" stroke="#B9A6F2" stroke-opacity=".7"/></g>
  <g stroke="#C3C9CF" stroke-opacity=".5" fill="none">{''.join(f'<ellipse cx="{160 + 87 * __import__("math").cos(a / 9 * 3.1416)}" cy="{104 + 33 * __import__("math").sin(a / 9 * 3.1416)}" rx="5" ry="14"/>' for a in range(18))}</g>
  <text x="300" y="186" text-anchor="end" fill="#F49FAC" font-family="IBM Plex Mono" font-size="11">33.8% RENEWABLE</text>''',
}

def svg(slug):
    return f'<svg viewBox="0 0 320 200" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="320" height="200" fill="#0B0D15"/>{THUMB[slug]}</svg>'

DEFS = '''<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="steelG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--st1)"/>
      <stop offset=".46" style="stop-color:var(--st2)"/>
      <stop offset=".54" style="stop-color:var(--st3)"/>
      <stop offset="1" style="stop-color:var(--st4)"/>
    </linearGradient>
  </defs>
  <symbol id="mk" viewBox="-12 -105 525 355">
    <g transform="rotate(-45)">
      <rect x="0" y="0" width="132" height="96" rx="20"/>
      <rect x="0" y="120" width="252" height="96" rx="20"/>
      <rect x="0" y="240" width="372" height="96" rx="20"/>
    </g>
  </symbol>
</svg>'''

def head(title, desc, path, og='og-image.png', kind='article'):
    url = f'{SITE}/research/{path}'
    return f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../avatar-1080.png">
<meta name="theme-color" content="#0C0C14">
<meta property="og:type" content="{kind}">
<meta property="og:site_name" content="EMAC إي ماك">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/{og}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Montserrat:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="research.css">
<script type="importmap">{{"imports":{{"three":"https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"}}}}</script>
'''

NAV = '''<header class="nav">
  <div class="in">
    <a class="brand" href="../" aria-label="EMAC الرئيسية"><svg class="mark" viewBox="-12 -105 525 355" aria-hidden="true"><use href="#mk"/></svg><span class="wordmark">EMAC</span></a>
    <ul>
      <li><a href="../#services">الخدمات</a></li>
      <li><a href="../#work">نماذج</a></li>
      <li><a href="./" aria-current="page">أحدث الأبحاث</a></li>
    </ul>
    <a class="btn p" href="../#contact" style="padding:8px 18px;font-size:15px">ابدأ حملتك</a>
  </div>
</header>'''

FOOT = '''<section class="cta"><div class="in">
  <div><p class="eyebrow">EMAC Research</p><h2>لديك بحث يستحق أن يُعرض بهذه الطريقة؟</h2><p class="muted" style="margin-top:8px">نحوّل الأوراق والبيانات إلى خرائط وهولوغرام وقصص مرئية لحملتك.</p></div>
  <a class="btn p" href="../#contact">تواصل مع إي ماك</a>
</div></section>
<footer>
  <div class="in">
    <a class="brand" href="../"><svg class="mark" viewBox="-12 -105 525 355" aria-hidden="true" style="width:26px"><use href="#mk"/></svg><span class="wordmark" style="font-size:12px">EMAC</span></a>
    <span>© 2026 إي ماك · EMAC</span>
    <span class="mono">agencyemac@gmail.com</span>
  </div>
</footer>
<script type="module" src="research.js"></script>
</body>
</html>
'''

def card(a, lead=False):
    return f'''<a class="card{' lead-card' if lead else ''}" href="{a['slug']}.html" data-c="{a['cat']}">
  <div class="vis">{svg(a['slug'])}</div>
  <div class="body"><span class="cat">{a['catName']}</span><h2>{a['title']}</h2><p>{a['dek']}</p>
  <div class="meta"><span>{a['read']} دقائق قراءة</span>{''.join(f'<span>{t}</span>' for t in a['has'])}</div>
  <span class="data mono">{a['data']}</span></div>
</a>'''

arts = {}
for f in sorted(src.glob('*.html')):
    t = f.read_text()
    m = re.match(r'<!--\s*(\{.*?\})\s*-->\s*', t, re.S)
    meta = json.loads(m.group(1)); rest = t[m.end():]
    h = re.search(r'<!--hero-->(.*?)<!--/hero-->', rest, re.S)
    meta['hero'] = h.group(1).strip(); meta['body'] = rest[h.end():]
    meta['slug'] = f.stem
    meta['catName'] = dict(CATS)[meta['cat'].split()[0]]
    arts[f.stem] = meta
seq = [arts[s] for s in ORDER if s in arts]

# hub
hub = head('أحدث الأبحاث | إي ماك EMAC', 'مقالات علمية مصوّرة من إي ماك: الحياة على المريخ، داخل الخلية، المناخ والبصمة الكربونية، الأمن الغذائي، المياه العذبة، انتشار الأمراض، استدامة المياه والطاقة البديلة، بخرائط تفاعلية وهولوغرام.', '', kind='website')
hub += '</head>\n<body>\n' + DEFS + '\n' + NAV + f'''
<main>
  <section class="hub-hero"><div class="in">
    <p class="eyebrow">Latest research · EMAC Lab</p>
    <h1>أحدث الأبحاث، كما يجب أن تُرى</h1>
    <p class="lead">مقالات قصيرة تجمع أحدث ما نشرته المؤسسات العلمية مع بياناتها الأصلية: خرائط تفاعلية، رسوم بيانية، ونماذج هولوغرام ثلاثية الأبعاد يمكنك تدويرها بيدك. كل رقم هنا مربوط بمصدره.</p>
    <div class="filters" role="group" aria-label="تصفية حسب المجال">{''.join(f'<button type="button" data-c="{k}" aria-pressed="{str(k == "all").lower()}">{v}</button>' for k, v in CATS)}</div>
  </div></section>
  <div class="in"><div class="grid">
{chr(10).join(card(a, i == 0) for i, a in enumerate(seq))}
  </div></div>
</main>
''' + FOOT
(out / 'index.html').write_text(hub)

# articles
for i, a in enumerate(seq):
    rel = [seq[(i + k) % len(seq)] for k in (1, 2, 3)]
    srcs = ''.join(f'<li><a href="{html.escape(u)}" rel="noopener" target="_blank">{n}</a></li>' for n, u in a['sources'])
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": a['title'], "description": a['dek'], "inLanguage": "ar", "datePublished": a['date'], "dateModified": a['date'],
          "author": {"@type": "Organization", "name": "EMAC"}, "publisher": {"@type": "Organization", "name": "EMAC", "logo": {"@type": "ImageObject", "url": f"{SITE}/avatar-1080.png"}},
          "mainEntityOfPage": f"{SITE}/research/{a['slug']}.html", "image": f"{SITE}/og-image.png"}
    page = head(f"{a['title']} | أحدث الأبحاث · إي ماك", a['dek'], f"{a['slug']}.html")
    page += f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n</head>\n<body>\n' + DEFS + '\n' + NAV + f'''
<main>
  <div class="in crumbs"><a href="./">أحدث الأبحاث</a> / <a href="./#{a['cat'].split()[0]}">{a['catName']}</a></div>
  <header class="a-hero"><div class="in">
    <div>
      <span class="a-cat">{a['catName']}</span>
      <h1>{a['title']}</h1>
      <p class="dek">{a['dek']}</p>
      <div class="a-meta"><span>{a['read']} دقائق قراءة</span><span>آخر تحديث للبيانات: {a['updated']}</span><span>{len(a['sources'])} مصادر</span></div>
      <div class="a-listen" data-src="audio/{a['slug']}.mp3" hidden><span class="a-listen-l">استمع للمقال بصوت معلّق إيماك</span><audio controls preload="none"></audio></div>
    </div>
    <div>{a['hero']}</div>
  </div></header>
  <article class="in"><div class="prose">
{a['body'].strip()}
  </div>
  <section class="sources" aria-labelledby="src-h"><h2 id="src-h">المصادر</h2><ol>{srcs}</ol>
  <p style="margin-top:14px">الأرقام منقولة كما نشرها مصدرها، وقد تتغير مع كل إصدار جديد. المقال من إعداد فريق إي ماك لأغراض التوعية والعرض.</p></section>
  </article>
  <section class="related"><div class="in"><h2>تابع القراءة</h2><div class="grid">{''.join(card(r) for r in rel)}</div></div></section>
</main>
''' + FOOT
    (out / f"{a['slug']}.html").write_text(page)
print('built', len(seq), 'articles')
