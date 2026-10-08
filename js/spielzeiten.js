/*
 * Lernzone – Spielzeiten (nur Trainer, Reiter „Spielzeiten“)
 * Pro Spiel: Spielzeit, Ergebnis, Spieltagskader (Startelf / Bank, auch aus der Aufstellung), Wechsel mit Minute
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
    return `${LZ.coachNav("spielzeiten")}<section><p class="eyebrow">Trainer-Bereich</p><h1>Spielzeiten</h1>
      <p class="lede">Wer hat wie viel gespielt? Pro Spiel Startelf, Bank und Wechsel eintragen – die Minuten rechnet die App.</p></section>
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
    SZ.cur = { game: r.game, lineup: r.lineup, m: r.match || { duration: 70, gf: null, ga: null, squad: [], subs: [] }, recorded: !!r.match };
    if (!r.match && r.lineup && r.lineup.length) fromLineup();
    SZ.f = { minute: "", out: "", in: "" }; SZ.msg = ""; SZ.err = ""; SZ.dirty = !r.match;
    LZ.render(); LZ.top();
  };
  function fromLineup() {
    const m = SZ.cur.m, start = new Set(SZ.cur.lineup);
    const keep = m.squad.filter(s => !start.has(s.nr)).map(s => ({ nr: s.nr, starter: false }));
    m.squad = [...start].map(nr => ({ nr, starter: true })).concat(keep);
    // ohne Bank: alle übrigen aktiven Spieler auf die Bank
    if (!keep.length) (LZ.C.players || []).filter(p => !start.has(p.nr)).forEach(p => m.squad.push({ nr: p.nr, starter: false }));
  }
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
      <section><p class="eyebrow">${esc(cal().dayName(g.date))}${g.time ? " · " + esc(g.time) : ""}${c.recorded ? " · erfasst" : ""}${SZ.dirty ? " · nicht gespeichert" : ""}</p><h1>${esc(g.title)}</h1></section>
      <section class="card stack"><div class="row wrow">
        <div class="fld"><label for="sz-dur">Spielzeit (Min.)</label><input id="sz-dur" type="number" min="1" max="240" inputmode="numeric" value="${m.duration}" style="width:5.5em"></div>
        <div class="fld"><span class="fldlabel">Ergebnis (wir : Gegner)</span><div class="score"><input id="sz-gf" type="number" min="0" max="99" inputmode="numeric" value="${m.gf ?? ""}" aria-label="Tore wir"><b>:</b><input id="sz-ga" type="number" min="0" max="99" inputmode="numeric" value="${m.ga ?? ""}" aria-label="Tore Gegner"></div></div>
      </div></section>
      <section class="card stack"><div class="rowspread"><h2>Kader</h2><span class="small">Startelf ${starters} · Bank ${bench}</span></div>
        <p class="small">Antippen wechselt: nicht dabei → Startelf → Bank → nicht dabei.</p>
        ${c.lineup && c.lineup.length ? `<button class="linkbtn" data-act="szLineup">Startelf aus der Aufstellung übernehmen (${c.lineup.length} Spieler)</button>` : ""}
        <div class="squad">${(LZ.C.players || []).map(p => `<button class="sq-${st[p.nr] || "none"}" data-act="szCycle" data-v="${p.nr}" aria-label="Nummer ${p.nr}: ${st[p.nr] === "start" ? "Startelf" : st[p.nr] === "bank" ? "Bank" : "nicht dabei"}">${LZ.shirt(p.nr)}<span>${st[p.nr] === "start" ? "Start" : st[p.nr] === "bank" ? "Bank" : "–"}</span></button>`).join("")}</div></section>
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
          <span>Nr. ${s.nr}${s.starter ? "" : " <span class='small'>(Bank)</span>"}</span><span class="meter"><b style="width:${Math.round((mins[s.nr] || 0) / m.duration * 100)}%"></b></span><b>${mins[s.nr] || 0}'</b></li>`).join("")}</ul>` : `<p class="small">Erst den Kader festlegen.</p>`}</section>
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
    else if (id === "sz-in") SZ.f.in = v;
  });
})();
