/* UI for the HOT 2026-27 app. Lookup logic lives in hot-engine.js. */
(function () {
  "use strict";
  const D = window.HOT_DATA;
  const E = window.HotEngine;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const COL_SHORT = {
    fzfg: "Freezing Fog, Freezing Mist, or Ice Crystals",
    snfzfg: "Snow mixed with Freezing Fog",
    sn_vl: "Very Light Snow",
    sn_l: "Light Snow",
    sn_m: "Moderate Snow",
    sn: "Snow, Snow Grains or Snow Pellets",
    fzdz: "Freezing Drizzle",
    fzra_l: "Light Freezing Rain",
    snra_m: "Moderate Snow mixed with Rain",
    rain_csw: "Rain on Cold-Soaked Wing",
    other: "Other",
  };

  const CAUTIONS = [
    "The responsibility for the application of these data remains with the user.",
    "The time of protection will be shortened in heavy weather conditions, heavy precipitation rates or high moisture content.",
    "High wind velocity, jet blast or blowing snow may reduce holdover time below the lowest time stated in the range.",
    "The holdover time may be reduced when aircraft skin temperature is lower than outside air temperature.",
    "Fluids used during ground de/anti-icing do not provide in-flight icing protection.",
    "This table is for departure planning only and should be used in conjunction with pre-takeoff check procedures.",
  ];
  const CAUTION_II_IV = "Whenever frost or ice occurs on the lower surface of the wing in the area of the fuel tank, indicating a cold-soaked wing, the 50/50 dilution of Type II or IV is not to be used for the anti-icing step because fluid freezing may occur.";

  // ------------------------------------------------------------------ state
  const KEY = "hot2627.state.v1";
  const defaults = {
    type: "IV", table: { I: "typeI-aluminum", II: "typeII-generic", III: "typeIII-allclear-aeroclear-max-low", IV: "typeIV-generic" },
    conc: "100/0", oat: "", unit: "C", weather: "snow", intensity: "light", dayNight: "day", vis: "",
    atFluid: "", atCond: "pl_l", atOat: "", atUnit: "C", atRot: "115",
    sUnit: "sm", sVis: "1", sDayNight: "day", sTemp: "cold", tbl: "20",
  };
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); S.table = Object.assign({}, defaults.table, S.table); }
  catch { S = Object.assign({}, defaults); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } };

  // ------------------------------------------------------------------ helpers
  function seg(el, value, onChange) {
    const btns = $$("button", el);
    const set = (v) => btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === String(v))));
    set(value);
    btns.forEach((b) => b.addEventListener("click", () => { if (b.disabled) return; set(b.dataset.v); onChange(b.dataset.v); }));
    return { set, disable: (vals) => btns.forEach((b) => (b.disabled = vals.includes(b.dataset.v))) };
  }
  const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
  const fmt = E.fmt;
  const srcChip = (txt) => `<span class="src">${esc(txt)}</span>`;

  // ------------------------------------------------------------------ theme
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("hot2627.theme");
  if (savedTheme) root.dataset.theme = savedTheme;
  $("#themeBtn").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem("hot2627.theme", root.dataset.theme);
  });

  // ------------------------------------------------------------------ navigation
  function showTab(name) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
    $$(".bottomnav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    window.scrollTo({ top: 0 });
  }
  $$(".bottomnav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  // ================================================================== HOT TAB
  const fluidSel = $("#fluidSel");
  const wxSel = $("#wxSel");
  const oatIn = $("#oatIn");
  const hVis = $("#hVis");

  E.WEATHER.forEach((w) => wxSel.add(new Option(w.label, w.id)));
  wxSel.value = S.weather;

  function fillFluids() {
    fluidSel.innerHTML = "";
    const list = E.fluidsOfType(D, S.type);
    if (S.type === "III") {
      list.forEach((t) => fluidSel.add(new Option(`${t.name} (unheated) – ${t.rampSpeed} speed ramp test`, t.id)));
    } else if (S.type === "I") {
      list.forEach((t) => fluidSel.add(new Option(t.surface === "aluminum" ? "Surfaces predominantly aluminum" : "Surfaces predominantly composite", t.id)));
    } else {
      const gen = list.filter((t) => t.generic), brands = list.filter((t) => !t.generic);
      const g1 = document.createElement("optgroup"); g1.label = "Generic (brand unknown)";
      gen.forEach((t) => g1.appendChild(new Option(t.name, t.id)));
      const g2 = document.createElement("optgroup"); g2.label = "Brand-specific";
      brands.sort((a, b) => a.name.localeCompare(b.name)).forEach((t) => g2.appendChild(new Option(t.name, t.id)));
      fluidSel.append(g1, g2);
    }
    if (!list.some((t) => t.id === S.table[S.type])) S.table[S.type] = list[0].id;
    fluidSel.value = S.table[S.type];
    $("#fluidLabel").textContent = S.type === "I" ? "Critical surface material" : "Fluid";
  }

  function updateFluidHint() {
    const t = E.tableById(D, S.table[S.type]);
    const h = [];
    if (t.type === "III") h.push("Consult the aircraft manufacturer's documentation for low, middle or high speed ramp test values. If uncertain, use low speed values. Fluid must be applied unheated.");
    if (t.type === "I") h.push("Type I fluid/water mixture freezing point must be at least 10 °C (18 °F) below OAT.");
    if (!t.generic && t.type !== "I") h.push(`Table ${t.table} (brand-specific). Lowest band: ${t.bands[t.bands.length - 1].labelC}.`);
    if (t.generic) h.push(`Table ${t.table}. Use when the fluid brand is unknown or not listed.`);
    $("#fluidHint").textContent = h.join(" ");
  }

  const typeSeg = seg($("#typeSeg"), S.type, (v) => { S.type = v; fillFluids(); refreshHot(); });
  const concSeg = seg($("#concSeg"), S.conc, (v) => { S.conc = v; refreshHot(); });
  const unitSeg = seg($("#unitSeg"), S.unit, (v) => {
    const o = num(oatIn.value);
    if (!Number.isNaN(o) && v !== S.unit) oatIn.value = String(Math.round((v === "F" ? E.toF(o) : E.toC(o)) * 10) / 10);
    S.unit = v; S.oat = oatIn.value; oatChanged();
  });
  const intSeg = seg($("#intSeg"), S.intensity, (v) => { S.intensity = v; S.vis = ""; hVis.value = ""; $("#hVisOut").textContent = ""; refreshHot(); });
  const dnSeg = seg($("#hDayNight"), S.dayNight, (v) => { S.dayNight = v; applyVisHelper(); });
  void typeSeg; void concSeg; void unitSeg; void dnSeg;

  fluidSel.addEventListener("change", () => { S.table[S.type] = fluidSel.value; refreshHot(); });
  wxSel.addEventListener("change", () => { S.weather = wxSel.value; refreshHot(); });
  oatIn.value = S.oat;
  oatIn.addEventListener("input", () => { S.oat = oatIn.value; oatChanged(); });
  $$("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const o = num(oatIn.value);
    oatIn.value = String((Number.isNaN(o) ? 0 : o) + Number(b.dataset.step));
    S.oat = oatIn.value; oatChanged();
  }));
  // snowfall intensity from visibility depends on OAT (-1 °C / 30 °F threshold)
  function oatChanged() { if (S.vis !== "" && S.weather === "snow") applyVisHelper(); else refreshHot(); }

  // visibility helper (inline, HOT tab)
  function fillVisSelect(sel, unit, current) {
    sel.innerHTML = "";
    sel.add(new Option("Visibility…", ""));
    D.snowVisibility.rows.forEach((r, i) => sel.add(new Option(unit === "m" ? `${r.m} m` : `${r.sm} SM`, String(i))));
    sel.value = current ?? "";
  }
  fillVisSelect(hVis, "sm", S.vis);
  hVis.addEventListener("change", () => { S.vis = hVis.value; applyVisHelper(); });

  function intensityFromRow(i, night, oat, unit) {
    const r = D.snowVisibility.rows[i];
    const cold = unit === "F" ? oat <= 30 : oat <= -1;
    return r.i[(night ? 2 : 0) + (cold ? 0 : 1)];
  }
  function applyVisHelper() {
    const out = $("#hVisOut");
    if (S.vis === "") { out.textContent = ""; save(); return; }
    const oat = num(oatIn.value);
    if (Number.isNaN(oat)) { out.textContent = "Enter OAT first."; save(); return; }
    const it = intensityFromRow(Number(S.vis), S.dayNight === "night", oat, S.unit);
    out.innerHTML = `Table 57 → <strong>${esc(it)}</strong> snow. Intensity set.`;
    S.intensity = it; intSeg.set(it); refreshHot(false);
  }

  function rowContext(res, tbl) {
    if (!res.row) return "";
    const cols = tbl.columns;
    const hdr = cols.map((c) => `<th>${esc(COL_SHORT[c])}</th>`).join("");
    const cells = cols.map((c) => {
      const v = res.row.values[c];
      const cls = ["c-" + c, c === res.column ? "hl" : ""].join(" ");
      if (!v) return `<td class="nohot ${cls}">No HOT</td>`;
      if (v.na) return `<td class="na ${cls}">N/A</td>`;
      return `<td class="${cls}">${esc(v.text)}${v.note ? `<sup>${esc(v.note)}</sup>` : ""}</td>`;
    }).join("");
    return `<details class="rowctx"><summary>Show full row (${esc(res.band)}, ${esc(res.conc)})</summary>
      <div class="table-wrap"><table class="hot"><tr>${hdr}</tr><tr>${cells}</tr></table></div></details>`;
  }

  let lastHot = null;
  function refreshHot(fromUser = true) {
    void fromUser;
    const t = E.tableById(D, S.table[S.type]);
    $("#concWrap").hidden = S.type === "I";
    // which concentrations exist anywhere in this table
    const concs = new Set(); t.bands.forEach((b) => b.rows.forEach((r) => concs.add(r.conc)));
    concSeg.disable(["100/0", "75/25", "50/50"].filter((c) => !concs.has(c) && S.weather !== "frost"));
    if (!concs.has(S.conc) && S.weather !== "frost") { S.conc = "100/0"; concSeg.set("100/0"); }
    $("#intensityWrap").hidden = S.weather !== "snow";
    updateFluidHint();

    const q = { tableId: t.id, conc: S.conc, oat: num(oatIn.value), unit: S.unit, weather: S.weather, intensity: S.intensity };
    const r = E.lookup(D, q);
    lastHot = { r, q, t };
    const el = $("#result");
    const wxLabel = E.WEATHER.find((w) => w.id === S.weather).label + (S.weather === "snow" ? ` – ${S.intensity}` : "");
    const fluidLabel = t.type === "I" ? t.name : `Type ${t.type} · ${t.name}${t.type !== "I" ? ` · ${S.conc}` : ""}`;
    const chips = [r.table ? `Table ${r.table}` : null, r.page ? `p. ${r.page}` : null, r.band ? `${r.band}${r.bandAlt ? ` (${r.bandAlt})` : ""}` : null].filter(Boolean).map(srcChip).join("");
    const cautions = `<div class="caution"><strong>Cautions:</strong> ${esc(CAUTIONS[1])} ${esc(CAUTIONS[2])} ${esc(CAUTIONS[3])} Respect the fluid's LOUT.${
      (t.type === "II" || t.type === "IV") ? " " + esc(CAUTION_II_IV) : ""}</div>`;

    if (Number.isNaN(q.oat)) {
      el.className = "result card"; el.innerHTML = `<div class="r-head">Result</div><p class="r-reason">Enter the outside air temperature.</p>`;
    } else if (r.ok) {
      el.className = "result card ok";
      const big = r.single ? `${esc(r.text)}` : `${esc(fmt(r.min))}<small> – </small>${esc(fmt(r.max))}`;
      el.innerHTML = `<div class="r-head">Holdover time · ${esc(wxLabel)}</div>
        <div class="r-time">${big} <small>h:mm</small></div>
        <div class="r-sub">${esc(fluidLabel)} at ${esc(oatIn.value)} °${esc(S.unit)}</div>
        <div>${chips}</div>
        ${r.single ? "" : `<p class="hint">Lower value: heavier precipitation within the condition. Upper value: lighter precipitation.</p>`}
        ${r.notes && r.notes.length ? `<ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
        <div class="r-actions">
          <button class="btn" id="startHot">Start HOT clock now</button>
          <input type="time" id="startAt" aria-label="Start of final fluid application">
          <button class="btn ghost" id="startHotAt">Start at time</button>
        </div>
        <p class="hint">HOT begins at the start of the final application of de/anti-icing fluid.</p>
        ${rowContext(r, t)}
        ${cautions}`;
      $("#startHot").addEventListener("click", () => startTimer(Date.now(), r, wxLabel, fluidLabel));
      $("#startHotAt").addEventListener("click", () => {
        const v = $("#startAt").value; if (!v) return;
        const [h, m] = v.split(":").map(Number);
        const d = new Date(); d.setHours(h, m, 0, 0);
        if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);
        startTimer(d.getTime(), r, wxLabel, fluidLabel);
      });
    } else {
      el.className = "result card none";
      el.innerHTML = `<div class="r-head">Holdover time · ${esc(wxLabel)}</div>
        <div class="r-time">No HOT</div>
        <p class="r-reason">${esc(r.reason)}</p>
        ${r.hint ? `<p class="hint">${esc(r.hint)} <button class="btn small ghost" id="goAt">Open Allowance</button></p>` : ""}
        <div>${chips}</div>${cautions}`;
      const go = $("#goAt"); if (go) go.addEventListener("click", () => showTab("at"));
    }
    save();
  }

  // ================================================================== TIMER
  const TKEY = "hot2627.timer.v1";
  let timer = null;
  try { timer = JSON.parse(localStorage.getItem(TKEY) || "null"); } catch { timer = null; }
  function startTimer(start, r, wx, fluid) {
    const isAt = r.minutes !== undefined;
    timer = { start, min: isAt ? r.minutes : r.min, max: isAt ? r.minutes : r.max, at: isAt, label: `${fluid} · ${wx}`, table: r.table };
    localStorage.setItem(TKEY, JSON.stringify(timer));
    tick(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("#timerStop").addEventListener("click", () => { timer = null; localStorage.removeItem(TKEY); tick(); });
  function tick() {
    const bar = $("#timerBar");
    if (!timer) { bar.hidden = true; return; }
    bar.hidden = false;
    const el = Math.max(0, Math.floor((Date.now() - timer.start) / 1000));
    const h = Math.floor(el / 3600), m = Math.floor((el % 3600) / 60), s = el % 60;
    $("#timerElapsed").textContent = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    $("#timerLabel").textContent = timer.at ? "Allowance clock" : "HOT clock";
    const minS = timer.min * 60, maxS = timer.max * 60;
    let cls, status;
    if (el < minS) {
      cls = "green";
      status = `${timer.at ? "Within allowance time" : "Within HOT"}: ${fmt(Math.ceil((minS - el) / 60))} to ${timer.min === timer.max ? "limit" : "minimum"} (${fmt(timer.min)}${timer.min === timer.max ? "" : "–" + fmt(timer.max)})`;
    } else if (el < maxS) {
      cls = "amber";
      status = `Past minimum HOT ${fmt(timer.min)}; ${fmt(Math.ceil((maxS - el) / 60))} to maximum ${fmt(timer.max)}. Valid only if precipitation is light enough. Apply pre-takeoff checks.`;
    } else {
      cls = "red";
      status = timer.at ? `Allowance time ${fmt(timer.max)} exceeded.` : `Maximum HOT ${fmt(timer.max)} exceeded. Holdover time has expired.`;
    }
    bar.className = "timer-bar " + cls;
    $("#timerStatus").textContent = status + "  ·  " + timer.label;
    const full = Math.max(maxS, 1) * 1.1;
    $("#timerFill").style.width = Math.min(100, (el / full) * 100) + "%";
    $("#timerMinMark").style.left = (minS / full) * 100 + "%";
  }
  setInterval(tick, 1000);

  // ================================================================== ALLOWANCE TAB
  const atFluid = $("#atFluid"), atCond = $("#atCond"), atOat = $("#atOat");
  const groups = { "Type III": "III", "Type IV EG": "IV-EG", "Type IV PG": "IV-PG" };
  const valList = D.allowance.validation;
  ["Type III", "Type IV EG", "Type IV PG"].forEach((g) => {
    const og = document.createElement("optgroup"); og.label = g + " fluids";
    valList.forEach((f, i) => { if (f.group === g) og.appendChild(new Option(`${f.fluid} – ${f.manufacturer}${f.table ? "" : "  (not validated)"}`, String(i))); });
    atFluid.appendChild(og);
  });
  if (S.atFluid === "" || !valList[Number(S.atFluid)]) S.atFluid = String(valList.findIndex((f) => f.table));
  atFluid.value = S.atFluid;

  function fillAtConds() {
    const f = valList[Number(S.atFluid)];
    const at = D.allowance[groups[f.group]];
    atCond.innerHTML = "";
    at.rows.forEach((r) => atCond.add(new Option(`${r.name}  [${r.metar.split(",")[0]}${r.metar.includes(",") ? ", …" : ""}]`, r.id)));
    if (!at.rows.some((r) => r.id === S.atCond)) S.atCond = at.rows[0].id;
    atCond.value = S.atCond;
  }
  fillAtConds();
  atFluid.addEventListener("change", () => { S.atFluid = atFluid.value; fillAtConds(); refreshAt(); });
  atCond.addEventListener("change", () => { S.atCond = atCond.value; refreshAt(); });
  atOat.value = S.atOat;
  atOat.addEventListener("input", () => { S.atOat = atOat.value; refreshAt(); });
  $$("[data-atstep]").forEach((b) => b.addEventListener("click", () => {
    const o = num(atOat.value); atOat.value = String((Number.isNaN(o) ? 0 : o) + Number(b.dataset.atstep)); S.atOat = atOat.value; refreshAt();
  }));
  seg($("#atUnitSeg"), S.atUnit, (v) => {
    const o = num(atOat.value);
    if (!Number.isNaN(o) && v !== S.atUnit) atOat.value = String(Math.round((v === "F" ? E.toF(o) : E.toC(o)) * 10) / 10);
    S.atUnit = v; S.atOat = atOat.value; refreshAt();
  });
  seg($("#atRotSeg"), S.atRot, (v) => { S.atRot = v; refreshAt(); });

  function refreshAt() {
    const f = valList[Number(S.atFluid)];
    const grp = groups[f.group];
    const at = D.allowance[grp];
    $("#atFluidHint").textContent = f.table ? `Validated: use Table ${f.table} (${at.title}).` : "Not validated. No allowance times exist for this fluid at the time of publication.";
    const r = E.allowance(D, { fluidGroup: grp, validated: !!f.table, condition: S.atCond, oat: num(atOat.value), unit: S.atUnit, rotationKt: Number(S.atRot) });
    const el = $("#atResult");
    const chips = [r.table ? `Table ${r.table}` : null, r.page ? `p. ${r.page}` : null, r.band || null, r.metar ? `METAR ${r.metar}` : null].filter(Boolean).map(srcChip).join("");
    const notes = `<ul>${at.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    if (Number.isNaN(num(atOat.value))) {
      el.className = "result card"; el.innerHTML = `<div class="r-head">Allowance time</div><p class="r-reason">Enter the outside air temperature.</p>${notes}`;
    } else if (r.ok) {
      el.className = "result card ok";
      el.innerHTML = `<div class="r-head">Allowance time · ${esc(r.condition)}</div>
        <div class="r-time">${r.minutes} <small>minutes</small></div>
        <div class="r-sub">${esc(f.fluid)} (${esc(f.group)}, 100/0) at ${esc(atOat.value)} °${esc(S.atUnit)}</div>
        <div>${chips}</div>
        <div class="r-actions"><button class="btn" id="startAt2">Start allowance clock now</button></div>
        ${notes}`;
      $("#startAt2").addEventListener("click", () => startTimer(Date.now(), r, r.condition, `${f.fluid} AT`));
    } else {
      el.className = "result card none";
      el.innerHTML = `<div class="r-head">Allowance time${r.condition ? " · " + esc(r.condition) : ""}</div>
        <div class="r-time">No allowance time</div><p class="r-reason">${esc(r.reason)}</p><div>${chips}</div>${notes}`;
    }
    save();
  }

  // ================================================================== SNOW TAB
  const sVis = $("#sVis");
  seg($("#sUnitSeg"), S.sUnit, (v) => { S.sUnit = v; fillVisSelect(sVis, v, S.sVis); refreshSnow(); });
  seg($("#sDayNight"), S.sDayNight, (v) => { S.sDayNight = v; refreshSnow(); });
  seg($("#sTempSeg"), S.sTemp, (v) => { S.sTemp = v; refreshSnow(); });
  fillVisSelect(sVis, S.sUnit, S.sVis);
  sVis.addEventListener("change", () => { S.sVis = sVis.value; refreshSnow(); });

  function refreshSnow() {
    const el = $("#snowResult");
    const col = (S.sDayNight === "night" ? 2 : 0) + (S.sTemp === "cold" ? 0 : 1);
    if (S.sVis === "") { el.className = "result card"; el.innerHTML = `<p class="r-reason">Select the visibility.</p>`; }
    else {
      const it = D.snowVisibility.rows[Number(S.sVis)].i[col];
      el.className = "result card " + (it === "heavy" ? "none" : "ok");
      el.innerHTML = `<div class="r-head">Snowfall intensity</div><div class="r-time" style="text-transform:capitalize">${esc(it)}</div>
        ${it === "heavy" ? `<p class="r-reason">No holdover times exist for heavy snow.</p>` : ""}
        <div>${srcChip("Table 57")}${srcChip("p. 74")}</div>
        <div class="r-actions"><button class="btn" id="useInt">Use in HOT calculator</button></div>`;
      $("#useInt").addEventListener("click", () => {
        S.weather = "snow"; wxSel.value = "snow"; S.intensity = it; intSeg.set(it); refreshHot(); showTab("hot");
      });
    }
    renderSnowTable($("#snowTable"), Number(S.sVis), col);
    save();
  }

  function renderSnowTable(el, hiRow, hiCol) {
    const sv = D.snowVisibility;
    let h = `<h2>Table 57: ${esc(sv.title)}</h2><p class="tmeta">Page ${sv.page}</p><table class="hot"><tr><th rowspan="2">Visibility (SM)</th><th rowspan="2">Meters</th><th colspan="2">Day</th><th colspan="2">Night</th></tr>
      <tr><th>−1 °C / 30 °F and below</th><th>Above −1 °C / 30 °F</th><th>−1 °C / 30 °F and below</th><th>Above −1 °C / 30 °F</th></tr>`;
    sv.rows.forEach((r, ri) => {
      h += `<tr><td>${esc(r.sm)}</td><td>${esc(r.m)}</td>` + r.i.map((x, ci) => {
        const c = { "very light": "c-sn_vl", light: "c-sn_l", moderate: "c-sn_m", heavy: "nohot" }[x];
        return `<td class="${c} ${ri === hiRow && ci === hiCol ? "hl" : ""}" style="text-transform:capitalize">${esc(x)}</td>`;
      }).join("") + `</tr>`;
    });
    h += `</table><ul class="notes-list">${sv.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    el.innerHTML = h;
  }

  // ================================================================== TABLES TAB
  const tblSel = $("#tblSel");
  (function fillTables() {
    const add = (grp, v, label) => grp.appendChild(new Option(label, v));
    const mk = (l) => { const g = document.createElement("optgroup"); g.label = l; tblSel.appendChild(g); return g; };
    const g0 = mk("Frost"); add(g0, "1", `Table 1: ${D.frost.title}`);
    const names = { I: mk("Type I"), II: mk("Type II"), III: mk("Type III"), IV: mk("Type IV") };
    D.tables.forEach((t) => add(names[t.type], String(t.table), `Table ${t.table}: ${t.type === "I" ? t.name : t.name + (t.rampSpeed ? ` (${t.rampSpeed} speed)` : "")}`));
    const ga = mk("Allowance times");
    add(ga, "53", "Table 53: Validation status for allowance times");
    add(ga, "54", `Table 54: ${D.allowance.III.title}`);
    add(ga, "55", `Table 55: ${D.allowance["IV-EG"].title}`);
    add(ga, "56", `Table 56: ${D.allowance["IV-PG"].title}`);
    const gs = mk("Supplemental"); add(gs, "57", `Table 57: ${D.snowVisibility.title}`);
  })();
  tblSel.value = S.tbl;
  tblSel.addEventListener("change", () => { S.tbl = tblSel.value; renderTable(); save(); });

  function renderHotTable(t) {
    const cols = t.columns;
    let h = `<h2>Table ${t.table}: ${esc(t.title)}</h2><p class="tmeta">FAA HOT Guidelines Winter 2026-2027 · page ${t.page}</p>`;
    h += `<table class="hot"><tr><th>Outside Air Temperature</th>${t.hasConcentration ? "<th>Fluid/Water (% vol)</th>" : ""}${cols.map((c) => `<th>${esc(COL_SHORT[c])}</th>`).join("")}</tr>`;
    t.bands.forEach((b) => {
      b.rows.forEach((r, ri) => {
        h += "<tr>";
        if (ri === 0) h += `<td class="band" rowspan="${b.rows.length}">${esc(b.labelC)}<small>${esc(b.labelF)}</small></td>`;
        if (t.hasConcentration) h += `<td>${esc(r.conc)}</td>`;
        cols.forEach((c) => {
          const v = r.values[c];
          if (!v) h += `<td class="nohot">No HOT</td>`;
          else if (v.na) h += `<td class="na">N/A</td>`;
          else h += `<td class="c-${c}">${esc(v.text)}${v.note ? `<sup>${esc(v.note)}</sup>` : ""}</td>`;
        });
        h += "</tr>";
      });
    });
    h += `</table><h3 style="font-size:14px;margin:14px 0 4px">Notes</h3><ol class="notes-list">${Object.entries(t.notes).map(([k, v]) => `<li value="${esc(k)}">${esc(v)}</li>`).join("")}</ol>`;
    return h;
  }

  function renderFrost() {
    const f = D.frost;
    let h = `<h2>Table 1: ${esc(f.title)}</h2><p class="tmeta">page ${f.page}</p>
      <p class="hint">Type I (all temperatures): Aluminum <strong>${f.typeI.aluminum}</strong> · Composite <strong>${f.typeI.composite}</strong></p>
      <table class="hot"><tr><th>Outside Air Temperature</th><th>Fluid/Water (% vol)</th><th>Type II</th><th>Type III (AeroClear MAX, unheated)</th><th>Type IV</th></tr>`;
    f.bands.forEach((b) => {
      const rows = Object.entries(b.rows);
      if (b.noHot) { h += `<tr><td class="band">${esc(b.labelC)}<small>${esc(b.labelF)}</small></td><td>100/0</td><td class="nohot" colspan="3">No Holdover Time Guidelines Exist</td></tr>`; return; }
      rows.forEach(([conc, v], i) => {
        h += `<tr>${i === 0 ? `<td class="band" rowspan="${rows.length}">${esc(b.labelC)}<small>${esc(b.labelF)}</small></td>` : ""}<td>${conc}</td>${v.map((x) => `<td>${x}</td>`).join("")}</tr>`;
      });
    });
    h += `</table><ol class="notes-list">${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>`;
    return h;
  }

  function renderAt(at) {
    let h = `<h2>Table ${at.table}: ${esc(at.title)}</h2><p class="tmeta">page ${at.page}</p><table class="hot"><tr><th class="left">Precipitation (METAR)</th>${at.columns.map((c) => `<th>${esc(c.labelC)}<br><span class="muted">${esc(c.labelF)}</span>${c.minRotationKt ? `<br><span class="muted">V<sub>R</sub> ≥ ${c.minRotationKt} kt</span>` : ""}</th>`).join("")}</tr>`;
    at.rows.forEach((r) => {
      h += `<tr><td class="left">${esc(r.name)}<br><span class="muted" style="font-size:11px">${esc(r.metar)}</span></td>${r.t.map((v) => v === null ? `<td class="nohot">—</td>` : `<td>${v} min</td>`).join("")}</tr>`;
    });
    h += `</table><ol class="notes-list">${at.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ol>`;
    return h;
  }

  function renderValidation() {
    let h = `<h2>Table 53: Validation Status of Fluids for Use with Allowance Times</h2><p class="tmeta">page ${D.allowance.validationPage}</p><table class="hot"><tr><th>Group</th><th class="left">Manufacturer</th><th class="left">Fluid</th><th>Allowance times</th></tr>`;
    D.allowance.validation.forEach((f) => {
      h += `<tr><td>${esc(f.group)}</td><td class="left">${esc(f.manufacturer)}</td><td class="left">${esc(f.fluid)}</td>${f.table ? `<td>Table ${f.table}</td>` : `<td class="nohot">Not validated</td>`}</tr>`;
    });
    return h + `</table><ol class="notes-list"><li>Allowance times are for undiluted (100/0) Type III, Type IV EG and Type IV PG fluids only. No allowance times exist for Type II fluids.</li></ol>`;
  }

  function renderTable() {
    const n = Number(S.tbl), el = $("#tblView");
    if (n === 1) el.innerHTML = renderFrost();
    else if (n === 53) el.innerHTML = renderValidation();
    else if (n === 54) el.innerHTML = renderAt(D.allowance.III);
    else if (n === 55) el.innerHTML = renderAt(D.allowance["IV-EG"]);
    else if (n === 56) el.innerHTML = renderAt(D.allowance["IV-PG"]);
    else if (n === 57) renderSnowTable(el, -1, -1);
    else el.innerHTML = renderHotTable(D.tables.find((t) => t.table === n));
  }

  // ================================================================== INFO TAB
  $("#infoBody").innerHTML = `
    <h2>About this app</h2>
    <div class="warnbox"><strong>Reference tool only.</strong> This app is not an FAA product. It presents data extracted from the
      <em>${esc(D.source.title)}</em> (${esc(D.source.issue)}, ${esc(D.source.date)}). Always verify against the official FAA document and
      your operator's FAA-approved ground deicing/anti-icing program. The FAA may issue revisions during the season. Check the FAA website.</div>
    <h3>Source</h3>
    <p><a href="${esc(D.source.url)}" target="_blank" rel="noopener">FAA Aircraft Ground Deicing page</a> · file <code>${esc(D.source.file)}</code></p>
    <p>Holdover tables: ${D.tables.length} fluid tables (Tables 2–52), active frost (Table 1), allowance times (Tables 53–56) and snowfall intensity (Table 57).
      Every value was extracted programmatically from the PDF and cross-checked with a second, independent PDF parser.</p>
    <h3>How to use</h3>
    <ol>
      <li>Pick the fluid type, then the specific brand if known (otherwise use the generic table).</li>
      <li>Select the concentration applied in the final (anti-icing) step and enter the OAT.</li>
      <li>Select the weather. For snow, determine intensity from <strong>visibility</strong> (Table 57), not the METAR intensity.</li>
      <li>Start the HOT clock at the <strong>beginning of the final fluid application</strong>.</li>
    </ol>
    <h3>Cautions (from the FAA HOT Guidelines)</h3>
    <ul>${CAUTIONS.map((c) => `<li>${esc(c)}</li>`).join("")}<li>${esc(CAUTION_II_IV)}</li></ul>
    <h3>Not included</h3>
    <p>Lowest Operational Use Temperature (LOUT) tables and fluid lists (Tables 58–62), application guidelines (Tables 63–65), and degree-specific HOTs (DSHOTs).
      Consult the official documents for these.</p>
    <h3>Offline use</h3>
    <p>After the first load the app works offline. On iOS: Share → <em>Add to Home Screen</em>. On Android/Chrome: menu → <em>Install app</em>.</p>`;

  // ================================================================== boot
  fillFluids();
  refreshHot();
  refreshAt();
  refreshSnow();
  renderTable();
  tick();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
