// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

global.window = {};
require(path.join(__dirname, "../app/data/hot-2026-27.js"));
const D = global.window.HOT_DATA;
const E = require(path.join(__dirname, "../app/hot-engine.js"));

const L = (q) => E.lookup(D, Object.assign({ unit: "C", conc: "100/0" }, q));
const ok = (r, text) => { assert.equal(r.ok, true, r.reason); assert.equal(r.text, text); };
const none = (r, re) => { assert.equal(r.ok, false, `expected no HOT, got ${r.text}`); if (re) assert.match(r.reason, re); };

test("data is the 2026-2027 edition", () => {
  assert.match(D.source.title, /Winter 2026-2027/);
  assert.equal(D.tables.length, 51);
});

test("Generic Type IV (Table 20)", () => {
  ok(L({ tableId: "typeIV-generic", oat: -5, weather: "snow", intensity: "light" }), "0:45 - 1:35");
  ok(L({ tableId: "typeIV-generic", oat: -3, weather: "snow", intensity: "light" }), "0:55 - 1:50"); // -3 is "-3 °C and above"
  ok(L({ tableId: "typeIV-generic", oat: 1, conc: "75/25", weather: "fzfg" }), "1:25 - 2:40");
  ok(L({ tableId: "typeIV-generic", oat: -9, weather: "fzdz" }), "0:25 - 1:00");
  none(L({ tableId: "typeIV-generic", oat: -10.5, weather: "fzdz" }), /below -10/); // note 11
  ok(L({ tableId: "typeIV-generic", oat: -10, weather: "fzdz" }), "0:25 - 1:00");
  ok(L({ tableId: "typeIV-generic", oat: -30, weather: "snow", intensity: "moderate" }), "0:00 - 0:02");
  none(L({ tableId: "typeIV-generic", oat: -5, conc: "50/50", weather: "fzfg" }), /50\/50/);
  none(L({ tableId: "typeIV-generic", oat: -1, weather: "snow", intensity: "heavy" }), /heavy/);
  none(L({ tableId: "typeIV-generic", oat: -1, weather: "other" }));
});

test("Fahrenheit uses the FAA °F bands", () => {
  ok(L({ tableId: "typeIV-generic", unit: "F", oat: 27, weather: "snow", intensity: "light" }), "0:55 - 1:50");
  ok(L({ tableId: "typeIV-generic", unit: "F", oat: 26, weather: "snow", intensity: "light" }), "0:45 - 1:35");
  none(L({ tableId: "typeIV-generic", unit: "F", oat: 13, weather: "fzdz" }), /below -10/);
  ok(L({ tableId: "typeIV-generic", unit: "F", oat: 14, weather: "fzdz" }), "0:25 - 1:00");
});

test("Generic Type II (Table 4) uses a single snow column", () => {
  ok(L({ tableId: "typeII-generic", oat: 0, weather: "snow", intensity: "moderate" }), "0:30 - 0:55");
  ok(L({ tableId: "typeII-generic", oat: 2, weather: "snra_m" }), "0:05 - 0:05");
  ok(L({ tableId: "typeII-generic", oat: 2, weather: "rain_csw" }), "0:07 - 0:45");
  none(L({ tableId: "typeII-generic", oat: 0, weather: "rain_csw" }), /0 °C/);
  none(L({ tableId: "typeII-generic", oat: -5, conc: "50/50", weather: "fzfg" }));
});

test("Type I (Tables 2/3)", () => {
  ok(L({ tableId: "typeI-aluminum", oat: -2, weather: "fzfg" }), "0:11 - 0:17");
  ok(L({ tableId: "typeI-aluminum", oat: -12, weather: "snow", intensity: "very light" }), "0:07 - 0:08");
  none(L({ tableId: "typeI-aluminum", oat: -12, weather: "fzdz" }));
  ok(L({ tableId: "typeI-composite", oat: -4, weather: "fzfg" }), "0:06 - 0:08");
  ok(L({ tableId: "typeI-aluminum", oat: 3, weather: "rain_csw" }), "0:02 - 0:05");
  ok(L({ tableId: "typeI-aluminum", oat: 3, weather: "snra_l" }), "0:02 - 0:05"); // uses light freezing rain column
});

test("Brand tables", () => {
  const ad49 = "typeIV-abax-ecowing-ad-49";
  ok(L({ tableId: ad49, oat: -1, weather: "snow", intensity: "very light" }), "3:00 - 3:00");
  none(L({ tableId: ad49, oat: -1, conc: "75/25", weather: "fzfg" }), /N\/A/);
  ok(L({ tableId: ad49, oat: -26, weather: "fzfg" }), "0:25 - 0:40");
  none(L({ tableId: ad49, oat: -27, weather: "fzfg" }), /coldest/); // below -26 °C LOUT band
  ok(L({ tableId: "typeII-cryotech-polar-guard-ii", oat: -30, weather: "fzfg" }), "0:25 - 0:50");
  none(L({ tableId: "typeII-cryotech-polar-guard-ii", oat: -31, weather: "fzfg" }));
  ok(L({ tableId: "typeII-abax-ecowing-ad-2", oat: -9, weather: "fzra_l" }), "0:20 - 0:30");
});

test("Type III AeroClear MAX low speed (Table 17)", () => {
  ok(L({ tableId: "typeIII-allclear-aeroclear-max-low", oat: -5, weather: "fzfg" }), "0:50 - 1:40");
  none(L({ tableId: "typeIII-allclear-aeroclear-max-low", oat: -5, conc: "75/25", weather: "fzfg" }), /N\/A/);
});

test("Active frost (Table 1)", () => {
  ok(L({ tableId: "typeIV-generic", oat: -12, weather: "frost" }), "6:00");
  ok(L({ tableId: "typeIV-generic", oat: -12, conc: "75/25", weather: "frost" }), "1:00");
  ok(L({ tableId: "typeIV-generic", oat: 0, weather: "frost" }), "12:00");
  ok(L({ tableId: "typeII-generic", oat: -2, conc: "50/50", weather: "frost" }), "1:30");
  none(L({ tableId: "typeII-generic", oat: -5, conc: "50/50", weather: "frost" }));
  none(L({ tableId: "typeIV-generic", oat: -26, weather: "frost" }), /-25/);
  ok(L({ tableId: "typeI-composite", oat: -20, weather: "frost" }), "0:35");
  ok(L({ tableId: "typeI-aluminum", oat: 5, weather: "frost" }), "0:45");
  ok(L({ tableId: "typeIII-allclear-aeroclear-max-low", oat: -5, weather: "frost" }), "2:00");
});

test("Snowfall intensity (Table 57) incl. FAA worked example", () => {
  // CYVO ... 1SM -SN ... M06 at night -> moderate
  assert.equal(E.snowIntensity(D, 1, "sm", true, -6, "C").intensity, "moderate");
  assert.equal(E.snowIntensity(D, 1, "sm", false, -6, "C").intensity, "light");
  assert.equal(E.snowIntensity(D, 0.25, "sm", false, 0, "C").intensity, "heavy");
  assert.equal(E.snowIntensity(D, 0.5, "sm", false, -1, "C").intensity, "moderate");
  assert.equal(E.snowIntensity(D, 0.5, "sm", false, -0.5, "C").intensity, "heavy");
  assert.equal(E.snowIntensity(D, 3, "sm", true, 2, "C").intensity, "light");
  assert.equal(E.snowIntensity(D, 10, "sm", true, 2, "C").intensity, "very light");
  assert.equal(E.snowIntensity(D, 1200, "m", true, 31, "F").intensity, "heavy");
  assert.equal(E.snowIntensity(D, 1200, "m", true, 30, "F").intensity, "moderate");
});

test("Allowance times (Tables 54-56)", () => {
  const A = (q) => E.allowance(D, Object.assign({ unit: "C", validated: true, rotationKt: 130 }, q));
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_l", oat: -12 }).minutes, 50);
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_l", oat: 0 }).minutes, 70);
  assert.equal(A({ fluidGroup: "IV-PG", condition: "pl_l", oat: -12 }).minutes, 30);
  assert.equal(A({ fluidGroup: "IV-PG", condition: "pl_l", oat: -12, rotationKt: 110 }).ok, false);
  assert.equal(A({ fluidGroup: "IV-PG", condition: "pl_l", oat: -8, rotationKt: 110 }).minutes, 30);
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_l", oat: -2, rotationKt: 90 }).ok, false);
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_m_ra_m", oat: 3 }).minutes, 15);
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_m_ra_m", oat: -1 }).ok, false);
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_l", oat: -23 }).ok, false);
  assert.equal(A({ fluidGroup: "III", condition: "pl_l_dz_l", oat: 2 }).minutes, 7);
  assert.equal(A({ fluidGroup: "III", condition: "pl_l", oat: -11 }).ok, false);
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_l", oat: 3, unit: "F" }).minutes, 50);  // "Below 14 to 3 °F"
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_l", oat: 2, unit: "F" }).minutes, 30);
  assert.equal(A({ fluidGroup: "IV-EG", condition: "pl_l", oat: 32, unit: "F" }).minutes, 70);
  assert.equal(A({ fluidGroup: "IV-PG", condition: "pl_l", oat: -2, validated: false }).ok, false);
});

test("every brand/generic table answers every condition at every band without throwing", () => {
  for (const t of D.tables) {
    for (const b of t.bands) {
      const oat = b.c.hi === null ? b.c.lo + 5 : b.c.lo === null ? b.c.hi - 1 : (b.c.lo + b.c.hi) / 2;
      for (const conc of ["100/0", "75/25", "50/50"]) {
        for (const w of E.WEATHER) {
          for (const intensity of E.SNOW_INTENSITIES) {
            const r = E.lookup(D, { tableId: t.id, conc, oat, unit: "C", weather: w.id, intensity });
            if (r.ok) assert.ok(r.min <= r.max);
          }
        }
      }
    }
  }
});
