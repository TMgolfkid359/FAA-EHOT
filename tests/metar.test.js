const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
global.window = {};
require(path.join(__dirname, "../app/data/hot-2026-27.js"));
const D = global.window.HOT_DATA;
const M = require(path.join(__dirname, "../app/metar.js"));

const NOW = new Date(Date.UTC(2026, 10, 19, 20, 0));
const A = (raw, night = false) => M.assess(M.parse(raw, NOW), { data: D, night });

test("parse basics", () => {
  const p = M.parse("METAR KJFK 191951Z 20005KT 10SM CLR 17/03 A3036 RMK SLP280 T01670028", NOW);
  assert.equal(p.station, "KJFK");
  assert.equal(p.time.toISOString(), "2026-11-19T19:51:00.000Z");
  assert.equal(p.tempC, 16.7); assert.equal(p.dewC, 2.8); assert.equal(p.tempPrecise, true);
  assert.equal(p.vis.sm, 10);
  const q = M.parse("EGLL 191950Z 24010KT 0800 R27L/1200 -SN FZFG M02/M03 Q1010", NOW);
  assert.equal(q.vis.m, 800); assert.equal(q.tempC, -2); assert.equal(q.tempPrecise, false);
  assert.deepEqual(q.wx.map((g) => g.raw), ["-SN", "FZFG"]);
  const r = M.parse("KORD 191951Z 36010KT 1 1/2SM -SN BR OVC008 M04/M05 A2990", NOW);
  assert.equal(r.vis.sm, 1.5);
  const s = M.parse("KBOS 191951Z 36010KT M1/4SM +SN FG VV002 M01/M01 A2990", NOW);
  assert.ok(s.vis.sm < 0.25);
  // previous month rollover
  assert.equal(M.parse("KJFK 302351Z 00000KT 10SM CLR 01/M01 A3000", NOW).time.getUTCMonth(), 9);
});

test("FAA worked example: CYVO 1SM -SN at night, -6 °C -> moderate snow", () => {
  const a = A("CYVO 160200Z 15011G17KT 1SM -SN DRSN OVC009 M06/M08 A2948", true);
  assert.equal(a.kind, "hot"); assert.equal(a.weather, "snow"); assert.equal(a.intensity, "moderate");
  assert.equal(A("CYVO 160200Z 15011G17KT 1SM -SN DRSN OVC009 M06/M08 A2948", false).intensity, "light");
});

test("snow with freezing fog / ice crystals / heavy by visibility", () => {
  assert.equal(A("EGLL 191950Z 24010KT 2000 -SN FZFG M02/M03 Q1010").weather, "snfzfg");
  assert.equal(A("CYZF 191950Z 24010KT 5SM -SN IC M22/M25 A3010").weather, "snow");
  const h = A("KBOS 191951Z 36010KT 1/4SM SN FG VV002 M01/M01 A2990");
  assert.equal(h.kind, "none"); assert.match(h.reason, /heavy snow/);
  // METAR says heavy, visibility says lighter -> warn
  assert.ok(A("KBOS 191951Z 36010KT 3SM +SN OVC010 M05/M06 A2990").warnings.some((w) => /more severe/.test(w)));
});

test("snow mixed with rain", () => {
  assert.equal(A("KBOS 191951Z 36010KT 3/4SM SNRA OVC010 01/00 A2990").weather, "snra_m");
  assert.equal(A("KBOS 191951Z 36010KT 3SM -SNRA OVC010 01/00 A2990").weather, "snra_l");
  assert.equal(A("KBOS 191951Z 36010KT 3SM -RASN OVC010 01/00 A2990").weather, "snra_l");
  assert.equal(A("KBOS 191951Z 36010KT 3/4SM SN DZ OVC010 01/00 A2990").kind, "none");
});

test("freezing rain and drizzle", () => {
  assert.equal(A("KDTW 191951Z 05008KT 4SM -FZRA BR OVC006 M02/M03 A2990").weather, "fzra_l");
  const m = A("KDTW 191951Z 05008KT 2SM FZRA BR OVC006 M02/M03 A2990");
  assert.equal(m.kind, "none"); assert.match(m.reason, /moderate or heavy freezing rain/);
  assert.equal(A("KDTW 191951Z 05008KT 3SM FZDZ BR OVC004 M01/M02 A2990").weather, "fzdz");
  assert.equal(A("KDTW 191951Z 05008KT 3SM -FZRASN OVC004 M01/M02 A2990").kind, "none"); // mixed, no HOT
});

test("ice pellets -> allowance times", () => {
  assert.equal(A("KDTW 191951Z 05008KT 4SM -PL OVC006 M02/M03 A2990").atCondition, "pl_l");
  assert.equal(A("KDTW 191951Z 05008KT 4SM -PLSN OVC006 M02/M03 A2990").atCondition, "pl_l_sn_l");
  assert.equal(A("KDTW 191951Z 05008KT 4SM -FZRAPL OVC006 M02/M03 A2990").atCondition, "pl_l_fzra_l");
  assert.equal(A("KDTW 191951Z 05008KT 4SM -FZRAPLSN OVC006 M02/M03 A2990").atCondition, "pl_l_fzra_l_sn_l");
  assert.equal(A("KDTW 191951Z 05008KT 2SM PL OVC006 M02/M03 A2990").atCondition, "pl_m");
  assert.equal(A("KDTW 191951Z 05008KT 2SM PLRA OVC006 02/01 A2990").atCondition, "pl_m_ra_m");
  assert.equal(A("KDTW 191951Z 05008KT 2SM +PL OVC006 M02/M03 A2990").kind, "none");
  assert.equal(A("KDTW 191951Z 05008KT 2SM FZRAPL OVC006 M02/M03 A2990").kind, "none"); // moderate FZRA: none
});

test("country rules (FAA GI Table 3)", () => {
  assert.equal(A("KDEN 191951Z 36010KT 3SM GS OVC010 M01/M02 A2990").weather, "snow");           // US GS = snow pellets
  assert.equal(A("KDEN 191951Z 36010KT 3SM SG OVC010 M01/M02 A2990").weather, "snow");           // SG = snow grains
  assert.equal(A("EDDF 191950Z 36010KT 5000 SHGS M01/M02 Q1010").kind, "allowance");             // ROW = small hail
  assert.equal(A("CYUL 191900Z 36010KT 5SM SHGS OVC010 M01/M02 A2990").weather, "snow");         // CA no remark
  assert.equal(A("KDEN 191951Z 36010KT 3SM GR OVC010 01/M02 A2990 RMK GR 1/2").kind, "none");    // hail
  assert.equal(A("KDEN 191951Z 36010KT 3SM GR OVC010 01/M02 A2990 RMK GR LESS THAN 1/4").kind, "allowance");
  assert.equal(A("CYUL 191900Z 36010KT 5SM GR OVC010 01/M02 A2990").kind, "none");
});

test("fog, mist, rain, nothing", () => {
  assert.equal(A("KSEA 191951Z 00000KT 1/4SM FZFG VV001 M02/M02 A3010").weather, "fzfg");
  const br = A("KSEA 191951Z 00000KT 3SM BR OVC003 M01/M01 A3010");
  assert.equal(br.weather, "fzfg"); assert.equal(br.confirm, true);
  assert.equal(A("KSEA 191951Z 00000KT 3SM BR OVC003 02/01 A3010").kind, "nowx");
  assert.equal(A("KSEA 191951Z 00000KT 3SM -RA OVC003 03/02 A3010").weather, "rain_csw");
  assert.equal(A("KSEA 191951Z 00000KT 3SM -RA OVC003 M01/M02 A3010").kind, "none");
  assert.equal(A("KSEA 191951Z 00000KT 10SM CLR M05/M07 A3010").kind, "nowx");
  assert.equal(A("KSEA 191951Z 00000KT 10SM VCSN CLR M05/M07 A3010").kind, "nowx");
  assert.equal(A("KSEA 191951Z 00000KT 3SM UP OVC010 M01/M02 A3010").kind, "none");
});

test("surface visibility remark overrides tower visibility", () => {
  const p = M.parse("KORD 191951Z 36010KT 1SM -SN OVC008 M04/M05 A2990 RMK SFC VIS 1/2", NOW);
  assert.equal(p.vis.sm, 0.5);
  assert.equal(A("KORD 191951Z 36010KT 1SM -SN OVC008 M04/M05 A2990 RMK SFC VIS 1/2").intensity, "moderate");
});

test("sun / night", () => {
  // Chicago at 19:51Z in November = early afternoon local -> day; 05:00Z -> night
  assert.equal(M.isNight(41.98, -87.9, new Date(Date.UTC(2026, 10, 19, 19, 51))), false);
  assert.equal(M.isNight(41.98, -87.9, new Date(Date.UTC(2026, 10, 19, 5, 0))), true);
});
