/*
 * METAR decoding and HOT-condition assessment.
 *
 * The assessment follows the FAA HOT Guidelines Winter 2026-2027 and the FAA Ground Deicing Program
 * General Information document (Issue 4, 08/11/26):
 *   - snowfall intensity is taken from visibility (Table 57), not the METAR intensity
 *   - Table 3 "METAR Codes and Holdover or Allowance Times Used by Country" for SG / GS / SHGS / GR / PL
 *   - mixed conditions only where the guidelines provide HOTs or allowance times; otherwise "no HOT"
 * It is a SUGGESTION for the user to confirm. It never replaces the crew's observation.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Metar = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DESC = ["MI", "PR", "BC", "DR", "BL", "SH", "TS", "FZ"];
  const PHEN = ["DZ", "RA", "SN", "SG", "IC", "PL", "GR", "GS", "UP", "BR", "FG", "FU", "VA", "DU", "SA", "HZ", "PY", "PO", "SQ", "FC", "SS", "DS"];
  const WX_RE = new RegExp(`^(\\+|-|VC)?((?:${DESC.join("|")})*)((?:${PHEN.join("|")})*)$`);
  const NAMES = {
    DZ: "drizzle", RA: "rain", SN: "snow", SG: "snow grains", IC: "ice crystals", PL: "ice pellets", GR: "hail", GS: "small hail/snow pellets",
    UP: "unknown precipitation", BR: "mist", FG: "fog", FU: "smoke", VA: "volcanic ash", DU: "dust", SA: "sand", HZ: "haze", PY: "spray",
    PO: "dust whirls", SQ: "squalls", FC: "funnel cloud", SS: "sandstorm", DS: "duststorm",
    MI: "shallow", PR: "partial", BC: "patches", DR: "low drifting", BL: "blowing", SH: "showers", TS: "thunderstorm", FZ: "freezing",
  };

  function frac(s) {
    // "1/2" -> 0.5, "1" -> 1, "1 1/2" -> 1.5
    return s.trim().split(/\s+/).reduce((acc, p) => {
      if (p.includes("/")) { const [a, b] = p.split("/").map(Number); return acc + a / b; }
      return acc + Number(p);
    }, 0);
  }

  /** Split a 2-letter-code string ("FZRASN") into codes, or null if it doesn't tokenize cleanly. */
  function pairs(s, allowed) {
    const out = [];
    for (let i = 0; i < s.length; i += 2) {
      const c = s.slice(i, i + 2);
      if (!allowed.includes(c)) return null;
      out.push(c);
    }
    return out;
  }

  function parseWxGroup(tok) {
    const m = WX_RE.exec(tok);
    if (!m) return null;
    const desc = pairs(m[2], DESC), ph = pairs(m[3], PHEN);
    if (!desc || !ph || (desc.length === 0 && ph.length === 0)) return null;
    if (ph.length === 0 && !desc.includes("TS")) return null;
    const intensity = m[1] === "+" ? "heavy" : m[1] === "-" ? "light" : m[1] === "VC" ? "vicinity" : "moderate";
    const text = [m[1] === "+" ? "heavy" : m[1] === "-" ? "light" : m[1] === "VC" ? "in vicinity:" : "",
      ...desc.map((d) => NAMES[d]), ...ph.map((p) => NAMES[p])].filter(Boolean).join(" ");
    return { raw: tok, intensity, vc: m[1] === "VC", desc, ph, text };
  }

  /**
   * Parse a raw METAR/SPECI. `now` (Date) anchors the DDHHMMZ observation time to a month/year.
   */
  function parse(raw, now = new Date()) {
    const r = { raw: String(raw).trim().replace(/\s+/g, " ").replace(/=$/, ""), warnings: [] };
    let toks = r.raw.split(" ");
    if (toks[0] === "METAR" || toks[0] === "SPECI") { r.type = toks[0]; toks = toks.slice(1); }
    if (toks[0] === "COR") toks = toks.slice(1);
    if (!/^[A-Z][A-Z0-9]{3}$/.test(toks[0] || "")) { r.error = "Could not find a 4-letter station identifier."; return r; }
    r.station = toks[0];
    const rmkIdx = toks.indexOf("RMK");
    const body = rmkIdx >= 0 ? toks.slice(1, rmkIdx) : toks.slice(1);
    r.rmk = rmkIdx >= 0 ? toks.slice(rmkIdx + 1).join(" ") : "";

    let i = 0;
    const tm = /^(\d{2})(\d{2})(\d{2})Z$/.exec(body[i] || "");
    if (tm) {
      const [d, h, mi] = [Number(tm[1]), Number(tm[2]), Number(tm[3])];
      let dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d, h, mi));
      if (dt.getTime() > now.getTime() + 36 * 3600e3) dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, d, h, mi));
      r.time = dt;
      i++;
    } else r.warnings.push("No observation time found.");
    if (body[i] === "AUTO" || body[i] === "COR") { r.auto = body[i] === "AUTO"; i++; }
    const wind = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(body[i] || "");
    if (wind) { r.wind = { dir: wind[1], speed: Number(wind[2]), gust: wind[3] ? Number(wind[3]) : null, unit: wind[4] }; i++; }
    if (/^\d{3}V\d{3}$/.test(body[i] || "")) i++;

    // visibility
    if (body[i] === "CAVOK") { r.vis = { m: 10000, sm: 6.2, text: "CAVOK (10 km or more)" }; i++; }
    else {
      let m;
      if (/^\d$/.test(body[i] || "") && /^\d\/\dSM$/.test(body[i + 1] || "")) {
        const v = frac(`${body[i]} ${body[i + 1].replace("SM", "")}`);
        r.vis = { sm: v, text: `${body[i]} ${body[i + 1]}` }; i += 2;
      } else if ((m = /^([MP])?(\d+(?:\/\d+)?)SM$/.exec(body[i] || ""))) {
        let v = frac(m[2]);
        if (m[1] === "M") v = v * 0.99; // "less than"
        if (m[1] === "P") v = v + 0.5;  // "more than"
        r.vis = { sm: v, text: body[i] }; i++;
      } else if ((m = /^(\d{4})(NDV|[NSEW]{1,2})?$/.exec(body[i] || ""))) {
        const v = Number(m[1]);
        r.vis = { m: v === 9999 ? 10000 : v, text: v === 9999 ? "10 km or more" : `${v} m` }; i++;
      }
    }
    // US: if the body visibility is tower visibility, surface visibility is in remarks (SFC VIS ...)
    const sfc = /SFC VIS (M?\d+(?: \d\/\d)?(?:\/\d+)?)/.exec(r.rmk);
    if (sfc) {
      r.vis = { sm: frac(sfc[1].replace("M", "")) * (sfc[1].startsWith("M") ? 0.99 : 1), text: `${sfc[1]} SM (surface visibility from remarks)`, fromRemarks: true };
    }

    // weather groups, temperature
    r.wx = [];
    for (; i < body.length; i++) {
      const t = body[i];
      if (/^(TEMPO|BECMG|NOSIG|FM\d+)$/.test(t)) break;
      if (/^R\d{2}[LCR]?\//.test(t)) continue; // RVR is not used for HOTs
      const g = parseWxGroup(t);
      if (g) { r.wx.push(g); continue; }
      const tt = /^(M?\d{2})\/(M?\d{2})?$/.exec(t);
      if (tt) {
        const n = (s) => (s.startsWith("M") ? -Number(s.slice(1)) : Number(s));
        r.tempC = n(tt[1]);
        r.dewC = tt[2] ? n(tt[2]) : null;
        r.tempPrecise = false;
      }
    }
    const tg = /\bT([01])(\d{3})([01])(\d{3})\b/.exec(r.rmk);
    if (tg) {
      r.tempC = (tg[1] === "1" ? -1 : 1) * Number(tg[2]) / 10;
      r.dewC = (tg[3] === "1" ? -1 : 1) * Number(tg[4]) / 10;
      r.tempPrecise = true;
    } else {
      const tg2 = /\bT([01])(\d{3})\b/.exec(r.rmk);
      if (tg2) { r.tempC = (tg2[1] === "1" ? -1 : 1) * Number(tg2[2]) / 10; r.tempPrecise = true; }
    }
    if (r.tempC === undefined) r.warnings.push("No temperature in this report.");
    return r;
  }

  function country(station) {
    if (/^(K|PA|PH|PG|PW|PJ|PM|PO|PP|TJ|TI)/.test(station)) return "US";
    if (/^C/.test(station)) return "CA";
    return "ROW";
  }

  /** Solar elevation in degrees (NOAA approximation). */
  function sunElevation(lat, lon, date) {
    const rad = Math.PI / 180;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const eps = (23.439 - 0.0000004 * n) * rad;
    const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    const ha = ((gmst * 15 + lon) * rad) - ra;
    return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
  }
  /** Day = sun above the horizon (refraction-corrected sunrise/sunset). */
  function isNight(lat, lon, date) { return sunElevation(lat, lon, date) < -0.833; }

  function snowFromVis(data, vis, night, oatC) {
    const sv = data.snowVisibility.rows;
    let row;
    if (vis.sm !== undefined) row = sv.findIndex((r) => r.maxSM === null || vis.sm <= r.maxSM + 1e-9);
    else row = sv.findIndex((r) => r.maxM === null || vis.m <= r.maxM);
    const cold = oatC <= -1;
    return { row, intensity: sv[row].i[(night ? 2 : 0) + (cold ? 0 : 1)] };
  }

  const AT_LIGHT = { "": "pl_l", SN: "pl_l_sn_l", FZDZ: "pl_l_fzdz_l", DZ: "pl_l_dz_l", FZRA: "pl_l_fzra_l", RA: "pl_l_ra_l", "FZRA+SN": "pl_l_fzra_l_sn_l", "RA+SN": "pl_l_ra_l_sn_l" };
  const AT_MOD = { "": "pl_m", SN: "pl_m_sn_m", FZDZ: "pl_m_fzdz", DZ: "pl_m_dz", RA: "pl_m_ra_m" };
  const OBSCURATION = new Set(["BR", "FG", "FZFG", "HZ", "FU", "DU", "SA", "PY", "VA"]);

  /**
   * Turn a parsed METAR into a suggested calculator input.
   * opts = { data: HOT_DATA, night: boolean|null }
   * returns { kind: "hot"|"allowance"|"none"|"nowx", weather?, intensity?, visRow?, atCondition?, oatC, summary, notes[], warnings[] }
   */
  function assess(m, opts) {
    const out = { notes: [], warnings: m.warnings.slice(), oatC: m.tempC, country: country(m.station || "") };
    const ctry = out.country;
    const oat = m.tempC;
    if (!m.tempPrecise && oat !== undefined) out.notes.push("Temperature is rounded to the nearest whole degree in the METAR body (no T-group in remarks). Near a band boundary, use the actual OAT.");

    // Build the set of components (excluding vicinity groups)
    const comps = new Set();
    let anyHeavy = false, allLight = true;
    const precipGroups = [];
    let metarSnowIntensity = null;
    for (const g of m.wx) {
      if (g.vc) { out.notes.push(`Weather in the vicinity (${g.raw}) is not at the aerodrome and is not used.`); continue; }
      const fz = g.desc.includes("FZ");
      let fzUsed = false;
      let hasPrecip = false;
      g.ph.forEach((p) => {
        let c = p;
        if (fz && !fzUsed && (p === "DZ" || p === "RA" || p === "FG")) { c = "FZ" + p; fzUsed = true; }
        if (p === "SN" && (g.desc.includes("BL") || g.desc.includes("DR")) && g.ph.length === 1) c = g.desc.includes("BL") ? "BLSN" : "DRSN";
        if (p === "SG") c = "SN"; // snow grains -> snow holdover times (all countries)
        if (p === "GS") c = g.desc.includes("SH") ? "SHGS" : g.desc.includes("TS") ? "TSGS" : "GS";
        comps.add(c);
        if (!OBSCURATION.has(c) && c !== "BLSN" && c !== "DRSN") hasPrecip = true;
        if ((p === "SN" || p === "SG") && metarSnowIntensity === null && c === "SN") metarSnowIntensity = g.intensity;
      });
      if (hasPrecip) {
        precipGroups.push(g);
        if (g.intensity === "heavy") anyHeavy = true;
        if (g.intensity !== "light") allLight = false;
      }
    }
    const precipInt = anyHeavy ? "heavy" : precipGroups.length && allLight ? "light" : "moderate";

    // --- Country-specific codes (General Information Table 3)
    const hailRmkSmall = /GR LESS THAN 1\/4/.test(m.rmk || "");
    if (comps.has("GR")) {
      if (ctry === "US" && hailRmkSmall) { comps.delete("GR"); comps.add("PL"); out.notes.push("GR with remark “less than 1/4”: small hail → ice pellet allowance times (FAA GI Table 3)."); }
      else return Object.assign(out, { kind: "none", summary: "Hail (GR)", reason: "No holdover times or allowance times exist for hail." });
    }
    for (const gs of ["GS", "SHGS", "TSGS"]) {
      if (!comps.has(gs)) continue;
      comps.delete(gs);
      const hailRemark = /\b(GS|HAIL)\b.*\d\/\d|DIAM|DIA /.test(m.rmk || "");
      if (ctry === "US") { comps.add("SN"); out.notes.push(`${gs} in the US = snow pellets → snow holdover times (FAA GI Table 3).`); }
      else if (ctry === "CA") {
        if (gs !== "GS" && hailRemark) { comps.add("PL"); out.notes.push(`${gs} with hail-diameter remark in Canada = small hail → ice pellet allowance times (FAA GI Table 3).`); }
        else { comps.add("SN"); out.notes.push(`${gs} in Canada without hail-diameter remark = snow pellets → snow holdover times (FAA GI Table 3).`); }
      } else { comps.add("PL"); out.notes.push(`${gs} outside the US/Canada = snow pellets or small hail → ice pellet allowance times. If other information makes clear it is snow pellets, snow HOTs can be used (FAA GI Table 3).`); }
    }
    if (comps.has("UP")) return Object.assign(out, { kind: "none", summary: "Unknown precipitation (UP)", reason: "Unknown precipitation reported by an automated station. Determine the actual precipitation type by observation." });

    const precip = [...comps].filter((c) => !OBSCURATION.has(c) && c !== "BLSN" && c !== "DRSN" && c !== "IC");
    const hasIC = comps.has("IC");
    const fzfg = comps.has("FZFG");

    // --- Ice pellets / small hail -> allowance times
    if (comps.has("PL")) {
      const others = precip.filter((c) => c !== "PL").sort().join("+");
      if (precipInt === "heavy") return Object.assign(out, { kind: "none", summary: "Heavy ice pellets / mixed", reason: "No holdover or allowance times exist for heavy ice pellets." });
      const id = (precipInt === "light" ? AT_LIGHT : AT_MOD)[others];
      if (!id) return Object.assign(out, { kind: "none", summary: `Ice pellets mixed with ${others || "?"}`, reason: "No allowance times exist for this mixed condition." });
      return Object.assign(out, { kind: "allowance", atCondition: id, summary: `${precipInt === "light" ? "Light" : "Moderate"} ice pellets${others ? " mixed with " + others : ""}` });
    }

    // --- Snow (and mixes for which HOTs exist)
    const nightKnown = typeof opts.night === "boolean";
    if (precip.includes("SN")) {
      const others = precip.filter((c) => c !== "SN");
      if (!m.vis) return Object.assign(out, { kind: "hot", weather: "snow", needsIntensity: true, summary: "Snow", reason: "No visibility in the report. Determine snowfall intensity from observed visibility." });
      if (oat === undefined) return Object.assign(out, { kind: "hot", weather: "snow", needsIntensity: true, summary: "Snow" });
      if (!nightKnown) out.warnings.push("Day/night not known for this station. Confirm Day or Night: it changes the snowfall intensity.");
      const s = snowFromVis(opts.data, m.vis, !!opts.night, oat);
      out.visRow = s.row;
      out.intensity = s.intensity;
      const order = { light: 1, moderate: 2, heavy: 3 };
      if (metarSnowIntensity && order[metarSnowIntensity] > (order[s.intensity] || 0)) {
        out.warnings.push(`METAR reports ${metarSnowIntensity} snow but the visibility table gives ${s.intensity}. The guidelines use the visibility table; consider the more severe value.`);
      }
      out.notes.push(`Snowfall intensity from visibility ${m.vis.text}, ${opts.night ? "night" : "day"}, OAT ${oat} °C → ${s.intensity} (Table 57).`);
      if (s.intensity === "heavy") return Object.assign(out, { kind: "none", weather: "other", summary: "Heavy snow (by visibility)", reason: "No holdover times exist for heavy snow." });
      if (others.length === 0) {
        if (fzfg) return Object.assign(out, { kind: "hot", weather: "snfzfg", summary: "Snow mixed with freezing fog" });
        if (hasIC) out.notes.push("Snow mixed with ice crystals → snow holdover times.");
        return Object.assign(out, { kind: "hot", weather: "snow", summary: `${s.intensity[0].toUpperCase() + s.intensity.slice(1)} snow` });
      }
      if (others.every((c) => c === "RA" || c === "DZ")) {
        if (s.intensity === "moderate") {
          if (others.includes("RA")) return Object.assign(out, { kind: "hot", weather: "snra_m", summary: "Moderate snow mixed with rain" });
          return Object.assign(out, { kind: "none", summary: "Moderate snow mixed with drizzle", reason: "The guidelines provide no holdover times for moderate snow mixed with drizzle." });
        }
        return Object.assign(out, { kind: "hot", weather: "snra_l", summary: "Very light/light snow mixed with light rain or drizzle" });
      }
      return Object.assign(out, { kind: "none", summary: `Snow mixed with ${others.join(", ")}`, reason: "Mixed condition for which the guidelines provide no holdover times." });
    }

    // --- Freezing rain / drizzle
    if (precip.includes("FZRA")) {
      if (precip.length > 1) return Object.assign(out, { kind: "none", summary: "Freezing rain mixed", reason: "Mixed condition for which the guidelines provide no holdover times." });
      const g = precipGroups.find((x) => x.desc.includes("FZ"));
      if (g && g.intensity === "light") return Object.assign(out, { kind: "hot", weather: "fzra_l", summary: "Light freezing rain" });
      return Object.assign(out, { kind: "none", weather: "other", summary: `${g ? g.intensity : ""} freezing rain`, reason: "No holdover times exist for moderate or heavy freezing rain." });
    }
    if (precip.includes("FZDZ")) {
      if (precip.length > 1) return Object.assign(out, { kind: "none", summary: "Freezing drizzle mixed", reason: "Mixed condition for which the guidelines provide no holdover times." });
      return Object.assign(out, { kind: "hot", weather: "fzdz", summary: "Freezing drizzle" });
    }

    // --- Rain / drizzle
    if (precip.some((c) => c === "RA" || c === "DZ")) {
      if (oat !== undefined && oat > 0) {
        out.notes.push("Holdover times for rain apply only to rain on a cold-soaked wing (frost or ice on the wing in the fuel-tank area).");
        return Object.assign(out, { kind: "hot", weather: "rain_csw", confirm: true, summary: "Rain/drizzle above 0 °C" });
      }
      return Object.assign(out, { kind: "none", summary: "Rain/drizzle at or below 0 °C", reason: "Rain or drizzle at or below 0 °C reported without FZ. Confirm the precipitation type. If it is freezing, use the freezing drizzle/rain condition." });
    }

    // --- No precipitation: fog / mist / ice crystals
    if (fzfg || hasIC) return Object.assign(out, { kind: "hot", weather: "fzfg", summary: fzfg ? "Freezing fog" + (hasIC ? " with ice crystals" : "") : "Ice crystals" });
    if (oat !== undefined && oat <= 0 && (comps.has("BR") || comps.has("FG"))) {
      out.notes.push("Freezing mist is not reported in METAR but can occur when mist is present at 0 °C and below. Best confirmed by observation.");
      return Object.assign(out, { kind: "hot", weather: "fzfg", confirm: true, summary: comps.has("FG") ? "Fog at or below 0 °C" : "Mist at or below 0 °C (possible freezing mist)" });
    }
    if (comps.has("BLSN") || comps.has("DRSN")) out.notes.push("Blowing/drifting snow without falling snow is not a precipitation condition, but blowing snow may reduce holdover time.");
    out.notes.push("No freezing or frozen precipitation reported. Active frost is not reported in METAR: if frost is forming (surface at or below 0 °C and at or below the frost point), use Active Frost.");
    return Object.assign(out, { kind: "nowx", summary: "No precipitation or freezing fog reported", frostPossible: oat !== undefined && oat <= 5 });
  }

  function describe(m) {
    const parts = [];
    if (m.wx && m.wx.length) parts.push(m.wx.map((g) => g.text).join(", "));
    else parts.push("no significant weather");
    return parts.join("; ");
  }

  return { parse, assess, country, sunElevation, isNight, snowFromVis, describe, parseWxGroup };
});
