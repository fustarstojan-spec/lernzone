/*
 * Lernzone – Trainer-Startseite (nur Weg B / PHP, Trainer ohne Spieler-Anmeldung)
 * Reiter: Übersicht · Lernzone · Taktik · Spielzeiten
 * Übersicht: die nächsten 4 Termine (Zusagen der Spieler, welche Trainer dabei sind) und die Trainingsbeteiligung aller Spieler
 * Daten: api/dashboard.php
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const D = { data: null, at: 0, sort: "nr", busy: false, err: "" };

  /* ---------- Reiter für Trainer ---------- */
  const TABS = [["home", "Übersicht"], ["lernzone", "Lernzone"], ["taktik", "Taktik"], ["spielzeiten", "Spielzeiten"]];
  LZ.coachNav = active => `<nav class="seg coachnav" aria-label="Trainer-Bereich">${TABS.concat(LZ.isAdmin() ? [["verwaltung", "Verwaltung"]] : []).map(([k, l]) =>
    `<button aria-pressed="${active === k}" data-act="${k === "home" ? "home" : "cnav"}" data-v="${k}">${l}</button>`).join("")}</nav>`;
  LZ.actions.cnav = (b, v) => LZ.go(v);

  async function load(force) {
    if (!LZ.coachMode() || (!force && D.data && Date.now() - D.at < 30000)) return;
    const r = await LZ.Store.get("dashboard.php");
    if (r && r.ok) { D.data = r; D.at = Date.now(); D.err = ""; } else D.err = (r && r.error) || "Übersicht konnte nicht geladen werden.";
    if (LZ.S.view === "home") LZ.render();
  }
  LZ.on("ready", () => load());
  LZ.on("enter", v => { if (v === "home") load(); });

  const cal = () => LZ.calendar || { chip: () => "", dayName: d => d, timeText: e => e.time };

  /* ---------- Termine ---------- */
  function eventsCard(d) {
    if (!d.events.length) return `<section class="card stack"><h2>Nächste Termine</h2><p class="small">Keine Termine eingetragen.</p></section>`;
    const row = e => {
      const out = new Set(e.coachesOut), meOut = out.has(d.me.id);
      const coaches = d.coaches.map(c => `<span class="cchip ${out.has(c.id) ? "out" : ""}" title="${out.has(c.id) ? "nicht dabei" : "dabei"}">${out.has(c.id) ? "✕" : "✓"} ${esc(c.name)}</span>`).join("");
      const pl = e.players ? (e.state === 2 ? `<span class="abschip">Fällt aus</span>`
        : `<span class="pcount"><b>${e.players.coming}</b>/${e.players.total} ${e.players.recorded ? "da" : "Spieler"}${e.players.absent ? ` · ${e.players.absent} abgesagt` : ""}</span>`) : "";
      return `<li class="evcard">
        <div class="rowspread"><span><b>${esc(cal().dayName(e.date))}</b> · ${esc(cal().timeText(e))}</span>${cal().chip(e.kind)}</div>
        <button class="evtitle-btn" data-act="tOpen" data-v="${e.id}">${esc(e.title)}${e.location ? ` <span class="small">· ${esc(e.location)}</span>` : ""}</button>
        ${pl}
        <div class="cchips">${coaches}</div>
        <button class="linkbtn" data-act="dOut" data-v="${e.id}" data-o="${meOut ? "in" : "out"}" ${D.busy ? "disabled" : ""}>${meOut ? "Ich bin doch dabei" : "Ich kann nicht"}</button>
      </li>`;
    };
    return `<section class="card stack"><div class="rowspread"><h2>Nächste Termine</h2><button class="linkbtn" data-act="calAll">Alle Termine</button></div>
      <ul class="evcards">${d.events.map(row).join("")}</ul></section>`;
  }
  LZ.actions.dOut = async b => {
    D.busy = true; LZ.render();
    const r = await LZ.Store.send("dashboard.php", { action: b.dataset.o, id: +b.dataset.v });
    D.busy = false;
    if (!r.ok) { D.err = r.error || "Hat nicht geklappt."; LZ.render(); return; }
    await load(true);
  };

  /* ---------- Beteiligung aller Spieler ---------- */
  function playersCard(d) {
    const list = d.players.slice();
    if (D.sort === "pct") list.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.nr - b.nr);
    const withVal = list.filter(p => p.total);
    const avg = withVal.length ? Math.round(withVal.reduce((s, p) => s + p.pct, 0) / withVal.length) : null;
    const lvl = p => p.pct === null ? "" : p.pct >= 85 ? "hi" : p.pct >= 70 ? "mid" : "lo";
    return `<section class="card stack"><div class="rowspread"><h2>Trainingsbeteiligung</h2>${avg !== null ? `<span class="bignum">Ø ${avg}&nbsp;%</span>` : ""}</div>
      <div class="rowspread"><span class="small">Absagen: letzte 4 Wochen und kommende 2</span>
        <span class="seg wkseg"><button aria-pressed="${D.sort === "nr"}" data-act="dSort" data-v="nr">Nummer</button><button aria-pressed="${D.sort === "pct"}" data-act="dSort" data-v="pct">Beteiligung</button></span></div>
      <ul class="plist">${list.map(p => `<li><button class="prow2" data-act="cPlayer" data-v="${p.nr}">
        <span class="pshirt">${LZ.shirt(p.nr)}</span>
        <span class="pname"><b>${p.name ? esc(p.name.split(" ")[0]) : "Nr. " + p.nr}</b><span class="small">${esc([p.posOff, p.posDef].filter(Boolean).join(" / ") || "–")}${p.flag ? " · ⚑" : ""}</span></span>
        <span class="pbar"><span class="meter ${lvl(p)}"><b style="width:${p.pct ?? 0}%"></b></span><span class="small">${p.total ? `${p.attended}/${p.total}` : "–"}${p.absences28 ? ` · ${p.absences28} Abs.` : ""}</span></span>
        <span class="ppct">${p.pct === null ? "–" : p.pct + "&nbsp;%"}</span></button></li>`).join("")}</ul></section>`;
  }
  LZ.actions.dSort = (b, v) => { D.sort = v; LZ.render(); };

  LZ.views.coachHome = () => {
    const name = (LZ.Store.coach && LZ.Store.coach.name) || "";
    const d = D.data;
    return `${LZ.coachNav("home")}
      <section><p class="eyebrow">Trainer-Bereich</p><h1>Hallo${name ? " " + esc(name) : ""}</h1></section>
      ${D.err ? `<p class="err" style="text-align:left">${esc(D.err)}</p>` : ""}
      ${d ? eventsCard(d) + playersCard(d) : `<p class="small">Lade …</p>`}
      ${teamCard()}
      <p class="small" style="text-align:center">Kader, Trainings und Konten: oben rechts auf das Trikot tippen.</p>`;
  };

  /* ---------- Mannschaft (ab 0.21.0): wechseln; neue Mannschaften legt der Vereinsadmin unter „Verwaltung“ an ---------- */
  const T = { err: "" };
  function teamCard() {
    const c = LZ.Store.coach || {}, cur = c.team, list = c.teams || [];
    if (!cur) return "";
    const others = list.filter(t => t.id !== cur.id);
    return `<section class="card stack"><div class="rowspread"><h2>Mannschaft</h2><span class="small">${esc(cur.club)}</span></div>
      <p><b>${esc(cur.name)}</b>${cur.season ? ` <span class="small">· Saison ${esc(cur.season)}</span>` : ""}</p>
      ${T.err ? `<p class="err" style="text-align:left">${esc(T.err)}</p>` : ""}
      ${others.length ? `<div class="stack"><p class="small">Wechseln zu:</p><div class="chiprow">${others.map(t =>
        `<button class="btn ghost small" data-act="teamSwitch" data-v="${t.id}">${esc(t.name)}${t.season ? " · " + esc(t.season) : ""}${t.club !== cur.club ? ` <span class="small">(${esc(t.club)})</span>` : ""}</button>`).join("")}</div></div>` : ""}
      ${LZ.isAdmin() ? `<button class="btn ghost" data-act="cnav" data-v="verwaltung">Mannschaften und Trainer verwalten</button>` : ""}
    </section>`;
  }
  LZ.actions.teamSwitch = async (b, v) => {
    const r = await LZ.Store.send("teams.php", { action: "switch", id: +v });
    if (r && r.ok) location.reload(); else { T.err = (r && r.error) || "Wechseln hat nicht geklappt."; LZ.render(); }
  };

  /* ---------- Platzhalter bis 0.14.0 / 0.15.0 ---------- */
  const soon = (k, title, text) => () => `${LZ.coachNav(k)}<section><p class="eyebrow">Trainer-Bereich</p><h1>${title}</h1><p class="lede">${text}</p></section>`;
  if (!LZ.views.taktik) LZ.views.taktik = soon("taktik", "Taktik", "Taktiktafel und Aufstellungen kommen mit der nächsten Version.");
  if (!LZ.views.spielzeiten) LZ.views.spielzeiten = soon("spielzeiten", "Spielzeiten", "Minuten pro Spiel und Saison-Übersicht kommen mit einer der nächsten Versionen.");
})();
