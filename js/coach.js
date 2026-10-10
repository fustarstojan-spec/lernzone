/*
 * Lernzone – Trainer-Bereich (nur Weg B / PHP)
 * Reiter: Kader (Spieler anlegen, Profil/Positionen/Einwilligung/Zugang, löschen) · Trainings (Anwesenheit, Barometer) · Trainer (Konten, Admins)
 * Anmeldung läuft über js/auth.js; hier gibt es Benutzernamen und Einmal-Codes statt PINs.
 * Daten: api/coaches.php, api/players.php, api/accounts.php, api/trainings.php
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const LAUNE = ["😞", "🙁", "😐", "🙂", "😄"];
  const MONATE = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  const FUSS = { links: "links", rechts: "rechts", beide: "beidfüßig" };
  const TAGE = [["mo", "Mo"], ["di", "Di"], ["mi", "Mi"], ["do", "Do"], ["fr", "Fr"]];

  const T = {
    step: "auth", tab: "kader", next: "kader", from: "grid",
    coaches: [], err: "", msg: "", busy: false,
    type: "feld", nr: "", uname: "", posOff: "", posDef: "", created: null,
    code: null,   // { title, username, code, expires, back: [step, extra] }
    editNr: null, detail: null, confirm: null,
    trainings: null, tr: null, newT: null,
    cEdit: null, cf: { name: "", user: "", isAdmin: false }
  };
  const St = () => LZ.Store, Co = () => LZ.Store.coach;
  const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const todayIso = () => new Date().toLocaleDateString("sv-SE");

  function show(step, extra) { Object.assign(T, { err: "", msg: "", confirm: null }, extra || {}); T.step = step; LZ.S.view = "coach"; LZ.render(); LZ.top(); }
  function fail(r) {
    T.busy = false; T.err = (r && r.error) || "Das hat nicht geklappt.";
    if (/Nur für Trainer|melde dich an/.test(T.err)) { Co().active = false; LZ.S.view = "home"; }
    LZ.render();
  }
  async function refreshPlayers() {
    await St().refreshPlayers();
    window.LZPitch.setup(LZ.C.zones, LZ.C.team, LZ.gkNrs());
  }
  async function loadCoaches() { const r = await St().get("coaches.php"); T.coaches = Array.isArray(r) ? r : []; if (LZ.S.view === "coach") LZ.render(); }

  /* ---------- Einstieg ---------- */
  function start(target) {
    if (!Co().active) return LZ.go("home");          // Anmeldung: js/auth.js
    Object.assign(T, { nr: "", uname: "", posOff: "", posDef: "", type: "feld", created: null });
    open(target);
  }
  async function open(target) {
    T.tab = target === "form" ? "kader" : target;
    if (target === "form") return show("form", { type: "feld", nr: "", uname: "", posOff: "", posDef: "" });
    if (target === "kader") { show("kader"); await refreshPlayers(); LZ.render(); return; }
    if (target === "trainings") return openTrainings();
    if (target === "coaches") { show("coaches"); await loadCoaches(); if (Co().isAdmin) loadCal(); return; }
  }
  LZ.actions.addStart = () => start("form");
  LZ.actions.kaderStart = () => start("kader");

  /* ---------- Kopf mit Reitern ---------- */
  const tabs = () => Co().active ? `
    <div class="coachbar"><span>Trainer: <b>${esc(Co().name || "")}</b>${Co().clubAdmin ? ` <span class="badge">Vereinsadmin</span>` : Co().isAdmin ? ` <span class="badge">Cheftrainer</span>` : ""}</span><span class="coachbar-links"><button class="linkbtn" data-act="pwStart">Passwort ändern</button><button class="linkbtn" data-act="logout">Abmelden</button></span></div>
    <div class="seg">${[["kader", "Kader"], ["trainings", "Trainings"], ["coaches", Co().isAdmin ? "Trainer" : "Mein Konto"]].map(([k, l]) =>
      `<button aria-pressed="${T.tab === k}" data-act="ctab" data-v="${k}">${l}</button>`).join("")}</div>` : "";
  LZ.actions.ctab = (b, v) => open(v);
  const backGrid = `<button class="back" data-act="home">‹ Übersicht</button>`;
  const head = (t, sub) => `<section style="display:grid;justify-items:center;gap:8px;text-align:center"><div style="width:72px">${LZ.shirt("+", "add")}</div><h1>${t}</h1>${sub ? `<p class="lede">${sub}</p>` : ""}</section>`;
  const errP = () => T.err ? `<p class="err" role="alert" style="text-align:left">${esc(T.err)}</p>` : "";
  const okP = () => T.msg ? `<p class="okmsg" role="status">${esc(T.msg)}</p>` : "";
  const userField = (id, label, val, hint) => `<div class="fld"><label for="${id}">${label}</label>
      <input id="${id}" autocapitalize="none" spellcheck="false" maxlength="30" placeholder="z. B. vorname.n" value="${esc(val)}">
      ${hint ? `<span class="small">${hint}</span>` : ""}</div>`;
  const codeCard = c => `<div class="card stack codebox"><p class="eyebrow">${esc(c.title)}</p>
      <p class="small">Benutzername</p><p class="user">${esc(c.username)}</p>
      <p class="small">Einmal-Code</p><p class="pinshow">${esc(c.code)}</p>
      <p class="small">Gültig bis ${esc(c.expires)}. Mit Benutzername und Code anmelden, dann ein eigenes Passwort festlegen.
      Gib die Daten persönlich weiter – der Code wird hier nicht noch einmal angezeigt.</p></div>`;
  const attLine = a => a.total ? `<div class="attline">${a.last.map(x => `<i class="${x.present ? "on" : ""}" title="${esc(fmtDate(x.date))}"></i>`).join("")}</div>
      <p class="small">${a.attended} von ${a.total} Trainings · ${Math.round(a.attended / a.total * 100)} %</p>` : `<p class="small">Noch keine Trainings eingetragen.</p>`;
  const moodLine = (v, n) => [
    v ? `${LAUNE[(v.laune || 3) - 1]} ${v.laune} · Schlaf ${v.schlaf ?? "–"} · Energie ${v.energie ?? "–"}${v.nichtfit ? ` · <b class="warn">nicht fit</b>` : ""}` : "",
    n ? `Belastung ${n.rpe}/10` : ""].filter(Boolean).join(" · ");
  const comments = (v, n) => [v && v.kommentar, n && n.kommentar].filter(Boolean).map(c => `<p class="small">„${esc(c)}“</p>`).join("");

  /* ---------- Ansichten ---------- */
  LZ.views.coach = () => {
    const s = T.step;
    if (!Co().active) return "";
    // ab hier angemeldet
    if (s === "kader") return `${backGrid}<section><p class="eyebrow">Trainer-Bereich</p><h1>Kader</h1><p class="lede">Tippe auf ein Trikot für Profil, Positionen, Einwilligung und PIN. Ein roter Punkt heißt: bitte ansprechen.</p></section>${tabs()}
      <div class="nrgrid">${LZ.C.players.map(p => `<button class="nr ${p.flag ? "flag" : ""}" data-act="cPlayer" data-v="${p.nr}" aria-label="Nummer ${p.nr}${p.name ? ", " + esc(p.name) : ""}">${LZ.shirt(p.nr)}<span>${esc((p.name || "").split(" ")[0] || [p.posOff, p.posDef].filter(Boolean).join(" / ") || "–")}</span></button>`).join("")}
      <button class="nr add" data-act="cAdd" aria-label="Neuen Spieler anlegen">${LZ.shirt("+", "add")}<span>Neu</span></button></div>`;

    if (s === "iepEdit") {
      const e = T.iepE, ta = (id, label, val, rows) => `<div class="fld"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows || 3}">${esc(val || "")}</textarea></div>`;
      return `<button class="back" data-act="cPlayer" data-v="${T.editNr}">‹ Nr. ${T.editNr}</button>${tabs()}
      <section><p class="eyebrow">Nr. ${T.editNr}</p><h1>Entwicklungsplan</h1><p class="lede">Neuer Stand – der bisherige bleibt erhalten. Ein Ziel pro Zeile; Ziele und Zeitplan sieht der Spieler.</p></section>
      <section class="card stack"><h2>Ziele (Spieler sieht sie)</h2>
        <div class="fld"><label for="iep-season">Saison / Stand</label><input id="iep-season" maxlength="40" value="${esc(e.season || "")}" placeholder="z. B. U14 26/27"></div>
        ${IEP_AREAS.map(([k, l]) => ta("iep-g-" + k, l, (e.goals[k] || []).join("\n"), 4)).join("")}</section>
      <section class="card stack"><h2>Zeitplan (Spieler sieht ihn)</h2>
        ${[["short", "Kurzfristig (1–4 Wochen)"], ["mid", "Mittelfristig (1–3 Monate)"], ["long", "Langfristig (Saison)"]].map(([k, l]) => ta("iep-p-" + k, l, e.plan[k], 2)).join("")}</section>
      <section class="card stack"><h2>Nur für Trainer</h2>
        ${IEP_COACH.map(([k, l]) => ta("iep-c-" + k, l, k === "clusters" ? (e.coach.clusters || []).join("\n") : e.coach[k], 2)).join("")}</section>
      ${errP()}<button class="btn wide" data-act="iepSave" ${T.busy ? "disabled" : ""}>Als neuen Stand speichern</button>`;
    }
    if (s === "player") {
      const d = T.detail; if (!d) return `${tabs()}<p class="small">Lade …</p>`;
      const p = d.player, pr = d.profile || {}, name = [pr.vorname, pr.nachname].filter(Boolean).join(" ");
      const rows = [
        ["Geburtstag", pr.geb_tag && pr.geb_monat ? `${pr.geb_tag}. ${MONATE[pr.geb_monat - 1]}` : ""],
        ["Starker Fuß", FUSS[pr.fuss] || ""], ["Wunschposition", pr.wunsch || ""], ["Vorbild", pr.vorbild || ""],
        ["Schulschluss", TAGE.filter(([k]) => pr.schule && pr.schule[k]).map(([k, l]) => `${l} ${pr.schule[k]}`).join(" · ")],
        ["Größen", [pr.trikot ? `Trikot ${pr.trikot}` : "", pr.schuh ? `Schuh ${pr.schuh}` : ""].filter(Boolean).join(" · ")],
        ["Saisonziel", pr.ziel || ""]].filter(r => r[1]);
      return `<button class="back" data-act="ctab" data-v="kader">‹ Kader</button>${tabs()}
      <section class="me-head">${LZ.shirt(p.nr)}<div><p class="eyebrow">${p.plan === "tw" ? "Torwart" : "Feldspieler"}</p><h1>Nr. ${p.nr}</h1><p class="small">${esc(name || "Profil noch leer")}</p></div></section>
      ${d.flag ? `<p class="alert">Bitte ansprechen: ${esc(d.flag)}</p>` : ""}
      <section class="card stack"><h2>Einwilligung der Eltern</h2>
        <label class="check"><input type="checkbox" id="c-consent" ${p.consent ? "checked" : ""}> Liegt vor – Profil, Befindens-Barometer und Selbsteinschätzung sind freigeschaltet</label>
        <button class="linkbtn" data-act="legal" data-v="einwilligung">Formular zum Ausdrucken</button></section>
      <section class="card stack"><h2>Profil</h2>${rows.length ? `<dl class="sub">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : `<p class="small">${p.consent ? "Der Spieler hat noch nichts eingetragen." : "Wird nach der Einwilligung freigeschaltet."}</p>`}</section>
      <section class="card stack"><h2>Trainingsbeteiligung</h2>${attLine(d.attendance)}</section>
      ${gradeSummary(d)}
      ${iepSection(d)}
      <section class="card stack"><h2>Befinden</h2>${d.moods.length ? d.moods.map(m => `<div class="moodrow"><span class="small">${esc(fmtDate(m.date))}</span><span>${moodLine(m.vor, m.nach) || "–"}</span>${comments(m.vor, m.nach)}</div>`).join("") : `<p class="small">Noch keine Einträge.</p>`}</section>
      <section class="card stack"><h2>Positionen</h2>
        ${LZ.posSelect("pos-off", T.posOff, "Offensivere Position")}${LZ.posSelect("pos-def", T.posDef, "Defensivere Position")}
        <button class="btn wide" data-act="cPosSave" ${T.busy ? "disabled" : ""}>Positionen speichern</button></section>
      <section class="card stack"><h2>Zugang</h2>
        ${userField("c-uname", "Benutzername", T.uname)}
        <button class="btn ghost wide" data-act="cUserSave" ${T.busy ? "disabled" : ""}>Benutzernamen speichern</button>
        <button class="btn wide" data-act="cCode" ${T.busy ? "disabled" : ""}>Neuen Einmal-Code erzeugen</button>
        <p class="small">Für die erste Anmeldung oder wenn das Passwort vergessen wurde. Das alte Passwort gilt danach nicht mehr, und alle Geräte werden abgemeldet.</p></section>
      ${okP()}${errP()}
      ${Co().isAdmin ? (T.confirm === "delPlayer"
        ? `<section class="card stack danger"><p><b>Nr. ${p.nr} wirklich löschen?</b> Profil, Befinden, Trainingsbeteiligung und Lernfortschritt werden endgültig entfernt.</p>
           <div class="row"><button class="btn danger-btn" data-act="cDelPlayer">Ja, löschen</button><button class="btn ghost" data-act="cCancel">Abbrechen</button></div></section>`
        : `<button class="btn ghost wide danger-text" data-act="cAskDel" data-v="delPlayer">Spieler löschen</button>`) : ""}`;
    }

    if (s === "code") { const c = T.code; return `<section style="display:grid;justify-items:center;gap:10px;text-align:center">${c.nr ? `<div style="width:96px">${LZ.shirt(c.nr)}</div>` : ""}<h1>${esc(c.heading)}</h1></section>
      ${codeCard(c)}${c.buttons}`; }

    if (s === "form") {
      const typeBtn = (t, label) => `<button class="typebtn" data-act="cType" data-v="${t}" aria-pressed="${T.type === t}">${LZ.shirt(/^\d{1,2}$/.test(T.nr) ? T.nr : (t === "tw" ? "TW" : "?"), t)}<span>${label}</span></button>`;
      return `<button class="back" data-act="${Co().active ? "ctab" : "me"}" data-v="kader">‹ ${Co().active ? "Kader" : "Zur Nummernwahl"}</button>${tabs()}
      <section><p class="eyebrow">Kader</p><h1>Neuer Spieler</h1></section>
      <div class="stack"><p class="fldlabel">Trikot</p><div class="typepick">${typeBtn("tw", "Torwart")}${typeBtn("feld", "Feldspieler")}</div></div>
      <div class="fld"><label for="c-nr">Trikotnummer</label><input id="c-nr" type="text" inputmode="numeric" maxlength="2" autocomplete="off" placeholder="z. B. 23" value="${esc(T.nr)}"></div>
      ${LZ.posSelect("pos-off", T.posOff, "Offensivere Position")}${LZ.posSelect("pos-def", T.posDef, "Defensivere Position")}
      ${userField("c-newuser", "Benutzername", T.uname, "Leer lassen = spieler + Nummer. Kann später geändert werden.")}${errP()}
      <button class="btn wide" data-act="cAddSave" ${T.busy ? "disabled" : ""}>Spieler anlegen</button>`;
    }
    if (s === "trainings") {
      const n = T.newT;
      return `${backGrid}<section><p class="eyebrow">Trainer-Bereich</p><h1>Trainings</h1><p class="lede">Termine aus dem Google-Kalender erscheinen hier automatisch. Tippe einen an für Anwesenheit und Befinden.</p></section>${tabs()}
      <section class="card stack"><h2>Zusätzliches Training anlegen</h2>
        <div class="grid2"><div class="fld"><label for="t-date">Datum</label><input type="date" id="t-date" value="${esc(n.date)}"></div>
        <div class="fld"><label for="t-time">Uhrzeit</label><input type="time" id="t-time" value="${esc(n.time)}"></div></div>
        <div class="fld"><label for="t-note">Notiz (freiwillig)</label><input id="t-note" maxlength="80" placeholder="z. B. Kunstrasen, Schwerpunkt Pressing" value="${esc(n.note)}"></div>
        ${errP()}<button class="btn wide" data-act="tCreate" ${T.busy ? "disabled" : ""}>Training anlegen</button></section>
      <section class="stack">${T.trainings === null ? `<p class="small">Lade …</p>` : T.trainings.length ? T.trainings.map(t => `
        <button class="trow ${t.date < todayIso() ? "" : "future"}" data-act="tOpen" data-v="${t.id}">
          <span class="tdate">${esc(fmtDate(t.date))}${t.time ? ` · ${esc(t.time)}` : ""} · ${esc(t.title)}</span>
          <span class="small">${LZ.calendar ? LZ.calendar.chip(t.kind) + " " : ""}${t.note ? esc(t.note) + " · " : ""}${t.state === 2 ? "fällt aus" : `${t.present} ${t.expected ? "erwartet" : "da"}`}${t.absent && t.state !== 2 ? ` · ${t.absent} abgesagt` : ""}${t.avgLaune !== null ? ` · Laune Ø ${String(t.avgLaune).replace(".", ",")}` : ""}${t.avgRpe !== null ? ` · Belastung Ø ${String(t.avgRpe).replace(".", ",")}` : ""}</span>
          ${t.alerts ? `<span class="tbadge">${t.alerts} ansprechen</span>` : ""}</button>`).join("") : `<p class="small">Noch keine Trainings angelegt.</p>`}</section>`;
    }

    if (s === "training") {
      const d = T.tr; if (!d) return `${tabs()}<p class="small">Lade …</p>`;
      const t = d.training, pres = new Set(d.present), moods = Object.fromEntries(d.moods.map(m => [m.nr, m]));
      const abs = Object.fromEntries((d.absences || []).map(a => [a.nr, a]));
      const alert = m => m.vor && (m.vor.nichtfit || (m.vor.laune || 5) <= 2);
      const sorted = d.moods.slice().sort((a, b) => (alert(b) ? 1 : 0) - (alert(a) ? 1 : 0));
      return `<button class="back" data-act="ctab" data-v="trainings">‹ Trainings</button>${tabs()}
      <section><p class="eyebrow">${LZ.calendar ? esc(LZ.calendar.kindLabel(t.kind)) : "Training"}${t.fromCalendar ? " · aus dem Kalender" : ""}</p><h1>${esc(t.title)}</h1>
        <p class="lede">${esc(fmtDate(t.date))}${t.time ? " · " + esc(t.time) + (t.endTime ? "–" + esc(t.endTime) : "") : ""}${t.location ? " · " + (LZ.mapLink ? LZ.mapLink(t.location) : esc(t.location)) : ""}${t.note ? " · " + esc(t.note) : ""}</p></section>
      ${(d.coachesOut || []).length ? `<p class="alert">Trainer nicht dabei: ${d.coachesOut.map(esc).join(", ")}</p>` : ""}
      ${t.kind !== "training" ? "" : t.state === 2 ? `<section class="card stack"><div class="rowspread"><h2>Fällt aus</h2></div>
        <p class="small">Dieses Training zählt nicht für die Trainingsbeteiligung. Die Spieler sehen „fällt aus“.</p>
        <div class="row"><button class="btn" data-act="tReopen">Findet doch statt</button></div></section>` : `
      <section class="card stack"><div class="rowspread"><h2>${t.expected ? "Erwartet" : "Anwesenheit"}</h2><span class="bignum">${pres.size}</span></div>
        <p class="small">${t.expected ? "Alle, die nicht abgesagt haben, gelten als da – nach dem Training wird das automatisch eingetragen. Tippe auf ein Trikot, wenn jemand ohne Absage fehlt." : "Tippe auf ein Trikot, um „da“ oder „nicht da“ zu setzen."}</p>
        <div class="row"><button class="btn ghost" data-act="tAll" data-v="1">Alle ohne Absage da</button><button class="btn ghost" data-act="tCancelAsk">Training fällt aus</button></div>
        ${T.confirm === "tCancel" ? `<div class="card stack danger"><p><b>Training als ausgefallen markieren?</b> Es zählt dann nicht für die Beteiligung.</p>
          <div class="row"><button class="btn danger-btn" data-act="tCancel">Ja, fällt aus</button><button class="btn ghost" data-act="cCancel">Abbrechen</button></div></div>` : ""}
        <div class="nrgrid">${LZ.C.players.map(p => { const m = moods[p.nr]; return `<button class="nr ${pres.has(p.nr) ? "" : "absent"}" data-act="tAtt" data-v="${p.nr}" aria-pressed="${pres.has(p.nr)}" aria-label="Nummer ${p.nr} ${pres.has(p.nr) ? "da" : "nicht da"}">${LZ.shirt(p.nr)}<span>${abs[p.nr] && !pres.has(p.nr) ? `<em class="abstag">abgesagt</em>` : `${m && m.vor ? LAUNE[(m.vor.laune || 3) - 1] : "&nbsp;"}${m && m.nach ? " " + m.nach.rpe : ""}`}</span></button>`; }).join("")}</div>
        ${(d.absences || []).length ? `<div class="abslist"><b>Abgesagt (${d.absences.length})</b>${d.absences.map(a => `<span>Nr. ${a.nr} · ${esc(a.label)}</span>`).join("")}</div>` : ""}</section>`}
      ${t.kind === "training" && t.state !== 2 ? gradeSection(d, pres) : ""}
      <section class="card stack"><h2>Befinden</h2>${sorted.length ? sorted.map(m => { const p = LZ.C.players.find(x => x.nr === m.nr) || {}; return `
        <div class="moodrow ${alert(m) ? "hot" : ""}"><b>Nr. ${m.nr}${p.name ? " · " + esc(p.name.split(" ")[0]) : ""}</b><span>${moodLine(m.vor, m.nach) || "–"}</span>${comments(m.vor, m.nach)}</div>`; }).join("") : `<p class="small">Noch keine Rückmeldungen. Die Spieler sehen die Abfrage am Trainingstag in „Mein Bereich“.</p>`}</section>
      ${errP()}
      ${t.fromCalendar ? `<p class="small">Dieser Termin kommt aus dem Google-Kalender. Ändern oder absagen bitte dort – die Lernzone übernimmt das automatisch.</p>`
        : T.confirm === "delTraining" ? `<section class="card stack danger"><p><b>Training wirklich löschen?</b> Anwesenheit und Rückmeldungen dazu werden entfernt.</p>
        <div class="row"><button class="btn danger-btn" data-act="tDelete">Ja, löschen</button><button class="btn ghost" data-act="cCancel">Abbrechen</button></div></section>`
        : `<button class="btn ghost wide danger-text" data-act="cAskDel" data-v="delTraining">Training löschen</button>`}`;
    }

    if (s === "coaches") {
      const me = Co();
      const list = me.isAdmin ? T.coaches : T.coaches.filter(c => c.id === me.id);
      return `${backGrid}<section><p class="eyebrow">Trainer-Bereich</p><h1>${me.isAdmin ? "Trainer" : "Mein Konto"}</h1>${me.isAdmin ? `<p class="lede">Cheftrainer legen Co-Trainer an und dürfen Spieler löschen. Neue Mannschaften legt der Vereinsadmin an.</p>` : ""}</section>${tabs()}
      <section class="stack">${list.map(c => `<button class="trow" data-act="cEdit" data-v="${c.id}"><span class="tdate">${esc(c.name)}${c.id === me.id ? " (du)" : ""}</span><span class="small">${esc(c.username || "")}</span>${c.isAdmin ? `<span class="badge">Cheftrainer</span>` : ""}</button>`).join("")}</section>
      ${me.isAdmin ? `<section class="card stack"><h2>Trainer hinzufügen</h2>
        <div class="fld"><label for="cf-name">Vorname</label><input id="cf-name" maxlength="30" value="${esc(T.cf.name)}"></div>
        ${userField("cf-user", "Benutzername", T.cf.user, "Leer lassen = Vorname.")}
        <label class="check"><input type="checkbox" id="cf-admin" ${T.cf.isAdmin ? "checked" : ""}> Cheftrainer</label>
        ${errP()}${okP()}<button class="btn wide" data-act="coachAdd" ${T.busy ? "disabled" : ""}>Trainer hinzufügen</button></section>
      ${calCard()}${seasonCard()}` : ""}`;
    }

    if (s === "coachEdit") {
      const c = T.cEdit, me = Co(), self = c.id === me.id;
      return `<button class="back" data-act="ctab" data-v="coaches">‹ ${me.isAdmin ? "Trainer" : "Mein Konto"}</button>${tabs()}
      <section><p class="eyebrow">${self ? "Mein Konto" : "Trainer"}</p><h1>${esc(c.name)}</h1></section>
      <section class="card stack">
        <div class="fld"><label for="ce-name">Vorname</label><input id="ce-name" maxlength="30" value="${esc(T.cf.name)}"></div>
        ${userField("ce-user", "Benutzername", T.cf.user)}
        ${me.isAdmin ? `<label class="check"><input type="checkbox" id="ce-admin" ${T.cf.isAdmin ? "checked" : ""}> Cheftrainer</label>` : ""}
        ${errP()}${okP()}<button class="btn wide" data-act="coachSave" ${T.busy ? "disabled" : ""}>Speichern</button></section>
      ${self ? `<button class="btn ghost wide" data-act="pwStart">Mein Passwort ändern</button>`
        : me.isAdmin ? `<section class="card stack"><h2>Zugang</h2><button class="btn wide" data-act="coachCode">Neuen Einmal-Code erzeugen</button>
        <p class="small">Falls das Passwort vergessen wurde. Das alte Passwort gilt danach nicht mehr.</p></section>` : ""}
      ${me.isAdmin && !self ? (T.confirm === "delCoach"
        ? `<section class="card stack danger"><p><b>${esc(c.name)} wirklich entfernen?</b> Das Konto kann sich danach nicht mehr anmelden.</p>
           <div class="row"><button class="btn danger-btn" data-act="coachDelete">Ja, entfernen</button><button class="btn ghost" data-act="cCancel">Abbrechen</button></div></section>`
        : `<button class="btn ghost wide danger-text" data-act="cAskDel" data-v="delCoach">Trainer entfernen</button>`) : ""}`;
    }
    return "";
  };

  /* ---------- Kader / Spieler ---------- */
  async function openPlayer(nr) {
    show("player", { editNr: nr, detail: null });
    const [r, ie, gr] = await Promise.all([St().get("players.php?nr=" + nr), St().get("iep.php?nr=" + nr), St().get("grades.php?nr=" + nr)]);
    if (!r.ok) return fail(r);
    r.iep = ie && ie.ok ? ie : { iep: null, ratings: [], versions: [] };
    r.grades = gr && gr.ok ? gr : null;
    T.iepOld = null;
    T.detail = r; T.posOff = r.player.posOff; T.posDef = r.player.posDef; T.uname = r.username || ""; LZ.render();
  }
  LZ.actions.cPlayer = (b, v) => openPlayer(+v);

  /* ---------- Individueller Entwicklungsplan (IEP) ---------- */
  const IEP_AREAS = [["ind", "Individuelles Ziel"], ["tech", "Technik"], ["phys", "Physis"], ["off", "Offensiv"], ["def", "Defensiv"]];
  const IEP_COACH = [["strengths", "Stärken"], ["field", "Hauptentwicklungsfeld"], ["psych", "Psychologische Einschätzung"], ["talkDate", "Gespräch am"], ["status", "Status"],
    ["feedback", "Trainer-Feedback"], ["learn", "Konkretes Lernziel"], ["mental", "Mentalität & Sozial"], ["clusters", "Gruppe (eine pro Zeile)"], ["measures", "Trainingshinweise"], ["observe", "Beobachtungspunkte"]];
  function gradeSummary(d) {
    const g = d.grades; if (!g) return "";
    const f = v => v == null ? "–" : String(v).replace(".", ",");
    return `<section class="card stack"><h2>Bewertung im Training</h2><p class="small">Nur für Trainer · Schulnoten, Ø aller Trainer</p>
      ${g.list.length ? `<table class="ieptable gradetable"><tr><th></th>${GRADE_AREAS.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
        <tr><td>Ø 4 Wochen</td>${GRADE_AREAS.map(([k]) => `<td class="${gradeTone(g.avg4[k])}">${f(g.avg4[k])}</td>`).join("")}</tr>
        <tr><td>Ø Saison</td>${GRADE_AREAS.map(([k]) => `<td class="${gradeTone(g.season[k])}">${f(g.season[k])}</td>`).join("")}</tr>
        ${g.list.slice(0, 6).map(r => `<tr><td>${esc(fmtDate(r.date))}</td>${GRADE_AREAS.map(([k]) => `<td>${f(r.values[k])}</td>`).join("")}</tr>`).join("")}</table>`
        : `<p class="small">Noch keine Noten. Bewerten im Training unter „Bewertung“.</p>`}</section>`;
  }
  function iepSection(d) {
    const x = d.iep || {}, old = T.iepOld, i = old ? old.iep : x.iep, vs = x.versions || [];
    if (!i) return `<section class="card stack"><div class="rowspread"><h2>Entwicklungsplan</h2><button class="linkbtn" data-act="iepEdit">Anlegen</button></div><p class="small">Noch kein IEP.</p></section>`;
    const g = i.goals || {}, p = i.plan || {}, c = i.coach || {};
    const rat = x.ratings || [];
    const avg = k => { const v = rat.map(r => r.values[k]).filter(Boolean); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).replace(".", ",") : "–"; };
    const vtxt = v => `${v.season || "ohne Bezeichnung"} · ${fmtDate(v.date)}${v.by ? " · " + v.by : ""}`;
    return `<section class="card stack"><div class="rowspread"><h2>Entwicklungsplan</h2>${old ? `<button class="linkbtn" data-act="iepCur">Zum aktuellen Stand</button>` : `<button class="linkbtn" data-act="iepEdit">Neuer Stand</button>`}</div>
      ${old ? `<p class="alert">Früherer Stand: ${esc(vtxt(old.v))} – nur zum Ansehen.</p>` : vs[0] ? `<p class="small">Aktueller Stand: ${esc(vtxt(vs[0]))}</p>` : ""}
      ${vs.length > 1 ? `<div class="vlist"><span class="small">Frühere Stände:</span>${vs.slice(1).map(v => `<button class="linkbtn" data-act="iepOld" data-v="${v.id}">${esc(vtxt(v))}</button>`).join("")}</div>` : ""}
      ${IEP_AREAS.filter(([k]) => (g[k] || []).length).map(([k, l]) => `<div class="goalarea"><b>${l}</b><ul>${g[k].map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
      ${["short", "mid", "long"].some(k => p[k]) ? `<div class="goalarea"><b>Zeitplan</b><ul>${[["short", "Kurz"], ["mid", "Mittel"], ["long", "Lang"]].filter(([k]) => p[k]).map(([k, l]) => `<li><b>${l}:</b> ${esc(p[k])}</li>`).join("")}</ul></div>` : ""}
      <div class="iepcoach"><b>Nur für Trainer</b><dl>${IEP_COACH.map(([k, l]) => [l.replace(" (eine pro Zeile)", ""), k === "clusters" ? (c.clusters || []).join(", ") : c[k]]).filter(r => r[1]).map(([l, v]) => `<dt>${l}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>
      ${old ? `<button class="btn ghost danger-text" data-act="iepDelAsk">Diesen Stand löschen</button>${T.confirm === "iepDel" ? `<div class="card stack danger"><p><b>Stand wirklich löschen?</b></p><div class="row"><button class="btn danger-btn" data-act="iepDel">Ja, löschen</button><button class="btn ghost" data-act="cCancel">Abbrechen</button></div></div>` : ""}` : ""}
      <div class="goalarea"><b>Selbsteinschätzung nach Spielen</b>${rat.length ? `<table class="ieptable"><tr><th>Spiel</th>${IEP_AREAS.map(([, l]) => `<th>${l.slice(0, 4)}.</th>`).join("")}</tr>
        ${rat.slice(0, 8).map(r => `<tr><td>${esc(fmtDate(r.date))}</td>${IEP_AREAS.map(([k]) => `<td>${r.values[k] || "–"}</td>`).join("")}</tr>`).join("")}
        <tr><th>Ø</th>${IEP_AREAS.map(([k]) => `<th>${avg(k)}</th>`).join("")}</tr></table>` : `<p class="small">Noch keine. Spieler bewerten sich bis 3 Tage nach einem Spiel (1–5) – nach Einwilligung der Eltern.</p>`}</div></section>`;
  }
  LZ.actions.iepOld = async (b, v) => {
    const r = await St().get("iep.php?version=" + v);
    if (!r.ok) return fail(r);
    T.iepOld = { iep: r.iep, v: T.detail.iep.versions.find(x => x.id === +v), id: +v }; T.confirm = null; LZ.render();
  };
  LZ.actions.iepCur = () => { T.iepOld = null; T.confirm = null; LZ.render(); };
  LZ.actions.iepDelAsk = () => { T.confirm = "iepDel"; LZ.render(); };
  LZ.actions.iepDel = async () => {
    const r = await St().send("iep.php", { action: "delete", id: T.iepOld.id });
    if (!r.ok) return fail(r);
    openPlayer(T.editNr);
  };
  LZ.actions.iepEdit = () => {
    const i = (T.detail.iep && T.detail.iep.iep) || {};
    show("iepEdit", { iepE: { season: i.season || "", goals: Object.assign({}, i.goals || {}), plan: Object.assign({ short: "", mid: "", long: "" }, i.plan || {}), coach: Object.assign({}, i.coach || {}) } });
  };
  LZ.actions.iepSave = async () => {
    const e = T.iepE, val = id => (document.getElementById(id) || {}).value || "", lines = s => s.split("\n").map(x => x.trim().replace(/^[•\-–]\s*/, "")).filter(Boolean);
    const data = { season: val("iep-season").trim(), goals: {}, plan: {}, coach: {} };
    IEP_AREAS.forEach(([k]) => { data.goals[k] = lines(val("iep-g-" + k)); });
    ["short", "mid", "long"].forEach(k => { data.plan[k] = val("iep-p-" + k).trim(); });
    IEP_COACH.forEach(([k]) => { data.coach[k] = k === "clusters" ? lines(val("iep-c-" + k)) : val("iep-c-" + k).trim(); });
    T.busy = true; LZ.render();
    const r = await St().send("iep.php", { action: "save", nr: T.editNr, data });
    T.busy = false;
    if (!r.ok) { Object.assign(e, data); return fail(r); }
    openPlayer(T.editNr);
  };
  LZ.actions.cAdd = () => show("form", { type: "feld", nr: "", uname: "", posOff: "", posDef: "", created: null });
  LZ.actions.cType = (b, v) => {
    T.type = v;
    if (v === "tw" && !T.posOff && !T.posDef) { T.posOff = "TW"; T.posDef = "TW"; }
    if (v === "feld" && T.posOff === "TW" && T.posDef === "TW") { T.posOff = ""; T.posDef = ""; }
    LZ.render();
  };
  LZ.actions.cAddSave = async () => {
    const nr = T.nr.trim();
    if (!/^\d{1,2}$/.test(nr) || +nr < 1) { T.err = "Bitte eine Trikotnummer von 1 bis 99 eingeben."; LZ.render(); return; }
    if (LZ.C.players.some(p => p.nr === +nr)) { T.err = `Die Nummer ${+nr} ist schon vergeben.`; LZ.render(); return; }
    T.busy = true; T.err = ""; LZ.render();
    const r = await St().send("players.php", { nr: +nr, type: T.type, username: T.uname.trim(), posOff: T.posOff, posDef: T.posDef });
    if (!r.ok) return fail(r);
    T.busy = false; await refreshPlayers();
    show("code", { code: { nr: r.player.nr, heading: `Nr. ${r.player.nr} angelegt`, title: "Zugangsdaten", username: r.username, code: r.code, expires: r.expires,
      buttons: `<button class="btn wide" data-act="cAdd">Weiteren Spieler anlegen</button><button class="btn ghost wide" data-act="ctab" data-v="kader">Zum Kader</button>` } });
  };
  LZ.actions.cPosSave = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("players.php", { action: "setpos", nr: T.editNr, posOff: T.posOff, posDef: T.posDef });
    if (!r.ok) return fail(r);
    T.busy = false; T.detail.player = r.player; T.msg = "Positionen gespeichert."; T.err = "";
    if (LZ.S.user && LZ.S.user.nr === T.editNr) Object.assign(LZ.S.user, { posOff: r.player.posOff, posDef: r.player.posDef });
    await refreshPlayers(); LZ.render();
  };
  LZ.actions.cCode = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("accounts.php", { action: "code", kind: "player", ref: T.editNr });
    if (!r.ok) return fail(r);
    T.busy = false;
    show("code", { code: { nr: T.editNr, heading: `Nr. ${T.editNr}`, title: "Neue Zugangsdaten", username: r.username, code: r.code, expires: r.expires,
      buttons: `<button class="btn wide" data-act="cPlayer" data-v="${T.editNr}">Zurück zum Spieler</button>` } });
  };
  LZ.actions.cUserSave = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("accounts.php", { action: "rename", kind: "player", ref: T.editNr, username: T.uname });
    if (!r.ok) return fail(r);
    T.busy = false; T.uname = r.username; T.detail.username = r.username; T.err = ""; T.msg = "Benutzername gespeichert."; LZ.render();
  };
  LZ.actions.cAskDel = (b, v) => { T.confirm = v; LZ.render(); };
  LZ.actions.cCancel = () => { T.confirm = null; LZ.render(); };
  LZ.actions.cDelPlayer = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("players.php", { action: "delete", nr: T.editNr });
    if (!r.ok) return fail(r);
    T.busy = false; await open("kader");
  };
  async function setConsent(on) {
    const r = await St().send("players.php", { action: "setconsent", nr: T.editNr, consent: on });
    if (!r.ok) return fail(r);
    T.detail.player = r.player; T.msg = on ? "Einwilligung gespeichert – Profil und Barometer sind frei." : "Freischaltung zurückgenommen."; T.err = "";
    if (LZ.S.user && LZ.S.user.nr === T.editNr) LZ.S.user.consent = on;
    LZ.render();
  }

  /* ---------- Trainings ---------- */
  async function openTrainings() {
    T.newT = T.newT || { date: todayIso(), time: "", note: "" };
    show("trainings", { trainings: null });
    const r = await St().get("trainings.php");
    if (!Array.isArray(r)) return fail(r);
    T.trainings = r; LZ.render();
  }
  async function openTraining(id) {
    show("training", { tr: null });
    const [r, g] = await Promise.all([St().get("trainings.php?id=" + id), St().get("grades.php?training=" + id), refreshPlayers()]);
    if (!r.ok) return fail(r);
    r.grades = g && g.ok ? g : { mine: {}, others: {}, count: {} };
    T.tr = r; LZ.render();
  }
  LZ.actions.tCreate = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("trainings.php", Object.assign({ action: "create" }, T.newT));
    if (!r.ok) return fail(r);
    T.busy = false; T.newT = { date: T.newT.date, time: T.newT.time, note: "" };
    openTraining(r.id);
  };
  LZ.actions.tOpen = (b, v) => openTraining(+v);
  /* ---------- Bewertung nach dem Training: Schulnoten 1–6, jeder Trainer einzeln, nur Trainer ---------- */
  const GRADE_AREAS = [["verhalten", "Verhalten"], ["umsetzung", "Umsetzung"], ["einstellung", "Einstellung"], ["soziales", "Soziales"]];
  const gradeTone = v => v == null ? "" : v <= 2 ? "g-good" : v <= 3.5 ? "g-mid" : "g-low";
  function gradeSection(d, pres) {
    const G = d.grades, list = LZ.C.players.filter(p => pres.has(p.nr));
    const done = list.filter(p => G.mine[p.nr] && Object.keys(G.mine[p.nr]).length === 4).length;
    return `<section class="card stack"><div class="rowspread"><h2>Bewertung</h2><span class="small">${done}/${list.length} bewertet</span></div>
      <p class="small">Nur für Trainer · Schulnoten 1 (sehr gut) bis 6 · jeder Trainer bewertet für sich. Vorgabe ist 1 – sobald du eine Note änderst, gilt für alle anderen Anwesenden die 1. In Klammern: Ø der anderen Trainer.</p>
      ${list.length ? `<div class="gradegrid"><span></span>${GRADE_AREAS.map(([, l]) => `<b>${l}</b>`).join("")}
        ${list.map(p => { const m = G.mine[p.nr] || {}, o = G.others[p.nr] || {};
          return `<span class="gnr">${LZ.shirt(p.nr)}</span>${GRADE_AREAS.map(([k, l]) => `<label class="gcell"><select id="gr-${p.nr}-${k}" class="${gradeTone(m[k] ?? 1)}" aria-label="Nr. ${p.nr} ${l}">
            ${[1, 2, 3, 4, 5, 6].map(v => `<option value="${v}" ${(m[k] ?? 1) === v ? "selected" : ""}>${v}</option>`).join("")}</select>
            ${o[k] != null ? `<span class="small">(${String(o[k]).replace(".", ",")})</span>` : ""}</label>`).join("")}`; }).join("")}</div>`
        : `<p class="small">Niemand als „da“ eingetragen.</p>`}</section>`;
  }
  async function setGrade(nr, area, value) {
    const G = T.tr.grades, present = [...new Set(T.tr.present)];
    // Vorgabe 1: beim ersten Eintrag bekommen alle Anwesenden ohne eigene Note eine 1 (Server und Anzeige)
    present.forEach(n => { G.mine[n] = G.mine[n] || {}; GRADE_AREAS.forEach(([k]) => { if (G.mine[n][k] == null) G.mine[n][k] = 1; }); });
    G.mine[nr] = G.mine[nr] || {}; G.mine[nr][area] = value || 1;
    const r = await St().send("grades.php", { action: "set", id: T.tr.training.id, nr, area, value: value || 1, fill: present });
    if (!r.ok) return fail(r);
    LZ.render();
  }
  const trState = r => { T.tr.present = r.present; T.tr.training.state = r.state; T.tr.training.expected = false; T.confirm = null; LZ.render(); };
  LZ.actions.tAll = async (b, v) => {
    const r = await St().send("trainings.php", { action: "attendall", id: T.tr.training.id, present: v === "1" });
    if (!r.ok) return fail(r);
    trState(r);
  };
  LZ.actions.tCancelAsk = () => { T.confirm = "tCancel"; LZ.render(); };
  LZ.actions.tCancel = async () => {
    const r = await St().send("trainings.php", { action: "cancel", id: T.tr.training.id });
    if (!r.ok) return fail(r);
    trState(r);
  };
  LZ.actions.tReopen = async () => {
    const r = await St().send("trainings.php", { action: "reopen", id: T.tr.training.id });
    if (!r.ok) return fail(r);
    trState(r); T.tr.training.expected = true; LZ.render();
  };
  LZ.actions.tAtt = async (b, v) => {
    const nr = +v, set = new Set(T.tr.present), on = !set.has(nr);
    on ? set.add(nr) : set.delete(nr); T.tr.present = [...set];
    if (on && T.tr.absences) T.tr.absences = T.tr.absences.filter(a => a.nr !== nr);   // doch gekommen
    LZ.render();     // sofort anzeigen
    const r = await St().send("trainings.php", { action: "attend", id: T.tr.training.id, nr, present: on });
    if (!r.ok) { on ? set.delete(nr) : set.add(nr); T.tr.present = [...set]; return fail(r); }
    trState(r);
  };
  LZ.actions.tDelete = async () => {
    const r = await St().send("trainings.php", { action: "delete", id: T.tr.training.id });
    if (!r.ok) return fail(r);
    openTrainings();
  };

  /* ---------- Google-Kalender (Admin) ---------- */
  function calCard() {
    const c = T.cal;
    if (!c) return `<section class="card stack"><h2>Google-Kalender</h2><p class="small">Lade …</p></section>`;
    return `<section class="card stack"><h2>Google-Kalender</h2>
      <p class="small">${c.url ? `Verbunden${c.synced ? ` · zuletzt gelesen ${esc(c.synced)}` : ""}${c.count ? ` · ${c.count} Termine im Zeitraum` : ""}` : "Noch kein Kalender verbunden."}</p>
      ${c.error ? `<p class="alert">${esc(c.error)}</p>` : ""}
      <div class="fld"><label for="cal-url">Einbettungs-Link, iframe-Code oder iCal-Adresse</label>
        <textarea id="cal-url" rows="3" spellcheck="false" placeholder="https://calendar.google.com/calendar/embed?src=…">${esc(T.calInput ?? c.url ?? "")}</textarea></div>
      <p class="small">Alle Termine der letzten 30 und nächsten 60 Tage werden automatisch angelegt und alle 15 Minuten abgeglichen. Die Art (Training, Spiel, Turnier, Termin) erkennt die App am Titel.</p>
      <div class="row"><button class="btn" data-act="calSave" ${T.busy ? "disabled" : ""}>Speichern</button>${c.url ? `<button class="btn ghost" data-act="calRefresh" ${T.busy ? "disabled" : ""}>Jetzt aktualisieren</button>` : ""}</div></section>`;
  }
  function seasonCard() {
    const c = T.cal; if (!c) return "";
    const f = d => d ? d.split("-").reverse().join(".") : "";
    return `<section class="card stack"><h2>Saison</h2>
      <p class="small">Die Trainingsbeteiligung zählt ab diesem Tag${c.season ? ` (aktuell ab ${esc(f(c.season))})` : " (noch nicht gesetzt: alle Trainings zählen)"}. Spieler, die später dazukommen, zählen ab dem Tag, an dem ihr Konto angelegt wurde.</p>
      <div class="fld"><label for="cal-season">Saisonbeginn</label><input id="cal-season" type="date" value="${esc(T.seasonInput ?? c.season ?? "")}"></div>
      <div class="row"><button class="btn" data-act="seasonSave" ${T.busy ? "disabled" : ""}>Speichern</button></div></section>`;
  }
  LZ.actions.seasonSave = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("calendar.php", { action: "season", date: T.seasonInput ?? (T.cal && T.cal.season) ?? "" });
    T.busy = false;
    if (!r.ok) return fail(r);
    T.cal = r.status; T.seasonInput = null; T.err = ""; T.msg = "Saisonbeginn gespeichert."; LZ.render();
  };
  async function loadCal() {
    const r = await St().get("calendar.php");
    if (r && r.ok) { T.cal = r.status; T.calInput = null; if (T.step === "coaches") LZ.render(); }
  }
  LZ.actions.calSave = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("calendar.php", { action: "seturl", url: T.calInput ?? (T.cal && T.cal.url) ?? "" });
    T.busy = false;
    if (!r.ok) return fail(r);
    T.cal = r.status; T.calInput = null; T.err = ""; T.msg = r.status.error ? "" : (r.status.url ? "Kalender verbunden." : "Kalender getrennt.");
    if (LZ.calendar) LZ.calendar.reload();
    LZ.render();
  };
  LZ.actions.calRefresh = async () => {
    T.busy = true; LZ.render();
    const r = await St().send("calendar.php", { action: "refresh" });
    T.busy = false;
    if (!r.ok) return fail(r);
    T.cal = r.status; if (LZ.calendar) LZ.calendar.reload(); LZ.render();
  };

  /* ---------- Trainer-Konten ---------- */
  LZ.actions.cEdit = (b, v) => { const c = T.coaches.find(x => x.id === +v); show("coachEdit", { cEdit: c, cf: { name: c.name, user: c.username || "", isAdmin: !!c.isAdmin } }); };
  LZ.actions.coachAdd = async () => {
    const { name, user, isAdmin } = T.cf;
    if (!name.trim()) { T.err = "Bitte einen Vornamen eingeben."; LZ.render(); return; }
    T.busy = true; LZ.render();
    const r = await St().send("coaches.php", { action: "add", name, username: user.trim(), isAdmin });
    if (!r.ok) return fail(r);
    T.busy = false; T.cf = { name: "", user: "", isAdmin: false };
    show("code", { code: { heading: `${r.coach.name} angelegt`, title: "Zugangsdaten", username: r.username, code: r.code, expires: r.expires,
      buttons: `<button class="btn wide" data-act="ctab" data-v="coaches">Zu den Trainern</button>` } });
    loadCoaches();
  };
  LZ.actions.coachSave = async () => {
    const c = T.cEdit, body = { action: "update", id: c.id, name: T.cf.name };
    if (Co().isAdmin) body.isAdmin = T.cf.isAdmin;
    T.busy = true; LZ.render();
    const r = await St().send("coaches.php", body);
    if (!r.ok) return fail(r);
    if (T.cf.user.trim() && T.cf.user.trim() !== (c.username || "")) {
      const u = await St().send("accounts.php", { action: "rename", kind: "coach", ref: c.id, username: T.cf.user.trim() });
      if (!u.ok) return fail(u);
      T.cf.user = u.username; r.coach.username = u.username;
    } else r.coach.username = c.username;
    T.busy = false; T.cEdit = r.coach; T.err = ""; T.msg = "Gespeichert.";
    await loadCoaches();
  };
  LZ.actions.coachCode = async () => {
    const c = T.cEdit;
    const r = await St().send("accounts.php", { action: "code", kind: "coach", ref: c.id });
    if (!r.ok) return fail(r);
    show("code", { code: { heading: c.name, title: "Neue Zugangsdaten", username: r.username, code: r.code, expires: r.expires,
      buttons: `<button class="btn wide" data-act="ctab" data-v="coaches">Zu den Trainern</button>` } });
  };
  LZ.actions.coachDelete = async () => {
    const r = await St().send("coaches.php", { action: "delete", id: T.cEdit.id });
    if (!r.ok) return fail(r);
    open("coaches");
  };

  /* ---------- Eingaben ---------- */
  LZ.inputs.push(e => {
    const el = e.target, id = el.id;
    const digits = n => { el.value = el.value.replace(/\D/g, "").slice(0, n); return el.value; };
    if (id === "c-nr") {
      T.nr = digits(2);
      document.querySelectorAll(".typebtn").forEach(btn => { const t = btn.querySelector("text"); if (t) t.textContent = T.nr || (btn.dataset.v === "tw" ? "TW" : "?"); });
    }
    else if (id === "c-uname" || id === "c-newuser") T.uname = el.value;
    else if (id === "pos-off" && LZ.S.view === "coach") { T.posOff = el.value; T.msg = ""; }
    else if (id === "pos-def" && LZ.S.view === "coach") { T.posDef = el.value; T.msg = ""; }
    else if (id === "c-consent" && e.type === "change") setConsent(el.checked);
    else if (id === "cal-url") T.calInput = el.value;
    else if (id === "cal-season") T.seasonInput = el.value;
    else if (id.startsWith("gr-") && e.type === "change") { const [, nr, area] = id.split("-"); setGrade(+nr, area, +el.value || null); }
    else if (id === "t-date") T.newT.date = el.value;
    else if (id === "t-time") T.newT.time = el.value;
    else if (id === "t-note") T.newT.note = el.value;
    else if (id === "cf-name" || id === "ce-name") T.cf.name = el.value;
    else if (id === "cf-user" || id === "ce-user") T.cf.user = el.value;
    else if ((id === "cf-admin" || id === "ce-admin") && e.type === "change") T.cf.isAdmin = el.checked;
  });
})();
