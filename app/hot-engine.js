/*
 * Holdover-time lookup engine for the FAA HOT Guidelines, Winter 2026-2027.
 * Pure functions over the generated data (app/data/hot-2026-27.js). No DOM access,
 * so it can be unit-tested in Node (see tests/engine.test.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HotEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SNOW_INTENSITIES = ["very light", "light", "moderate", "heavy"];

  // Precipitation / condition choices offered to the user.
  const WEATHER = [
    { id: "frost", label: "Active Frost" },
    { id: "fzfg", label: "Freezing Fog, Freezing Mist, or Ice Crystals" },
    { id: "snow", label: "Snow, Snow Grains or Snow Pellets", needsIntensity: true },
    { id: "snfzfg", label: "Snow mixed with Freezing Fog" },
    { id: "fzdz", label: "Freezing Drizzle (light, moderate or heavy)" },
    { id: "fzra_l", label: "Light Freezing Rain" },
    { id: "snra_m", label: "Moderate Snow mixed with Rain" },
    { id: "snra_l", label: "Very Light or Light Snow mixed with Light Rain or Drizzle" },
    { id: "rain_csw", label: "Rain on Cold-Soaked Wing" },
    { id: "other", label: "Other: heavy snow, ice pellets, moderate/heavy freezing rain, small hail, hail" },
  ];

  const toF = (c) => (c * 9) / 5 + 32;
  const toC = (f) => ((f - 32) * 5) / 9;

  function fmt(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  /** Band test: lower bound inclusive, upper bound exclusive ("below X"), null = unbounded. */
  function inBand(r, t) {
    if (r.lo !== null && r.lo !== undefined) {
      if (r.loInc === false ? !(t > r.lo) : !(t >= r.lo)) return false;
    }
    if (r.hi !== null && r.hi !== undefined) {
      if (r.hiInc ? !(t <= r.hi) : !(t < r.hi)) return false;
    }
    return true;
  }

  /** OAT in the selected unit; tables give both °C and °F bands, so use the matching one. */
  function findBand(bands, oat, unit) {
    const key = unit === "F" ? "f" : "c";
    return bands.find((b) => inBand(b[key], oat)) || null;
  }

  function aboveZero(oat, unit) {
    return unit === "F" ? oat > 32 : oat > 0;
  }

  function tableById(data, id) {
    return data.tables.find((t) => t.id === id) || null;
  }

  function fluidsOfType(data, type) {
    return data.tables.filter((t) => t.type === type);
  }

  function noHot(reason, extra) {
    return Object.assign({ ok: false, reason }, extra || {});
  }

  /**
   * Main lookup.
   * q = { tableId, conc: "100/0"|"75/25"|"50/50", oat: number, unit: "C"|"F",
   *       weather: WEATHER id, intensity?: "very light"|"light"|"moderate"|"heavy" }
   * returns { ok:true, min, max, text, table, page, band, column, notes[] } or { ok:false, reason, ... }
   */
  function lookup(data, q) {
    const tbl = tableById(data, q.tableId);
    if (!tbl) return noHot("Select a fluid.");
    if (typeof q.oat !== "number" || Number.isNaN(q.oat)) return noHot("Enter the outside air temperature.");
    const conc = tbl.type === "I" ? "100/0" : q.conc;
    if (q.weather === "frost") return lookupFrost(data, tbl, conc, q.oat, q.unit);

    const src = { table: tbl.table, page: tbl.page, tableTitle: tbl.title };
    let column = q.weather;
    const notes = [];

    if (q.weather === "other") {
      const r = noHot("No holdover time guidelines exist for heavy snow, ice pellets, moderate and heavy freezing rain, small hail and hail.", src);
      if (tbl.allowanceTable || tbl.type === "IV" || tbl.type === "III") {
        r.hint = "For ice pellets or small hail, allowance times may apply to some undiluted Type III and Type IV fluids. See the Allowance tab.";
      }
      return r;
    }
    if (q.weather === "snra_l") {
      // Notes: "In cases of very light or light snow mixed with light rain or drizzle, use light freezing rain holdover times."
      column = "fzra_l";
      notes.push("Very light or light snow mixed with light rain or drizzle: the guidelines direct use of the light freezing rain holdover times.");
    }
    if (q.weather === "snow") {
      const i = q.intensity;
      if (!i) return noHot("Select the snowfall intensity (use the Snowfall Intensity helper / Table 57).", src);
      if (i === "heavy") return noHot("No holdover time guidelines exist for heavy snow.", src);
      if (tbl.columns.includes("sn_vl")) column = { "very light": "sn_vl", light: "sn_l", moderate: "sn_m" }[i];
      else column = "sn";
    }
    if (column === "snra_m" || column === "rain_csw") {
      if (!aboveZero(q.oat, q.unit)) {
        return noHot("No holdover time guidelines exist for this condition at 0 °C (32 °F) and below.", src);
      }
    }

    const band = findBand(tbl.bands, q.oat, q.unit);
    if (!band) {
      const coldest = tbl.bands[tbl.bands.length - 1];
      const warmest = tbl.bands[0];
      const below = q.unit === "F" ? coldest.f.lo !== null && q.oat < coldest.f.lo : coldest.c.lo !== null && q.oat < coldest.c.lo;
      return noHot(
        below
          ? `OAT is below the coldest temperature in this table (${q.unit === "F" ? coldest.labelF : coldest.labelC}). No holdover times exist. Respect the fluid's LOUT.`
          : `OAT is outside this table (${q.unit === "F" ? warmest.labelF : warmest.labelC}).`,
        src
      );
    }
    src.band = q.unit === "F" ? band.labelF : band.labelC;
    src.bandAlt = q.unit === "F" ? band.labelC : band.labelF;

    const row = band.rows.find((r) => r.conc === conc);
    if (!row) return noHot(`No holdover times exist for ${conc} dilution at this temperature.`, src);
    const cell = row.values[column];
    src.column = column;
    if (!cell) return noHot("No holdover time guidelines exist for this condition at this temperature.", src);
    if (cell.na) return noHot("N/A: this fluid has no holdover times for this dilution.", src);
    if (cell.noHotBelowC !== undefined) {
      const limit = q.unit === "F" ? cell.noHotBelowF : cell.noHotBelowC;
      if (q.oat < limit) {
        return noHot(`No holdover time guidelines exist for this condition below ${cell.noHotBelowC} °C (${cell.noHotBelowF} °F).`, src);
      }
    }
    return Object.assign({ ok: true, min: cell.min, max: cell.max, text: cell.text, conc, notes, row }, src);
  }

  function lookupFrost(data, tbl, conc, oat, unit) {
    const fr = data.frost;
    const src = { table: fr.table, page: fr.page, tableTitle: fr.title, column: "frost" };
    const notes = ["Use the holdover time for the coldest OAT occurring between fluid application and takeoff."];
    if (tbl.type === "I") {
      const t = fr.typeI[tbl.surface];
      const [h, m] = t.split(":").map(Number);
      const band = findBand(fr.bands, oat, unit);
      src.band = "All temperatures (Type I)";
      notes.push("Type I fluid/water mixture freezing point must be at least 10 °C (18 °F) below OAT. Respect the LOUT.");
      void band;
      return Object.assign({ ok: true, min: h * 60 + m, max: h * 60 + m, text: t, single: true, conc: "n/a", notes }, src);
    }
    if (tbl.type === "III" && !/AEROCLEAR MAX/.test(tbl.brandUpper || "")) {
      return noHot("Type III frost holdover times apply only to AllClear AeroClear MAX applied unheated.", src);
    }
    const band = findBand(fr.bands, oat, unit);
    if (!band) return noHot("OAT outside frost table.", src);
    src.band = unit === "F" ? band.labelF : band.labelC;
    src.bandAlt = unit === "F" ? band.labelC : band.labelF;
    if (band.noHot) return noHot("No holdover time guidelines exist below -25 °C (-13 °F).", src);
    const vals = band.rows[conc];
    if (!vals) return noHot(`No frost holdover times exist for ${conc} dilution at this temperature.`, src);
    const t = vals[{ II: 0, III: 1, IV: 2 }[tbl.type]];
    const [h, m] = t.split(":").map(Number);
    if (tbl.type === "III") notes.push("AllClear AeroClear MAX must be applied unheated.");
    if (!tbl.generic) notes.push("Active frost times in Table 1 are generic for the fluid type (not brand-specific).");
    // A fluid's own table may not reach this OAT (LOUT) even though the frost table does
    const own = findBand(tbl.bands, oat, unit);
    if (!own) notes.push(`Caution: this OAT is outside ${tbl.name}'s own holdover table (Table ${tbl.table}). Verify the fluid's LOUT.`);
    return Object.assign({ ok: true, min: h * 60 + m, max: h * 60 + m, text: t, single: true, conc, notes }, src);
  }

  /** Table 57: visibility in statute miles or metres -> snowfall intensity. */
  function snowIntensity(data, vis, visUnit, isNight, oat, unit) {
    const sv = data.snowVisibility;
    const cold = unit === "F" ? oat <= 30 : oat <= -1;
    const idx = (isNight ? 2 : 0) + (cold ? 0 : 1);
    const key = visUnit === "m" ? "maxM" : "maxSM";
    const row = sv.rows.find((r) => r[key] === null || vis <= r[key] + 1e-9);
    return { intensity: row.i[idx], row, column: idx };
  }

  /**
   * Allowance times (ice pellets / small hail). q = { fluidGroup: "III"|"IV-EG"|"IV-PG", validated: bool,
   *   condition: row id, oat, unit, rotationKt: number }
   */
  function allowance(data, q) {
    const at = data.allowance[q.fluidGroup];
    if (!at) return noHot("Select a fluid.");
    const src = { table: at.table, page: at.page, tableTitle: at.title };
    if (!q.validated) return noHot("This fluid has not been validated for allowance times (Table 53). No allowance times exist.", src);
    if (typeof q.oat !== "number" || Number.isNaN(q.oat)) return noHot("Enter the outside air temperature.", src);
    // Columns carry both the °C and the FAA's °F bounds; use the unit the user entered.
    const colIdx = at.columns.findIndex((c) => inBand(q.unit === "F" ? c.f : c.c, q.oat));
    if (colIdx < 0) return noHot("No allowance times exist at this temperature.", src);
    const col = at.columns[colIdx];
    src.band = q.unit === "F" ? col.labelF : col.labelC;
    const row = at.rows.find((r) => r.id === q.condition);
    if (!row) return noHot("Select the precipitation condition.", src);
    src.condition = row.name;
    src.metar = row.metar;
    const minKt = col.minRotationKt || 100;
    if (!q.rotationKt || q.rotationKt < minKt) {
      return noHot(`No allowance times exist for aircraft with rotation speeds less than ${minKt} knots in this condition/temperature.`, src);
    }
    const t = row.t[colIdx];
    if (t === null || t === undefined) return noHot("Caution: No allowance times currently exist for this condition at this temperature.", src);
    return Object.assign({ ok: true, minutes: t }, src);
  }

  return { WEATHER, SNOW_INTENSITIES, lookup, snowIntensity, allowance, findBand, inBand, fmt, toC, toF, tableById, fluidsOfType };
});
