#!/usr/bin/env python3
"""Build the single-file CompBotOrg workbench.

head.html  : DSH design-system CSS (extracted once from the reference build)
app.css    : the workbench view layer
body.html  : shell markup, with a /*__APP_JS__*/ placeholder
app.js     : state-driven UI
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'

head = (SRC / 'head.html').read_text()
css = (SRC / 'app.css').read_text()
body = (SRC / 'body.html').read_text()
js = (SRC / 'app.js').read_text()

if '</head>' not in head:
    raise SystemExit('head.html is missing </head>')
head = head.replace(
    '</head>',
    '<style id="cb-app-css">\n' + css + '\n</style>\n</head>',
    1,
)

if '/*__APP_JS__*/' not in body:
    raise SystemExit('body.html is missing the /*__APP_JS__*/ placeholder')
# keep the inline script safe against accidental tag close inside strings
body = body.replace('/*__APP_JS__*/', '\n' + js + '\n', 1)

out = head + body
(ROOT / 'index.html').write_text(out)
print('built index.html: %d bytes (css %d, js %d)' % (len(out), len(css), len(js)))
