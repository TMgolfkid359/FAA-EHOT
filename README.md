# HOT 26-27: Deicing Holdover Times

An offline-capable web app (PWA) for aircraft ground deicing/anti-icing **holdover times (HOT)**, built from the
**FAA Holdover Time Guidelines, Winter 2026-2027** (Original Issue, August 11, 2026).

> **Reference tool only. This is not an FAA product.** Always verify against the official FAA document and your operator's
> FAA-approved ground deicing/anti-icing program. The FAA may publish revisions during the season:
> <https://www.faa.gov/other_visit/aviation_industry/airline_operators/airline_safety/deicing>

## Features

- **HOT calculator**: Type I (aluminum/composite), Type II, Type III (AeroClear MAX low/middle/high speed ramp test) and Type IV,
  with generic and every brand-specific table (Tables 2–52), all dilutions, °C or °F (using the FAA's own °F bands).
- **Active frost** (Table 1).
- **Snowfall intensity from visibility** (Table 57): day/night and OAT aware.
- **Allowance times** for ice pellets and small hail (Tables 53–56), including fluid validation status and rotation-speed limits.
- **Live METAR**: enter an ICAO code (or paste a METAR/SPECI). The app decodes temperature (T-group tenths when present),
  visibility (preferring `SFC VIS` from the remarks), weather and day/night (from the sun's position), then *suggests* the HOT condition:
  snowfall intensity from Table 57, the country-specific SG/GS/SHGS/GR/PL rules from FAA General Information Table 3,
  and mixed conditions only where the guidelines provide times. Ice pellets go to allowance times. Nothing is applied until you
  press **Apply**, and the observation age is shown, with a warning when it is more than 60 minutes old.
- **HOT clock**: green / amber (past minimum) / red (past maximum), kept across page reloads.
- **Table viewer** that shows every table as published, with notes.
- Applies the cell- and column-level rules from the notes, e.g. no freezing drizzle/light freezing rain HOT below −10 °C,
  no "rain on cold-soaked wing" or "moderate snow mixed with rain" HOT at 0 °C and below, and the fluid's lowest temperature band.
- Works offline after the first load. Installable on iOS/Android. Dark theme by default, with a light theme.

Not included: LOUT tables and fluid lists (Tables 58–62), application guidelines (63–65), and degree-specific HOTs (DSHOTs).

## Run it

It's a static site with no build step:

```bash
python3 -m http.server 8000 --directory app   # then open http://localhost:8000
```

Opening `app/index.html` directly also works, but the offline service worker needs http(s).
A GitHub Actions workflow (`.github/workflows/pages.yml`) runs the tests and deploys `app/` to GitHub Pages on pushes to the default branch (enable it under Settings → Pages → Source: GitHub Actions).

## METAR source

| Source | Setup | Coverage | Notes |
|---|---|---|---|
| `api.weather.gov` (NWS) | none (default) | US + Canada | Allows browser requests. Reports can lag up to about an hour behind |
| `aviationweather.gov` via proxy | deploy `proxy/metar-worker.js` (free Cloudflare Worker), paste its URL in **Info → METAR source** | worldwide, current | aviationweather.gov doesn't allow direct browser requests, so a proxy is needed |
| Paste | none, works offline | any | |

Live METARs are never served from the offline cache.

## Data pipeline

`app/data/hot-2026-27.{json,js}` is **generated**. Do not edit it by hand.

```bash
pip install pdfplumber            # plus poppler-utils for pdftotext
python3 tools/extract_hot.py      # reads source/FAA-2026-27_Holdover_Tables.pdf
node --test tests/*.test.js
```

Safeguards in `tools/extract_hot.py`:
- The 51 HOT tables (2,207 ranges) are extracted with `pdftotext -layout` and **cross-checked against an independent pdfplumber
  extraction**. Any difference aborts the build.
- Structural checks: °C/°F band counts, contiguous bands, every band starts with 100/0, column count, min ≤ max, and every
  footnote attached to a value must be one it understands.
- Small tables (1, 53–57) are typed in by hand in `tools/supplemental.py` and checked against the PDF, number for number,
  including each allowance time's temperature column, worked out from its position on the page.

### Updating for a revision or a new season
Put the new PDF in `source/`, update the edition check and hand-typed tables if needed, re-run the extractor and the tests, and
bump `VERSION` in `app/sw.js` so installed copies refresh.
