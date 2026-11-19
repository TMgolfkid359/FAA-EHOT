#!/usr/bin/env python3
"""
Extract the FAA Holdover Time (HOT) Guidelines, Winter 2026-2027, from the
official FAA PDF into app/data/hot-2026-27.json.

Source: https://www.faa.gov/other_visit/aviation_industry/airline_operators/airline_safety/deicing
        FAA-2026-27_Holdover_Tables.pdf  ("Original Issue", August 11, 2026)

Approach
--------
* Primary extraction uses `pdftotext -layout` (poppler).
* Every HOT table is cross-checked against an independent extraction made with
  pdfplumber: the ordered sequence of time values in each table must match
  exactly, otherwise the script fails.
* Structural checks (band count, concentrations, column count, min <= max)
  also fail the script rather than produce questionable data.

Usage:  python3 tools/extract_hot.py [path/to/FAA-2026-27_Holdover_Tables.pdf]
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "source" / "FAA-2026-27_Holdover_Tables.pdf"
OUT = ROOT / "app" / "data" / "hot-2026-27.json"

COLS_9 = ["fzfg", "snfzfg", "sn_vl", "sn_l", "sn_m", "fzdz", "fzra_l", "snra_m", "rain_csw"]
COLS_7 = ["fzfg", "snfzfg", "sn", "fzdz", "fzra_l", "snra_m", "rain_csw"]

CONDITIONS = {
    "fzfg": "Freezing Fog, Freezing Mist, or Ice Crystals",
    "snfzfg": "Snow mixed with Freezing Fog",
    "sn_vl": "Very Light Snow, Snow Grains or Snow Pellets",
    "sn_l": "Light Snow, Snow Grains or Snow Pellets",
    "sn_m": "Moderate Snow, Snow Grains or Snow Pellets",
    "sn": "Snow, Snow Grains or Snow Pellets",
    "fzdz": "Freezing Drizzle",
    "fzra_l": "Light Freezing Rain",
    "snra_m": "Moderate Snow mixed with Rain",
    "rain_csw": "Rain on Cold-Soaked Wing",
    "other": "Other (heavy snow, ice pellets, moderate/heavy freezing rain, small hail, hail)",
}

TIME = r"\d{1,2}:\d{2}"
RANGE_RE = re.compile(rf"({TIME})\s*-\s*({TIME})(\d{{0,2}})")
CONC_RE = re.compile(r"\b(100/0|75/25|50/50)\b")


def num_(x):
    v = float(x)
    return int(v) if v.is_integer() else v


def fail(msg):
    sys.exit(f"EXTRACTION ERROR: {msg}")


def to_min(t):
    h, m = t.split(":")
    if int(m) >= 60:
        fail(f"bad time {t}")
    return int(h) * 60 + int(m)


# ---------------------------------------------------------------- text
def layout_text():
    return subprocess.run(["pdftotext", "-layout", str(PDF), "-"], check=True,
                          capture_output=True, text=True).stdout


def split_pages(text):
    pages = text.split("\f")
    return pages


def page_number(page_text):
    m = re.search(r"Page (\d+) of 91", page_text)
    return num_(m.group(1)) if m else None


# ---------------------------------------------------------------- temperature bands
def parse_band_c(label):
    """Return (lo, hi, lo_inclusive, hi_inclusive) in degC. None = unbounded."""
    s = label.replace("−", "-")
    m = re.fullmatch(r"(-?\d+(?:\.\d+)?) °C and above", s)
    if m:
        return {"lo": num_(m.group(1)), "loInc": True, "hi": None, "hiInc": False}
    m = re.fullmatch(r"below (-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?) °C", s)
    if m:
        hi, lo = num_(m.group(1)), num_(m.group(2))
        if lo >= hi:
            fail(f"bad band {label}")
        return {"lo": lo, "loInc": True, "hi": hi, "hiInc": False}
    m = re.fullmatch(r"below (-?\d+(?:\.\d+)?) °C", s)
    if m:
        return {"lo": None, "loInc": False, "hi": num_(m.group(1)), "hiInc": False}
    fail(f"unparsed °C band '{label}'")


def parse_band_f(label):
    s = label.replace("−", "-").strip("() ")
    m = re.fullmatch(r"(-?\d+(?:\.\d+)?) °F and above", s)
    if m:
        return {"lo": num_(m.group(1)), "loInc": True, "hi": None, "hiInc": False}
    m = re.fullmatch(r"below (-?\d+(?:\.\d+)?) to (-?\d+(?:\.\d+)?) °F", s)
    if m:
        return {"lo": num_(m.group(2)), "loInc": True, "hi": num_(m.group(1)), "hiInc": False}
    m = re.fullmatch(r"below (-?\d+(?:\.\d+)?) °F", s)
    if m:
        return {"lo": None, "loInc": False, "hi": num_(m.group(1)), "hiInc": False}
    fail(f"unparsed °F band '{label}'")


N = r"-?\d+(?:\.\d+)?"
BAND_C_RE = re.compile(rf"^\s{{0,12}}((?:below )?{N}(?: to {N})? °C(?: and above)?)")
BAND_F_RE = re.compile(rf"^\s{{0,12}}(\((?:below )?{N}(?: to {N})? °F(?: and above)?\))")


# ---------------------------------------------------------------- table parsing
def table_sections(text):
    """Yield (num, title, body_lines, page) for HOT tables 2..52."""
    pages = split_pages(text)
    for pg in pages:
        pno = page_number(pg)
        lines = pg.splitlines()
        for i, ln in enumerate(lines):
            m = re.match(r"^\s*TABLE (\d+): (.*)$", ln)
            if not m:
                continue
            num = num_(m.group(1))
            if not 2 <= num <= 52:
                continue
            title = m.group(2).strip()
            j = i + 1
            # Type I and Type III titles wrap onto a second line
            if num in (2, 3) or 17 <= num <= 19:
                title += " " + lines[j].strip()
                j += 1
            body = []
            notes = []
            k = j
            while k < len(lines) and not lines[k].strip().startswith("NOTES"):
                body.append(lines[k])
                k += 1
            k += 1
            while k < len(lines) and not lines[k].strip().startswith("CAUTIONS"):
                notes.append(lines[k])
                k += 1
            yield num, re.sub(r"\s+", " ", title), body, notes, pno


def parse_notes(note_lines):
    notes = {}
    cur = None
    for ln in note_lines:
        m = re.match(r"^\s*(\d{1,2}) (\S.*)$", ln)
        if m:
            cur = m.group(1)
            notes[cur] = m.group(2).strip()
        elif cur and ln.strip():
            notes[cur] += " " + ln.strip()
    return notes


def parse_table(num, title, body, notes_lines, page):
    header = " ".join(body[:14])
    cols = COLS_9 if "Very Light" in header else COLS_7
    has_conc = num not in (2, 3)

    bands_c, bands_f, rows = [], [], []
    for ln in body:
        mc = BAND_C_RE.match(ln)
        if mc:
            bands_c.append(mc.group(1))
        mf = BAND_F_RE.match(ln)
        if mf:
            bands_f.append(mf.group(1))
        # data part
        if has_conc:
            m = CONC_RE.search(ln)
            if not m:
                continue
            conc = m.group(1)
            rest = ln[m.end():]
        else:
            if not RANGE_RE.search(ln):
                continue
            conc = None
            rest = ln
        cells = []
        for tok in re.finditer(rf"({TIME})\s*-\s*({TIME})(\d{{0,2}})|N/A", rest):
            if tok.group(0) == "N/A":
                cells.append({"na": True})
            else:
                a, b, fn = tok.group(1), tok.group(2), tok.group(3)
                c = {"min": to_min(a), "max": to_min(b), "text": f"{a} - {b}"}
                if fn:
                    c["note"] = fn
                if c["min"] > c["max"]:
                    fail(f"T{num} min>max {a}-{b}")
                cells.append(c)
        if not cells:
            fail(f"T{num}: concentration row without values: {ln!r}")
        if len(cells) > len(cols):
            fail(f"T{num}: {len(cells)} cells > {len(cols)} columns: {ln!r}")
        rows.append((conc, cells))

    if len(bands_c) != len(bands_f):
        fail(f"T{num}: °C/°F band count mismatch {bands_c} {bands_f}")

    # group rows into bands: each band starts with 100/0
    grouped = []
    for conc, cells in rows:
        if not has_conc or conc == "100/0" or not grouped:
            if has_conc and conc != "100/0":
                fail(f"T{num}: band does not start with 100/0")
            grouped.append([])
        grouped[-1].append((conc, cells))
    if len(grouped) != len(bands_c):
        fail(f"T{num}: {len(grouped)} row groups vs {len(bands_c)} bands")

    notes = parse_notes(notes_lines)
    out_bands = []
    for (lc, lf, grp) in zip(bands_c, bands_f, grouped):
        band = {"labelC": lc, "labelF": lf.strip("()"), "c": parse_band_c(lc), "f": parse_band_f(lf), "rows": []}
        for conc, cells in grp:
            vals = {}
            for col, cell in zip(cols, cells):
                vals[col] = cell
            band["rows"].append({"conc": conc or "100/0", "values": vals})
        out_bands.append(band)

    # sanity: band ordering, contiguous, descending
    for a, b in zip(out_bands, out_bands[1:]):
        if a["c"]["lo"] != b["c"]["hi"]:
            fail(f"T{num}: °C bands not contiguous {a['labelC']} / {b['labelC']}")
        if a["f"]["lo"] != b["f"]["hi"]:
            fail(f"T{num}: °F bands not contiguous {a['labelF']} / {b['labelF']}")

    # cell footnotes we understand
    for band in out_bands:
        for row in band["rows"]:
            for col, cell in row["values"].items():
                fn = cell.get("note")
                if not fn:
                    continue
                txt = notes.get(fn, "")
                m = re.search(r"No holdover time guidelines exist for this condition below (-?\d+(?:\.\d+)?) °C \((-?\d+(?:\.\d+)?) °F\)", txt)
                if not m:
                    fail(f"T{num}: unknown cell note {fn}: {txt}")
                cell["noHotBelowC"] = num_(m.group(1))
                cell["noHotBelowF"] = num_(m.group(2))

    # column-level note: snow mixed with rain / rain on cold-soaked wing above 0 °C only
    if not any("for 0 °C (32 °F) and below" in t for t in notes.values()):
        fail(f"T{num}: expected 'no HOT at 0 °C and below' note for rain columns")

    return {
        "table": num,
        "title": title,
        "page": page,
        "columns": cols + ["other"],
        "hasConcentration": has_conc,
        "bands": out_bands,
        "notes": notes,
    }


# ---------------------------------------------------------------- cross-check
def plumber_sequences():
    import pdfplumber
    seqs = {}
    with pdfplumber.open(str(PDF)) as pdf:
        for p in pdf.pages:
            t = p.extract_text() or ""
            m = re.search(r"TABLE (\d+): ", t)
            if not m or "(CONT" in t[:t.find("TABLE") + 30]:
                continue
            num = num_(m.group(1))
            if not 2 <= num <= 52:
                continue
            body = t.split("NOTES")[0]
            seqs[num] = [(to_min(a), to_min(b)) for a, b, _ in RANGE_RE.findall(body)]
    return seqs


def table_sequence(tbl):
    seq = []
    for band in tbl["bands"]:
        for row in band["rows"]:
            for col in tbl["columns"]:
                c = row["values"].get(col)
                if c and not c.get("na"):
                    seq.append((c["min"], c["max"]))
    return seq


# ---------------------------------------------------------------- fluids metadata
def classify(num, title):
    t = title
    if num in (2, 3):
        return {"type": "I", "id": "typeI-" + ("aluminum" if num == 2 else "composite"),
                "name": "Type I – " + ("Aluminum surfaces" if num == 2 else "Composite surfaces"),
                "surface": "aluminum" if num == 2 else "composite"}
    if num == 4:
        return {"type": "II", "id": "typeII-generic", "name": "Generic Type II", "generic": True}
    if num == 20:
        return {"type": "IV", "id": "typeIV-generic", "name": "Generic Type IV", "generic": True}
    m = re.match(r"TYPE (II|III|IV) HOLDOVER TIMES FOR (.*)$", t)
    if not m:
        fail(f"cannot classify T{num}: {t}")
    ftype, brand = m.group(1), m.group(2)
    info = {"type": ftype, "generic": False}
    if ftype == "III":
        speed = re.search(r"(LOW|MIDDLE|HIGH) SPEED", brand).group(1).lower()
        brand = brand.split(" APPLIED")[0]
        info["rampSpeed"] = speed
        info["applied"] = "unheated"
    info["brandUpper"] = brand
    info["id"] = f"type{ftype}-" + re.sub(r"[^a-z0-9]+", "-", brand.lower()).strip("-") + (
        f"-{info['rampSpeed']}" if ftype == "III" else "")
    return info


def main():
    text = layout_text()
    if "Winter 2026-2027" not in text:
        fail("PDF is not the Winter 2026-2027 edition")
    issue = re.search(r"(Original Issue|Revision \d+)\s+Page \d+ of 91\s+(\w+ \d+, \d{4})", text)

    tables = {}
    for num, title, body, notes, page in table_sections(text):
        if num in tables:
            continue
        tables[num] = parse_table(num, title, body, notes, page)
    missing = [n for n in range(2, 53) if n not in tables]
    if missing:
        fail(f"tables not found: {missing}")

    # independent cross-check
    seqs = plumber_sequences()
    for num, tbl in tables.items():
        if num not in seqs:
            fail(f"pdfplumber did not find table {num}")
        mine = table_sequence(tbl)
        if mine != seqs[num]:
            fail(f"T{num}: pdftotext and pdfplumber disagree\n{mine}\n{seqs[num]}")

    sys.path.insert(0, str(Path(__file__).parent))
    import supplemental as sup
    sup.verify(text, fail)
    sup.verify_at_columns(text, fail)

    toc = {}
    for m in re.finditer(r"Table (\d+): (Type (?:II|III|IV) Holdover Times for |Generic Holdover Times for SAE )(.+?)\s*\.{3,}", text):
        toc[int(m.group(1))] = m.group(3).strip()

    for num in sorted(tables):
        tbl = tables[num]
        tbl.update(classify(num, tbl["title"]))
        if not tbl.get("generic") and tbl["type"] != "I":
            name = toc.get(num)
            if not name:
                fail(f"T{num}: no TOC name")
            if tbl["type"] == "III":
                name = name.split(" Applied")[0]
            if name.upper() != tbl["brandUpper"]:
                fail(f"T{num}: TOC name {name!r} != title {tbl['brandUpper']!r}")
            tbl["name"] = name
        if tbl["type"] in ("III", "IV") and not tbl["generic"]:
            if num not in sup.AT_VALIDATION:
                fail(f"T{num}: missing allowance-time validation status")
            tbl["allowanceTable"] = sup.AT_VALIDATION[num]

    data = {
        "source": {
            "title": "FAA Holdover Time Guidelines, Winter 2026-2027",
            "issue": issue.group(1) if issue else None,
            "date": issue.group(2) if issue else None,
            "url": "https://www.faa.gov/other_visit/aviation_industry/airline_operators/airline_safety/deicing",
            "file": PDF.name,
        },
        "conditions": CONDITIONS,
        "tables": [tables[n] for n in sorted(tables)],
        "frost": sup.FROST,
        "allowance": {"III": sup.AT_TYPE_III, "IV-EG": sup.AT_TYPE_IV_EG, "IV-PG": sup.AT_TYPE_IV_PG,
                      "validation": [dict(zip(("group", "manufacturer", "fluid", "table"), r)) for r in sup.AT_VALIDATION_TEXT],
                      "validationTable": 53, "validationPage": 67},
        "snowVisibility": sup.SNOW_VIS,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False))
    # same data as a script so the app also works when opened from file:// (no fetch)
    OUT.with_suffix(".js").write_text(
        "// GENERATED by tools/extract_hot.py from the official FAA PDF. Do not edit by hand.\n"
        "window.HOT_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    ncells = sum(len(table_sequence(t)) for t in data["tables"])
    print(f"OK: {len(tables)} tables, {ncells} HOT ranges, cross-checked with pdfplumber -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
