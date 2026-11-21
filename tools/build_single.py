#!/usr/bin/env python3
"""Bundle the app into ONE self-contained HTML file: dist/hot-2026-27.html

Everything (CSS, data, scripts, icon) is inlined, so the file works when opened directly
or emailed. Offline caching (service worker) and install-to-home-screen features
need the hosted version, not this file.
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
OUT = ROOT / "dist" / "hot-2026-27.html"


def js(path):
    src = (APP / path).read_text(encoding="utf-8")
    if "</script" in src.lower():
        src = re.sub(r"</(script)", r"<\\/\1", src, flags=re.I)
    return src


html = (APP / "index.html").read_text(encoding="utf-8")
icon = "data:image/svg+xml;base64," + base64.b64encode((APP / "icon.svg").read_bytes()).decode()

html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', "")
html = html.replace('href="icon.svg"', f'href="{icon}"')
html = html.replace('<link rel="stylesheet" href="style.css">',
                    "<style>\n" + (APP / "style.css").read_text(encoding="utf-8") + "\n</style>")
for src in ["data/hot-2026-27.js", "hot-engine.js", "metar.js", "app.js"]:
    tag = f'<script src="{src}"></script>'
    if tag not in html:
        raise SystemExit(f"missing {tag} in index.html")
    html = html.replace(tag, "<script>\n" + js(src) + "\n</script>")
# check only the HTML outside inlined scripts/styles for leftover local file references
markup = re.sub(r"<(script|style)>.*?</\1>", "", html, flags=re.S)
left = re.findall(r'<(?:script|link)[^>]+(?:src|href)="(?!data:|https?:)[^"]+"', markup)
if left:
    raise SystemExit(f"unbundled local reference left in HTML: {left}")

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"OK -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
