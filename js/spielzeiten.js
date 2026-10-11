/*
 * Lernzone – Spielzeiten (nur Trainer, Reiter „Spielzeiten“)
 * Pro Spiel: Spielzeit (Vorgabe je Spielart aus den Einstellungen, ab 0.31.0), Ergebnis, Spieltagskader (Startelf / Einwechselspieler,
 *   aus Aufstellung und Kader), Wechsel mit Minute
 * Matchplan (ab 0.32.0): Position + Soll-Minuten je Spieler → Wechselplan (Rechnung in js/matchplan.js), als Wechsel übernehmbar
 * → Minuten pro Spieler; Saison-Übersicht (Spiele, Startelf, Einsätze, Minuten, Anteil an möglichen Minuten)
 * Daten: api/matches.php
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const SZ = { games: null, season: [], cur: null, f: { minute: "", out: "", in: "" }, sort: "nr", msg: "", err: "", busy: false, dirty: false };

  async function loadList() {
    const r = await LZ.Store.get("matches.php");
    if (r && r.ok) { SZ.games = r.games; SZ.season = r.season; SZ.err = ""; } else SZ.err = (r && r.error) || "Konnte die Spiele nicht laden.";
    if (LZ.S.view === "spielzeiten") LZ.render();
  }
  LZ.on("enter", v => { if (v === "spielzeiten" && LZ.coachMode()) { SZ.cur = null; loadList(); LZ.Store.refreshPlayers().then(() => LZ.render()); } });

  const cal = () => LZ.calendar || { dayName: d => d, chip: () => "" };
  const when = g => `${cal().dayName(g.date)}${g.time ? " · " + g.time : ""}`;

  /* Minuten wie auf dem Server: Startelf ab 0, Wechsel nach Minute, Ende = Spielzeit */
  function minutes(m) {
    const on = {}, min = {};
    m.squad.forEach(s => { min[s.nr] = 0; if (s.starter) on[s.nr] = 0; });
    m.subs.slice().sort((a, b) => a.minute - b.minute).forEach(s => {
      const t = Math.max(0, Math.min(m.duration, s.minute));
      if (s.out != null && s.out in on) { min[s.out] += t - on[s.out]; delete on[s.out]; }
      if (s.in != null && !(s.in in on)) { on[s.in] = t; min[s.in] = min[s.in] || 0; }
    });
    Object.keys(on).forEach(nr => { min[nr] += m.duration - on[nr]; });
    return min;
  }
  /* Wer steht in Minute t auf dem Feld? */
  function onField(m, t) {
    const on = new Set(m.squad.filter(s => s.starter).map(s => s.nr));
    m.subs.slice().sort((a, b) => a.minute - b.minute).filter(s => s.minute <= t).forEach(s => { if (s.out != null) on.delete(s.out); if (s.in != null) on.add(s.in); });
    return on;
  }

  /* ---------- Übersicht ---------- */
  function listView() {
    const list = SZ.season.slice();
    if (SZ.sort === "min") list.sort((a, b) => b.minutes - a.minutes || a.nr - b.nr);
    if (SZ.sort === "pct") list.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.nr - b.nr);
    const rec = (SZ.games || []).filter(g => g.recorded).length;
    return `${LZ.coachNav("spielzeiten")}<section>${LZ.area("Trainer-Bereich")}<h1>Spielzeiten</h1>
      <p class="lede">Wer hat wie viel gespielt? Pro Spiel Startelf, Einwechselspieler und Wechsel eintragen – die Minuten rechnet die App.</p></section>
      ${SZ.err ? `<p class="err" style="text-align:left">${esc(SZ.err)}</p>` : ""}
      <section class="card stack"><h2>Spiele</h2>
      ${SZ.games === null ? `<p class="small">Lade …</p>` : !SZ.games.length ? `<p class="small">Seit Saisonbeginn stehen keine Spiele im Kalender.</p>` :
        `<ul class="blist">${SZ.games.map(g => `<li><button data-act="szOpen" data-v="${g.id}"><span><b>${esc(g.title)}</b>
          <span class="small">${esc(when(g))}${g.recorded ? ` · ${g.duration} Min.${g.gf != null && g.ga != null ? ` · ${g.gf}:${g.ga}` : ""}` : ""}</span></span>
          <span class="${g.recorded ? "cchip" : "small"}">${g.recorded ? "erfasst" : "offen"}</span></button></li>`).join("")}</ul>`}</section>
      <section class="card stack"><div class="rowspread"><h2>Saison</h2><span class="small">${rec} Spiel${rec === 1 ? "" : "e"} erfasst</span></div>
        <span class="seg wkseg"><button aria-pressed="${SZ.sort === "nr"}" data-act="szSort" data-v="nr">Nummer</button><button aria-pressed="${SZ.sort === "min"}" data-act="szSort" data-v="min">Minuten</button><button aria-pressed="${SZ.sort === "pct"}" data-act="szSort" data-v="pct">Anteil</button></span>
        <p class="small">Anteil = gespielte Minuten von den möglichen Minuten der Spiele, in denen er im Kader war.</p>
        <ul class="plist">${list.map(p => `<li><div class="prow2">
          <span class="pshirt">${LZ.shirt(p.nr)}</span>
          <span class="pname"><b>${p.name ? esc(p.name.split(" ")[0]) : "Nr. " + p.nr}</b><span class="small">${p.games} Sp. · ${p.starts}× Start · ${p.apps} Eins.</span></span>
          <span class="pbar"><span class="meter"><b style="width:${p.pct ?? 0}%"></b></span><span class="small">${p.minutes} Min.</span></span>
          <span class="ppct">${p.pct === null ? "–" : p.pct + "&nbsp;%"}</span></div></li>`).join("")}</ul></section>`;
  }
  LZ.actions.szSort = (b, v) => { SZ.sort = v; LZ.render(); };

  /* ---------- Ein Spiel erfassen ---------- */
  LZ.actions.szOpen = async (b, v) => {
    SZ.cur = { loading: true }; LZ.render();
    const r = await LZ.Store.get("matches.php?id=" + v);
    if (!r.ok) { SZ.err = r.error; SZ.cur = null; LZ.render(); return; }
    SZ.cur = { game: r.game, lineup: r.lineup || [], bench: r.bench || [], kader: r.kader || [], defDur: r.defaultDuration || 70,
      pauses: r.pauses ?? 1, slots: (r.slots || []).filter(s => s.lab), savedPlan: r.plan, plan: null,
      m: r.match || { duration: r.defaultDuration || 70, gf: null, ga: null, squad: [], subs: [] }, recorded: !!r.match };
    if (!r.match && (SZ.cur.lineup.length || SZ.cur.kader.length)) fromLineup();
    SZ.f = { minute: "", out: "", in: "" }; SZ.msg = ""; SZ.err = ""; SZ.dirty = !r.match;
    initPlan();
    LZ.render(); LZ.top();
  };
  // Startelf aus der Aufstellung, Einwechselspieler aus Aufstellung und Kader (ab 0.31.0)
  function fromLineup() {
    const c = SZ.cur, m = c.m, start = new Set(c.lineup);
    const subs = new Set(c.bench.concat(c.kader, m.squad.map(s => s.nr)).filter(n => !start.has(n)));
    m.squad = [...start].map(nr => ({ nr, starter: true })).concat([...subs].map(nr => ({ nr, starter: false })));
    if (!subs.size && !c.kader.length) (LZ.C.players || []).filter(p => !start.has(p.nr)).forEach(p => m.squad.push({ nr: p.nr, starter: false }));
  }
  /* ---------- Matchplan: Position + Soll-Minuten → wann wird gewechselt (ab 0.32.0) ---------- */
  const DEFAULT_SLOTS = ["TW", "RV", "IV", "IV", "LV", "6", "8", "8", "RA", "LA", "ST"];
  const slotLabs = () => SZ.cur.slots.length ? SZ.cur.slots.map(s => s.lab) : DEFAULT_SLOTS;
  function initPlan() {
    const c = SZ.cur, saved = c.savedPlan, labs = slotLabs();
    const bySlot = Object.fromEntries(c.slots.filter(s => s.nr).map(s => [s.nr, s.lab]));
    const sp = saved ? Object.fromEntries(saved.players.map(p => [p.nr, p])) : {};
    const P = { grid: saved ? saved.grid : 10, rows: {}, result: null, dirty: false };
    c.m.squad.forEach(s => {
      const pl = (LZ.C.players || []).find(p => p.nr === s.nr) || {};
      const pos = sp[s.nr] ? sp[s.nr].pos : bySlot[s.nr] || [pl.posOff, pl.posDef].find(x => labs.includes(x)) || "";
      P.rows[s.nr] = { pos, target: sp[s.nr] ? sp[s.nr].target : null };
    });
    c.plan = P;
    if (Object.values(P.rows).some(r => r.target === null)) evenOut();
  }
  function planInput() {
    const c = SZ.cur, P = c.plan;
    return { duration: c.m.duration, periods: (c.pauses || 0) + 1, grid: P.grid, slots: slotLabs(),
      players: c.m.squad.filter(s => P.rows[s.nr]).map(s => ({ nr: s.nr, pos: P.rows[s.nr].pos, target: +P.rows[s.nr].target || 0, starter: s.starter })) };
  }
  function evenOut() {
    const P = SZ.cur.plan, t = window.LZMatchplan.evenTargets(planInput());
    Object.entries(P.rows).forEach(([nr, r]) => { r.target = t[nr] ?? 0; });
  }
  function syncRows() {   // Kader geändert → Zeilen ergänzen/entfernen
    const c = SZ.cur, P = c.plan, labs = slotLabs();
    c.m.squad.forEach(s => { if (!P.rows[s.nr]) { const pl = (LZ.C.players || []).find(p => p.nr === s.nr) || {}; P.rows[s.nr] = { pos: [pl.posOff, pl.posDef].find(x => labs.includes(x)) || "", target: 0 }; } });
    Object.keys(P.rows).forEach(nr => { if (!c.m.squad.some(s => s.nr === +nr)) delete P.rows[nr]; });
  }
  function stints(res, nr, dur) {   // Einsatzzeiten eines Spielers aus Startelf + Wechseln
    const out = []; let from = res.starters.includes(nr) ? 0 : null;
    res.subs.forEach(s => { if (s.out === nr && from !== null) { out.push([from, s.minute]); from = null; } if (s.in === nr && from === null) from = s.minute; });
    if (from !== null) out.push([from, dur]);
    return out;
  }
  function planCard() {
    const c = SZ.cur, P = c.plan, m = c.m; if (!P) return "";
    syncRows();
    const labs = [...new Set(slotLabs())], periods = (c.pauses || 0) + 1, inp = planInput();
    const groups = labs.map(lab => { const n = slotLabs().filter(x => x === lab).length, ps = inp.players.filter(p => p.pos === lab);
      return { lab, need: n * m.duration, planned: ps.reduce((s, p) => s + p.target, 0), n, count: ps.length }; });
    const res = P.result, name = nr => { const p = (LZ.C.players || []).find(x => x.nr === nr); return p && p.name ? p.name.split(" ")[0] : ""; };
    const row = s => { const r = P.rows[s.nr]; return `<div class="mprow"><span class="knr">${LZ.shirt(s.nr)}<span>${esc(name(s.nr) || "Nr. " + s.nr)}</span></span>
      <span class="small">${s.starter ? "Start" : "Einw."}</span>
      <select id="mp-pos-${s.nr}" aria-label="Position Nr. ${s.nr}"><option value="">–</option>${labs.map(l => `<option ${l === r.pos ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <span class="mpmin"><input id="mp-t-${s.nr}" type="number" min="0" max="${m.duration}" step="5" inputmode="numeric" value="${r.target ?? 0}" aria-label="Soll-Minuten Nr. ${s.nr}"> Min.</span>
      ${res ? `<span class="small ${Math.abs((res.minutes[s.nr] || 0) - (r.target || 0)) > 0 ? "warnc" : "okc"}">Plan ${res.minutes[s.nr] || 0}'</span>` : "<span></span>"}</div>`; };
    const timeline = res ? (() => {
      const pct = v => (v / m.duration * 100).toFixed(2) + "%", breaks = res.blocks.filter(b => b.brk).map(b => b.from);
      const order = m.squad.slice().sort((a, b) => labs.indexOf(P.rows[a.nr].pos) - labs.indexOf(P.rows[b.nr].pos) || a.nr - b.nr);
      return `<div class="mptl">${order.map(s => `<div class="mptlrow"><span class="small">${esc(P.rows[s.nr].pos || "–")} · ${s.nr}</span><span class="mpbar">${breaks.map(b => `<i class="mpbrk" style="left:${pct(b)}"></i>`).join("")}${stints(res, s.nr, m.duration).map(([a, b]) => `<b style="left:${pct(a)};width:${pct(b - a)}">${b - a}'</b>`).join("")}</span></div>`).join("")}</div>`;
    })() : "";
    const byMin = {}; if (res) res.subs.forEach(s => { (byMin[s.minute] = byMin[s.minute] || []).push(s); });
    return `<section class="card stack" id="matchplan"><div class="rowspread"><h2>Matchplan</h2><span class="small">${m.duration} Min. · ${periods} ${periods === 1 ? "Abschnitt" : periods === 2 ? "Halbzeiten" : "Abschnitte"} (${c.pauses || 0} ${c.pauses === 1 ? "Pause" : "Pausen"})</span></div>
      <p class="small">Position und Soll-Minuten je Spieler eintragen – die App schlägt vor, wann gewechselt wird. Wechsel in der Pause werden bevorzugt, Startelf-Spieler beginnen.</p>
      <div class="row wrow"><div class="fld"><label for="mp-grid">Wechsel möglich alle</label><select id="mp-grid">${[5, 10, 15].map(g => `<option value="${g}" ${g === P.grid ? "selected" : ""}>${g} Min.</option>`).join("")}</select></div>
        <button class="btn ghost small" data-act="mpEven">Minuten je Position gleich verteilen</button></div>
      <div class="mplist">${m.squad.length ? m.squad.slice().sort((a, b) => b.starter - a.starter || a.nr - b.nr).map(row).join("") : `<p class="small">Erst den Kader festlegen.</p>`}</div>
      <div class="mpgroups">${groups.map(g => `<span class="mpg ${g.count < g.n ? "bad" : g.planned === g.need ? "ok" : "warn"}" title="${g.n} ${g.n === 1 ? "Platz" : "Plätze"} · ${g.count} Spieler"><b>${esc(g.lab)}</b> ${g.planned}/${g.need}</span>`).join("")}</div>
      <p class="small">Pro Position muss die Summe der Soll-Minuten den Plätzen × Spielzeit entsprechen (grün).</p>
      <div class="row"><button class="btn" data-act="mpCalc" ${m.squad.length ? "" : "disabled"}>Matchplan berechnen</button></div>
      ${res ? `${res.warnings.length ? `<ul class="alert mpwarn">${res.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        <h3>Wechselplan</h3>
        <ul class="sublist mpsubs"><li><b>0'</b><span>Start: ${res.starters.map(n => "Nr. " + n).join(", ")}</span></li>
          ${Object.entries(byMin).map(([mi, l]) => `<li><b>${mi}'</b><span>${l[0].brk ? "<em>in der Pause</em> " : ""}${l.map(s => `↓ ${s.out} ↑ ${s.in ?? "–"} <span class="small">(${esc(s.pos)})</span>`).join(" · ")}</span></li>`).join("") || `<li><span>Keine Wechsel nötig.</span></li>`}</ul>
        ${timeline}
        <div class="row"><button class="btn ghost" data-act="mpApply">Als Wechsel übernehmen</button></div>` : ""}</section>`;
  }
  LZ.actions.mpEven = () => { evenOut(); SZ.cur.plan.result = null; LZ.render(); };
  LZ.actions.mpCalc = async () => {
    const c = SZ.cur, P = c.plan;
    P.result = window.LZMatchplan.plan(planInput()); LZ.render();
    const r = await LZ.Store.send("matches.php", { action: "plan", id: c.game.id, plan: { grid: P.grid, players: planInput().players.map(p => ({ nr: p.nr, pos: p.pos, target: p.target })) } });
    if (!r.ok) { SZ.err = r.error || "Matchplan konnte nicht gespeichert werden."; LZ.render(); }
  };
  LZ.actions.mpApply = () => {
    const c = SZ.cur, res = c.plan.result; if (!res) return;
    c.m.squad.forEach(s => { s.starter = res.starters.includes(s.nr); });
    c.m.subs = res.subs.map(s => ({ minute: s.minute, out: s.out, in: s.in ?? null }));
    changed(); SZ.msg = "Wechsel aus dem Matchplan übernommen – zum Festhalten unten „Speichern“."; LZ.render();
  };

  function gameView() {
    const c = SZ.cur;
    if (c.loading) return `${LZ.coachNav("spielzeiten")}<p class="small">Lade …</p>`;
    const m = c.m, g = c.game, st = Object.fromEntries(m.squad.map(s => [s.nr, s.starter ? "start" : "bank"]));
    const starters = m.squad.filter(s => s.starter).length, bench = m.squad.length - starters;
    const mins = minutes(m);
    const t = SZ.f.minute === "" ? m.duration : Math.max(0, Math.min(m.duration, +SZ.f.minute));
    const on = onField(m, t), squadNrs = m.squad.map(s => s.nr);
    const opt = (nrs, cur) => `<option value="">–</option>${nrs.map(n => `<option value="${n}" ${String(cur) === String(n) ? "selected" : ""}>Nr. ${n}</option>`).join("")}`;
    return `${LZ.coachNav("spielzeiten")}<button class="back" data-act="szBack">‹ Spielzeiten</button>
      <section><p class="eyebrow">${g.typeLabel ? esc(g.typeLabel) + " · " : ""}${esc(cal().dayName(g.date))}${g.time ? " · " + esc(g.time) : ""}${c.recorded ? " · erfasst" : ""}${SZ.dirty ? " · nicht gespeichert" : ""}</p><h1>${esc(g.title)}</h1></section>
      <section class="card stack"><div class="row wrow">
        <div class="fld"><label for="sz-dur">Spielzeit (Min.)</label><input id="sz-dur" type="number" min="1" max="240" inputmode="numeric" value="${m.duration}" style="width:5.5em"><span class="small">Vorgabe ${g.typeLabel ? esc(g.typeLabel) + ": " : ""}${c.defDur} Min.</span></div>
        <div class="fld"><span class="fldlabel">Ergebnis (wir : Gegner)</span><div class="score"><input id="sz-gf" type="number" min="0" max="99" inputmode="numeric" value="${m.gf ?? ""}" aria-label="Tore wir"><b>:</b><input id="sz-ga" type="number" min="0" max="99" inputmode="numeric" value="${m.ga ?? ""}" aria-label="Tore Gegner"></div></div>
      </div></section>
      <section class="card stack"><div class="rowspread"><h2>Kader</h2><span class="small">Startelf ${starters} · Einwechselspieler ${bench}</span></div>
        <p class="small">Antippen wechselt: nicht dabei → Startelf → Einwechselspieler → nicht dabei.</p>
        ${c.lineup.length || c.kader.length ? `<button class="linkbtn" data-act="szLineup">Aus Aufstellung und Kader übernehmen (Startelf ${c.lineup.length}${c.kader.length ? ` · Kader ${c.kader.length}` : ""})</button>` : ""}
        <div class="squad">${(LZ.C.players || []).map(p => `<button class="sq-${st[p.nr] || "none"}" data-act="szCycle" data-v="${p.nr}" aria-label="Nummer ${p.nr}: ${st[p.nr] === "start" ? "Startelf" : st[p.nr] === "bank" ? "Einwechselspieler" : "nicht dabei"}">${LZ.shirt(p.nr)}<span>${st[p.nr] === "start" ? "Start" : st[p.nr] === "bank" ? "Einw." : "–"}</span></button>`).join("")}</div></section>
      ${planCard()}
      <section class="card stack"><h2>Wechsel</h2>
        <div class="row wrow">
          <div class="fld"><label for="sz-min">Minute</label><input id="sz-min" type="number" min="0" max="${m.duration}" inputmode="numeric" value="${esc(SZ.f.minute)}" style="width:5em"></div>
          <div class="fld"><label for="sz-out">Raus</label><select id="sz-out">${opt([...on].sort((a, b) => a - b), SZ.f.out)}</select></div>
          <div class="fld"><label for="sz-in">Rein</label><select id="sz-in">${opt(squadNrs.filter(n => !on.has(n)).sort((a, b) => a - b), SZ.f.in)}</select></div>
        </div>
        <button class="btn ghost" data-act="szAddSub">Wechsel eintragen</button>
        ${m.subs.length ? `<ul class="sublist">${m.subs.slice().sort((a, b) => a.minute - b.minute).map(s => `<li><b>${s.minute}'</b><span>${s.out != null ? `↓ Nr. ${s.out}` : ""}</span><span>${s.in != null ? `↑ Nr. ${s.in}` : ""}</span>
          <button class="linkbtn" data-act="szDelSub" data-v="${m.subs.indexOf(s)}" aria-label="Wechsel löschen">✕</button></li>`).join("")}</ul>` : `<p class="small">Noch keine Wechsel.</p>`}</section>
      <section class="card stack"><h2>Minuten</h2>${m.squad.length ? `<ul class="minlist">${m.squad.slice().sort((a, b) => (mins[b.nr] || 0) - (mins[a.nr] || 0) || a.nr - b.nr).map(s => `<li>
          <span>Nr. ${s.nr}${s.starter ? "" : " <span class='small'>(Einwechselspieler)</span>"}</span><span class="meter"><b style="width:${Math.round((mins[s.nr] || 0) / m.duration * 100)}%"></b></span><b>${mins[s.nr] || 0}'</b></li>`).join("")}</ul>` : `<p class="small">Erst den Kader festlegen.</p>`}</section>
      ${SZ.err ? `<p class="err" style="text-align:left">${esc(SZ.err)}</p>` : ""}${SZ.msg ? `<p class="okmsg">${esc(SZ.msg)}</p>` : ""}
      <div class="row"><button class="btn" data-act="szSave" ${SZ.busy ? "disabled" : ""}>Speichern</button>${c.recorded ? `<button class="btn ghost" data-act="szClear">Erfassung löschen</button>` : ""}</div>`;
  }

  LZ.views.spielzeiten = () => {
    if (!LZ.coachMode()) return `<p class="small">Nur für Trainer.</p>`;
    return SZ.cur ? gameView() : listView();
  };

  const changed = () => { SZ.dirty = true; SZ.msg = ""; };
  LZ.actions.szBack = () => { SZ.cur = null; loadList(); LZ.render(); };
  LZ.actions.szLineup = () => { fromLineup(); changed(); LZ.render(); };
  LZ.actions.szCycle = (b, v) => {
    const m = SZ.cur.m, nr = +v, s = m.squad.find(x => x.nr === nr);
    if (!s) m.squad.push({ nr, starter: true });
    else if (s.starter) s.starter = false;
    else { m.squad = m.squad.filter(x => x.nr !== nr); m.subs = m.subs.filter(x => x.out !== nr && x.in !== nr); }
    changed(); LZ.render();
  };
  LZ.actions.szAddSub = () => {
    const m = SZ.cur.m, f = SZ.f, mi = parseInt(f.minute, 10);
    if (!(mi >= 0 && mi <= m.duration)) { SZ.err = `Bitte eine Minute zwischen 0 und ${m.duration} eingeben.`; LZ.render(); return; }
    if (!f.out && !f.in) { SZ.err = "Bitte wählen, wer raus und wer rein geht."; LZ.render(); return; }
    m.subs.push({ minute: mi, out: f.out ? +f.out : null, in: f.in ? +f.in : null });
    SZ.f = { minute: f.minute, out: "", in: "" }; SZ.err = ""; changed(); LZ.render();
  };
  LZ.actions.szDelSub = (b, v) => { SZ.cur.m.subs.splice(+v, 1); changed(); LZ.render(); };
  LZ.actions.szSave = async () => {
    const c = SZ.cur, m = c.m; SZ.busy = true; SZ.err = ""; LZ.render();
    const r = await LZ.Store.send("matches.php", { action: "save", id: c.game.id, duration: m.duration, gf: m.gf, ga: m.ga, squad: m.squad, subs: m.subs });
    SZ.busy = false;
    if (!r.ok) { SZ.err = r.error || "Speichern hat nicht geklappt."; LZ.render(); return; }
    c.recorded = true; SZ.dirty = false; SZ.msg = "Gespeichert."; LZ.render();
  };
  LZ.actions.szClear = async () => {
    const r = await LZ.Store.send("matches.php", { action: "clear", id: SZ.cur.game.id });
    if (!r.ok) { SZ.err = r.error; LZ.render(); return; }
    SZ.cur = null; loadList(); LZ.render();
  };
  LZ.inputs.push(e => {
    if (!SZ.cur || !SZ.cur.m || LZ.S.view !== "spielzeiten") return;
    const id = e.target.id, m = SZ.cur.m, v = e.target.value;
    const num = (lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
    if (id === "sz-dur" && e.type === "change") { m.duration = num(1, 240) || 70; changed(); LZ.render(); }
    else if (id === "sz-gf") { m.gf = num(0, 99); changed(); }
    else if (id === "sz-ga") { m.ga = num(0, 99); changed(); }
    else if (id === "sz-min") { SZ.f.minute = v; if (e.type === "change") LZ.render(); }   // Auswahl „Raus“ hängt von der Minute ab
    else if (id === "sz-out") SZ.f.out = v;
    else if (id === "mp-grid") { SZ.cur.plan.grid = +v; SZ.cur.plan.result = null; LZ.render(); }
    else if (id.startsWith("mp-pos-")) { SZ.cur.plan.rows[+id.slice(7)].pos = v; SZ.cur.plan.result = null; LZ.render(); }
    else if (id.startsWith("mp-t-")) { const r = SZ.cur.plan.rows[+id.slice(5)]; r.target = num(0, m.duration) ?? 0; if (e.type === "change") { SZ.cur.plan.result = null; LZ.render(); } }
    else if (id === "sz-in") SZ.f.in = v;
  });
})();
