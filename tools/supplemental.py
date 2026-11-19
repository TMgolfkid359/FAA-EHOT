"""
Hand-transcribed small tables from the FAA HOT Guidelines Winter 2026-2027
(Tables 1, 53-57). Every number here is verified against the PDF text by
verify(text) in extract_hot.py; a mismatch aborts the build.
"""
import re
from collections import Counter

# ---------------------------------------------------------------- Table 1: Active frost
FROST = {
    "table": 1, "page": 10,
    "title": "Active Frost Holdover Times for SAE Type I, Type II, Type III, and Type IV Fluids",
    "typeI": {"aluminum": "0:45", "composite": "0:35"},  # merged cells: apply at all OATs
    # columns: Type II, Type III (AllClear AeroClear MAX unheated only), Type IV
    "bands": [
        {"labelC": "-1 °C and above", "labelF": "30 °F and above",
         "c": {"lo": -1, "hi": None}, "f": {"lo": 30, "hi": None},
         "rows": {"100/0": ["8:00", "2:00", "12:00"], "75/25": ["5:00", "1:00", "5:00"], "50/50": ["2:00", "0:30", "3:00"]}},
        {"labelC": "below -1 to -3 °C", "labelF": "below 30 to 27 °F",
         "c": {"lo": -3, "hi": -1}, "f": {"lo": 27, "hi": 30},
         "rows": {"100/0": ["8:00", "2:00", "12:00"], "75/25": ["5:00", "1:00", "5:00"], "50/50": ["1:30", "0:30", "3:00"]}},
        {"labelC": "below -3 to -10 °C", "labelF": "below 27 to 14 °F",
         "c": {"lo": -10, "hi": -3}, "f": {"lo": 14, "hi": 27},
         "rows": {"100/0": ["8:00", "2:00", "10:00"], "75/25": ["4:00", "1:00", "5:00"]}},
        {"labelC": "below -10 to -14 °C", "labelF": "below 14 to 7 °F",
         "c": {"lo": -14, "hi": -10}, "f": {"lo": 7, "hi": 14},
         "rows": {"100/0": ["6:00", "2:00", "6:00"], "75/25": ["1:00", "1:00", "1:00"]}},
        {"labelC": "below -14 to -21 °C", "labelF": "below 7 to -6 °F",
         "c": {"lo": -21, "hi": -14}, "f": {"lo": -6, "hi": 7},
         "rows": {"100/0": ["3:00", "2:00", "6:00"]}},
        {"labelC": "below -21 to -25 °C", "labelF": "below -6 to -13 °F",
         "c": {"lo": -25, "hi": -21}, "f": {"lo": -13, "hi": -6},
         "rows": {"100/0": ["2:00", "2:00", "4:00"]}},
        {"labelC": "below -25 °C", "labelF": "below -13 °F",
         "c": {"lo": None, "hi": -25}, "f": {"lo": None, "hi": -13},
         "rows": {}, "noHot": True},
    ],
    "notes": [
        "Ensure the fluid and dilution being used is listed in the List of Fluids Tested for Anti-Icing Performance and Aerodynamic Acceptance (Tables 58-61). Any restrictions on the use of the fluid have to be identified and applied.",
        "Type I fluid/water mixture must be selected so that the freezing point of the mixture is at least 10 °C (18 °F) below outside air temperature.",
        "Ensure that the lowest operational use temperature (LOUT) is respected.",
        "Changes in OAT over the course of longer frost events can be significant; the appropriate holdover time to use is the one provided for the coldest OAT that has occurred between the de/anti-icing fluid application and takeoff.",
        "To use the Type III fluid frost holdover times, the fluid brand being used must be known. AllClear AeroClear MAX must be applied unheated.",
    ],
}

# ---------------------------------------------------------------- Allowance times
# Ice pellet (PL) / small hail allowance times, minutes. None = no allowance time.
AT_TYPE_III = {
    "table": 54, "page": 68, "title": "Allowance Times for SAE Type III Fluids",
    "columns": [
        {"labelC": "Above 0 °C", "labelF": "Above 32 °F", "c": {"lo": 0, "loInc": False, "hi": None}, "f": {"lo": 32, "loInc": False, "hi": None}},
        {"labelC": "0 to -5 °C", "labelF": "32 to 23 °F", "c": {"lo": -5, "loInc": True, "hi": 0, "hiInc": True}, "f": {"lo": 23, "loInc": True, "hi": 32, "hiInc": True}},
        {"labelC": "Below -5 to -10 °C", "labelF": "Below 23 to 14 °F", "c": {"lo": -10, "loInc": True, "hi": -5, "hiInc": False}, "f": {"lo": 14, "loInc": True, "hi": 23, "hiInc": False}},
        {"labelC": "Below -10 °C", "labelF": "Below 14 °F", "c": {"lo": None, "hi": -10, "hiInc": False}, "f": {"lo": None, "hi": 14, "hiInc": False}},
    ],
    "rows": [
        {"id": "pl_l", "name": "Light Ice Pellets (or Small Hail)", "metar": "-PL", "t": [10, 10, 10, None]},
        {"id": "pl_l_sn_l", "name": "Light Ice Pellets mixed with Light Snow", "metar": "-PLSN, -SNPL", "t": [10, 10, 10, None]},
        {"id": "pl_l_fzdz_l", "name": "Light Ice Pellets mixed with Light Freezing Drizzle", "metar": "-PLFZDZ, -FZDZPL", "t": [None, 7, 5, None]},
        {"id": "pl_l_dz_l", "name": "Light Ice Pellets mixed with Light Drizzle", "metar": "-PLDZ, -DZPL", "t": [7, None, None, None]},
        {"id": "pl_l_fzra_l", "name": "Light Ice Pellets mixed with Light Freezing Rain", "metar": "-PLFZRA, -FZRAPL", "t": [None, 7, 5, None]},
        {"id": "pl_l_ra_l", "name": "Light Ice Pellets mixed with Light Rain", "metar": "-PLRA, -RAPL", "t": [7, None, None, None]},
        {"id": "pl_m", "name": "Moderate Ice Pellets (or Small Hail)", "metar": "PL", "t": [5, 5, 5, None]},
    ],
    "notes": [
        "For use with undiluted (100/0) fluids applied unheated on aircraft with rotation speeds of 100 knots or greater. The fluid must be listed as validated in Table 53.",
        "Takeoff is allowed up to 90 minutes after start of fluid application if the precipitation stops at or before the allowance time expires and does not restart. Takeoff is not permitted if the OAT decreases during the 90 minutes in conditions of light ice pellets mixed with either: light freezing drizzle; light drizzle; light freezing rain; or light rain.",
        "Ensure that the lowest operational use temperature (LOUT) is respected.",
        "If the METAR does not report an intensity for small hail, use the “moderate ice pellets or small hail” allowance times. If an intensity is reported with small hail, the condition with the equivalent intensity can be used.",
    ],
}

_IV_COLS = [
    {"labelC": "Above 0 °C", "labelF": "Above 32 °F", "c": {"lo": 0, "loInc": False, "hi": None}, "f": {"lo": 32, "loInc": False, "hi": None}},
    {"labelC": "0 to -5 °C", "labelF": "32 to 23 °F", "c": {"lo": -5, "loInc": True, "hi": 0, "hiInc": True}, "f": {"lo": 23, "loInc": True, "hi": 32, "hiInc": True}},
    {"labelC": "Below -5 to -10 °C", "labelF": "Below 23 to 14 °F", "c": {"lo": -10, "loInc": True, "hi": -5, "hiInc": False}, "f": {"lo": 14, "loInc": True, "hi": 23, "hiInc": False}},
    {"labelC": "Below -10 to -16 °C", "labelF": "Below 14 to 3 °F", "c": {"lo": -16, "loInc": True, "hi": -10, "hiInc": False}, "f": {"lo": 3, "loInc": True, "hi": 14, "hiInc": False}},
    {"labelC": "Below -16 to -22 °C", "labelF": "Below 3 to -8 °F", "c": {"lo": -22, "loInc": True, "hi": -16, "hiInc": False}, "f": {"lo": -8, "loInc": True, "hi": 3, "hiInc": False}},
]

_IV_ROWS = [
    ("pl_l", "Light Ice Pellets (or Small Hail)", "-PL"),
    ("pl_l_sn_l", "Light Ice Pellets mixed with Light Snow", "-PLSN, -SNPL"),
    ("pl_l_fzdz_l", "Light Ice Pellets mixed with Light Freezing Drizzle", "-PLFZDZ, -FZDZPL"),
    ("pl_l_dz_l", "Light Ice Pellets mixed with Light Drizzle", "-PLDZ, -DZPL"),
    ("pl_l_fzra_l", "Light Ice Pellets mixed with Light Freezing Rain", "-PLFZRA, -FZRAPL"),
    ("pl_l_ra_l", "Light Ice Pellets mixed with Light Rain", "-PLRA, -RAPL"),
    ("pl_l_fzra_l_sn_l", "Light Ice Pellets mixed with Light Freezing Rain and Light Snow", "-PLFZRASN, -PLSNFZRA, -FZRAPLSN, -FZRASNPL, -SNPLFZRA, -SNFZRAPL"),
    ("pl_l_ra_l_sn_l", "Light Ice Pellets mixed with Light Rain and Light Snow", "-PLRASN, -PLSNRA, -RAPLSN, -RASNPL, -SNPLRA, -SNRAPL"),
    ("pl_m", "Moderate Ice Pellets (or Small Hail)", "PL"),
    ("pl_m_sn_m", "Moderate Ice Pellets mixed with Moderate Snow", "PLSN, SNPL"),
    ("pl_m_fzdz", "Moderate Ice Pellets mixed with Light or Moderate Freezing Drizzle", "PLFZDZ, FZDZPL"),
    ("pl_m_dz", "Moderate Ice Pellets mixed with Light or Moderate Drizzle", "PLDZ, DZPL"),
    ("pl_m_ra_m", "Moderate Ice Pellets mixed with Moderate Rain", "PLRA, RAPL"),
]

_N = None
_EG = [[70, 70, 70, 50, 30], [50, 50, 30, 25, _N], [_N, 40, 30, _N, _N], [40, _N, _N, _N, _N],
       [_N, 40, 30, _N, _N], [40, _N, _N, _N, _N], [_N, 20, _N, _N, _N], [20, _N, _N, _N, _N],
       [35, 35, 35, 15, 10], [25, 25, 15, 10, _N], [_N, 20, 10, _N, _N], [20, _N, _N, _N, _N],
       [15, _N, _N, _N, _N]]
_PG = [[50, 50, 30, 30, 20], [40, 40, 15, 15, _N], [_N, 25, 10, _N, _N], [25, _N, _N, _N, _N],
       [_N, 25, 10, _N, _N], [25, _N, _N, _N, _N], [_N, 20, _N, _N, _N], [20, _N, _N, _N, _N],
       [15, 15, 10, 10, _N], [15, 15, 5, 5, _N], [_N, 10, 7, _N, _N], [10, _N, _N, _N, _N],
       [10, _N, _N, _N, _N]]

_IV_NOTE_90 = ("Takeoff is allowed up to 90 minutes after start of fluid application if the precipitation stops at or before the allowance time "
               "expires and does not restart. Takeoff is not permitted if the OAT decreases during the 90 minutes in conditions of light ice "
               "pellets mixed with either: light freezing drizzle; light drizzle; light freezing rain; light rain; light rain and light snow; or light "
               "freezing rain and light snow, as well as in conditions of moderate ice pellets mixed with either: light or moderate freezing "
               "drizzle; light or moderate drizzle; or moderate rain.")
_HAIL = "If the METAR does not report an intensity for small hail, use the “moderate ice pellets or small hail” allowance times. If an intensity is reported with small hail, the condition with the equivalent intensity can be used."

AT_TYPE_IV_EG = {
    "table": 55, "page": 69, "title": "Allowance Times for SAE Type IV Ethylene Glycol (EG) Fluids",
    "columns": [dict(c, minRotationKt=100) for c in _IV_COLS],
    "rows": [{"id": i, "name": n, "metar": m, "t": t} for (i, n, m), t in zip(_IV_ROWS, _EG)],
    "notes": [
        "For use with undiluted (100/0) EG-based fluids. The fluid must be listed as validated in Table 53.",
        _IV_NOTE_90,
        "Ensure that the lowest operational use temperature (LOUT) is respected.",
        "No allowance times exist for EG-based fluids when used on aircraft with rotation speeds less than 100 knots.",
        _HAIL,
    ],
}
AT_TYPE_IV_PG = {
    "table": 56, "page": 71, "title": "Allowance Times for SAE Type IV Propylene Glycol (PG) Fluids",
    "columns": [dict(c, minRotationKt=(115 if k >= 3 else 100)) for k, c in enumerate(_IV_COLS)],
    "rows": [{"id": i, "name": n, "metar": m, "t": t} for (i, n, m), t in zip(_IV_ROWS, _PG)],
    "notes": [
        "For use with undiluted (100/0) PG-based fluids applied on aircraft with rotation speeds of 100 knots or greater. The fluid must be listed as validated in Table 53.",
        _IV_NOTE_90,
        "Ensure that the lowest operational use temperature (LOUT) is respected.",
        "No allowance times exist for PG-based fluids when used on aircraft with rotation speeds less than 100 knots.",
        "No allowance times exist for PG-based fluids below -10 °C (14 °F) when used on aircraft with rotation speeds less than 115 knots.",
        _HAIL,
    ],
}

# Table 53: validation status. Keys are HOT table numbers; value = AT table or None (not validated)
# "AVIAFLUID AVIAFlight EG" is validated but has no HOT table of its own in this edition (uses generic Type IV).
AT_VALIDATION = {
    17: 54, 18: 54, 19: 54,           # AllClear AeroClear MAX
    22: None, 23: None, 26: 55, 27: None, 30: 55, 31: 55, 32: 55, 37: 55, 42: 55, 45: None, 49: 55, 50: None, 52: None,  # EG
    21: 56, 24: None, 25: None, 28: 56, 29: 56, 33: 56, 34: 56, 35: 56, 36: 56, 38: 56, 39: None, 40: None,
    41: 56, 43: 56, 44: None, 46: None, 47: None, 48: 56, 51: None,  # PG
}
AT_VALIDATION_TEXT = [
    ("Type III", "AllClear Systems LLC", "AeroClear MAX", 54),
    ("Type IV EG", "AFLRUS LLC", "Green Flo Type 4", None),
    ("Type IV EG", "ALAB International", "PROFLIGHT EG4", None),
    ("Type IV EG", "AllClear Systems LLC", "ClearWing EG", 55),
    ("Type IV EG", "ASGlobal", "4Flite EG", None),
    ("Type IV EG", "AVIAFLUID International Ltd", "AVIAFlight EG", 55),
    ("Type IV EG", "CHEMCO Inc.", "ChemR EG IV", 55),
    ("Type IV EG", "CHEMCO Inc.", "ChemR Nordik IV", 55),
    ("Type IV EG", "Chongqing Joba Chemical Co,.Ltd", "FW-IV", 55),
    ("Type IV EG", "Dow Inc.", "UCAR ENDURANCE™ EG106 ADF/AAF", 55),
    ("Type IV EG", "JSC RCP Nordix", "Defrost NORTH 4", 55),
    ("Type IV EG", "MAX TECH LLC", "MTL 4-EG", None),
    ("Type IV EG", "Newave Aerochemical Co. Ltd.", "FCY-EGIV", 55),
    ("Type IV EG", "Newave Aerochemical Co. Ltd.", "FCY-EGIV PLUS", None),
    ("Type IV EG", "Xinjiang Zhongtian Liyang Aviation", "Clearice-IV", None),
    ("Type IV PG", "ABAX Industries", "ECOWING AD-49", 56),
    ("Type IV PG", "ALAB International", "PROFLIGHT PG4", None),
    ("Type IV PG", "AllClear Systems LLC", "Clear IV Flight", None),
    ("Type IV PG", "ASGlobal", "4Flite PG", 56),
    ("Type IV PG", "AVIAFLUID International Ltd", "AVIAFlight PG", 56),
    ("Type IV PG", "Clariant Produkte (Deutschland) GmbH", "Safewing MP IV LAUNCH", 56),
    ("Type IV PG", "Clariant Produkte (Deutschland) GmbH", "Safewing MP IV LAUNCH PLUS", 56),
    ("Type IV PG", "Cryotech Deicing Technology", "Polar Guard® Advance", 56),
    ("Type IV PG", "Cryotech Deicing Technology", "Polar Guard® Xtend", 56),
    ("Type IV PG", "Dow Inc.", "UCAR™ FLIGHTGUARD™ AD-49", 56),
    ("Type IV PG", "ESSPO CHEMICALS D.O.O", "Nordwing PG4", None),
    ("Type IV PG", "Inland Technologies Inc.", "ECO-SHIELD®", None),
    ("Type IV PG", "JSC RCP Nordix", "Defrost ECO 4", 56),
    ("Type IV PG", "Kilfrost Limited", "ABC-S Plus", 56),
    ("Type IV PG", "LNT Solutions", "P450", None),
    ("Type IV PG", "MAX TECH LLC", "MTL 4-PG", None),
    ("Type IV PG", "MKS DevO Chemicals", "COREICEPHOB TYPE-IV PG", None),
    ("Type IV PG", "Newave Aerochemical Co. Ltd.", "FCY 9311", 56),
    ("Type IV PG", "Shaanxi Cleanway Aviation Chemical Co., Ltd", "Cleansurface IV", None),
]

# ---------------------------------------------------------------- Table 57: snowfall intensity vs visibility
# maxSM / maxM are the inclusive upper bounds of each visibility bin. Intensity columns:
# [day, OAT -1 °C and below], [day, above -1 °C], [night, -1 °C and below], [night, above -1 °C]
SNOW_VIS = {
    "table": 57, "page": 74, "title": "Snowfall Intensities as a Function of Prevailing Visibility",
    "rows": [
        {"sm": "≤1/4", "m": "≤400", "maxSM": 3/8, "maxM": 600, "i": ["heavy", "heavy", "heavy", "heavy"]},
        {"sm": "1/2", "m": "800", "maxSM": 5/8, "maxM": 1000, "i": ["moderate", "heavy", "heavy", "heavy"]},
        {"sm": "3/4", "m": "1200", "maxSM": 7/8, "maxM": 1400, "i": ["moderate", "moderate", "moderate", "heavy"]},
        {"sm": "1", "m": "1600", "maxSM": 9/8, "maxM": 1800, "i": ["light", "light", "moderate", "moderate"]},
        {"sm": "1 1/4", "m": "2000", "maxSM": 11/8, "maxM": 2200, "i": ["light", "light", "moderate", "moderate"]},
        {"sm": "1 1/2", "m": "2400", "maxSM": 13/8, "maxM": 2600, "i": ["light", "light", "moderate", "moderate"]},
        {"sm": "1 3/4", "m": "2800", "maxSM": 15/8, "maxM": 3000, "i": ["very light", "light", "light", "light"]},
        {"sm": "2", "m": "3200", "maxSM": 9/4, "maxM": 3600, "i": ["very light", "very light", "light", "light"]},
        {"sm": "2 1/2", "m": "4000", "maxSM": 11/4, "maxM": 4400, "i": ["very light", "very light", "light", "light"]},
        {"sm": "3", "m": "4800", "maxSM": 13/4, "maxM": 5200, "i": ["very light", "very light", "very light", "light"]},
        {"sm": "≥3 1/2", "m": "≥5600", "maxSM": None, "maxM": None, "i": ["very light", "very light", "very light", "very light"]},
    ],
    "notes": [
        "Use METAR/SPECI reported visibility or flight crew observed visibility to establish snowfall intensity, including when snow is accompanied by blowing/drifting snow or mixed with ice crystals, freezing fog, rain or drizzle.",
        "Runway Visual Range (RVR) is not permitted for determining visibility used with the holdover tables.",
        "Whenever surface visibility is available from an official source (METAR main body or RMK), prefer the surface visibility value over tower visibility.",
        "If visibility is reduced by snow plus obscurations (fog, haze, smoke), the table may overestimate snowfall intensity; use of the visibility table in all snow conditions is still recommended.",
    ],
}


# ---------------------------------------------------------------- verification
def _section(text, start, end):
    i = text.index(start)
    j = text.index(end, i)
    return text[i:j]


def verify(text, fail):
    # Table 1 frost: multiset of times in the section must equal transcription
    sec = _section(text, "TABLE 1: ACTIVE FROST", "NOTES")
    found = Counter(re.findall(r"\b\d{1,2}:\d{2}\b", sec))
    mine = Counter([FROST["typeI"]["aluminum"], FROST["typeI"]["composite"]])
    for b in FROST["bands"]:
        for vals in b["rows"].values():
            mine.update(vals)
    if found != mine:
        fail(f"Table 1 transcription mismatch: pdf={found} mine={mine}")
    if "No Holdover Time Guidelines Exist" not in sec:
        fail("Table 1: expected no-HOT text below -25 °C")

    # Allowance tables: the ordered sequence of 'N minutes' must match
    for tbl, start in ((AT_TYPE_III, "TABLE 54: ALLOWANCE"), (AT_TYPE_IV_EG, "TABLE 55: ALLOWANCE"),
                       (AT_TYPE_IV_PG, "TABLE 56: ALLOWANCE")):
        sec = _section(text, start, "NOTES")
        pdf_seq = [int(x) for x in re.findall(r"(\d+) minutes", sec)]
        mine = [v for r in tbl["rows"] for v in r["t"] if v is not None]
        if pdf_seq != mine:
            fail(f"Table {tbl['table']} transcription mismatch: pdf={pdf_seq} mine={mine}")
        for r in tbl["rows"]:
            if r["metar"].split(",")[0] not in sec:
                fail(f"Table {tbl['table']}: METAR {r['metar']} not in PDF")

    # Table 53 validation
    sec = _section(text, "TABLE 53: VALIDATION", "NOTES")
    flat = re.sub(r"\s+", " ", sec)
    n_valid = sec.count("ATs for Type")
    n_not = sec.count("Fluid has not been validated")
    if n_valid != sum(1 for r in AT_VALIDATION_TEXT if r[3]) or n_not != sum(1 for r in AT_VALIDATION_TEXT if not r[3]):
        fail(f"Table 53 counts mismatch valid={n_valid} not={n_not}")
    for _, _, name, _ in AT_VALIDATION_TEXT:
        probe = name.split()[0]
        if probe not in flat:
            fail(f"Table 53: {name} not found")

    # Table 57: sequence of intensities
    sec = _section(text, "TABLE 57: SNOWFALL", "NOTES")
    pdf_seq = [x.lower() for x in re.findall(r"Very Light|Light|Moderate|Heavy", sec.split("Above 30 °F", 1)[1])]
    mine = [x for r in SNOW_VIS["rows"] for x in r["i"]]
    if pdf_seq != mine:
        fail(f"Table 57 transcription mismatch:\n{pdf_seq}\n{mine}")


def verify_at_columns(text, fail):
    """Check the OAT column of every allowance time by its horizontal position in the layout text."""
    for tbl, start in ((AT_TYPE_III, "TABLE 54: ALLOWANCE"), (AT_TYPE_IV_EG, "TABLE 55: ALLOWANCE"),
                       (AT_TYPE_IV_PG, "TABLE 56: ALLOWANCE")):
        sec = _section(text, start, "NOTES")
        rows = []
        for ln in sec.splitlines():
            toks = [(m.start(), int(m.group(1))) for m in re.finditer(r"(\d+) minutes", ln)]
            if toks:
                rows.append(toks)
        # column anchors = positions in the first row (which has a value in every column that exists)
        anchors = [p for p, _ in rows[0]]
        if len(rows) != len(tbl["rows"]):
            fail(f"Table {tbl['table']}: {len(rows)} value rows vs {len(tbl['rows'])}")
        for toks, r in zip(rows, tbl["rows"]):
            got = [None] * len(r["t"])
            for p, v in toks:
                col = min(range(len(anchors)), key=lambda k: abs(anchors[k] - p))
                if abs(anchors[col] - p) > 6:
                    fail(f"Table {tbl['table']}: cannot place value {v} at {p}")
                got[col] = v
            if got != r["t"]:
                fail(f"Table {tbl['table']} row {r['id']}: columns pdf={got} mine={r['t']}")
