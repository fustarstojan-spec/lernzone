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
    if (target === "coaches") { show("coaches"); await loadCoaches(); return; }
  }
  LZ.actions.addStart = () => start("form");
  LZ.actions.kaderStart = () => start("kader");

  /* ---------- Kopf mit Reitern ---------- */
  const tabs = () => Co().active ? `
    <div class="coachbar"><span>Trainer: <b>${esc(Co().name || "")}</b>${Co().isAdmin ? ` <span class="badge">Admin</span>` : ""}</span><span class="coachbar-links"><button class="linkbtn" data-act="pwStart">Passwort ändern</button><button class="linkbtn" data-act="logout">Abmelden</button></span></div>
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
        <label class="check"><input type="checkbox" id="c-consent" ${p.consent ? "checked" : ""}> Liegt vor – Profil und Befindens-Barometer sind freigeschaltet</label></section>
      <section class="card stack"><h2>Profil</h2>${rows.length ? `<dl class="sub">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : `<p class="small">${p.consent ? "Der Spieler hat noch nichts eingetragen." : "Wird nach der Einwilligung freigeschaltet."}</p>`}</section>
      <section class="card stack"><h2>Trainingsbeteiligung</h2>${attLine(d.attendance)}</section>
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
      return `${backGrid}<section><p class="eyebrow">Trainer-Bereich</p><h1>Trainings</h1><p class="lede">Lege jedes Training an. Dann siehst du, wer da war und wie es den Spielern geht.</p></section>${tabs()}
      <section class="card stack"><h2>Training anlegen</h2>
        <div class="grid2"><div class="fld"><label for="t-date">Datum</label><input type="date" id="t-date" value="${esc(n.date)}"></div>
        <div class="fld"><label for="t-time">Uhrzeit</label><input type="time" id="t-time" value="${esc(n.time)}"></div></div>
        <div class="fld"><label for="t-note">Notiz (freiwillig)</label><input id="t-note" maxlength="80" placeholder="z. B. Kunstrasen, Schwerpunkt Pressing" value="${esc(n.note)}"></div>
        ${errP()}<button class="btn wide" data-act="tCreate" ${T.busy ? "disabled" : ""}>Training anlegen</button></section>
      <section class="stack">${T.trainings === null ? `<p class="small">Lade …</p>` : T.trainings.length ? T.trainings.map(t => `
        <button class="trow" data-act="tOpen" data-v="${t.id}">
          <span class="tdate">${esc(fmtDate(t.date))}${t.time ? ` · ${esc(t.time)}` : ""}</span>
          <span class="small">${t.note ? esc(t.note) + " · " : ""}${t.present} da${t.avgLaune !== null ? ` · Laune Ø ${String(t.avgLaune).replace(".", ",")}` : ""}${t.avgRpe !== null ? ` · Belastung Ø ${String(t.avgRpe).replace(".", ",")}` : ""}</span>
          ${t.alerts ? `<span class="tbadge">${t.alerts} ansprechen</span>` : ""}</button>`).join("") : `<p class="small">Noch keine Trainings angelegt.</p>`}</section>`;
    }

    if (s === "training") {
      const d = T.tr; if (!d) return `${tabs()}<p class="small">Lade …</p>`;
      const t = d.training, pres = new Set(d.present), moods = Object.fromEntries(d.moods.map(m => [m.nr, m]));
      const alert = m => m.vor && (m.vor.nichtfit || (m.vor.laune || 5) <= 2);
      const sorted = d.moods.slice().sort((a, b) => (alert(b) ? 1 : 0) - (alert(a) ? 1 : 0));
      return `<button class="back" data-act="ctab" data-v="trainings">‹ Trainings</button>${tabs()}
      <section><p class="eyebrow">Training</p><h1>${esc(fmtDate(t.date))}${t.time ? " · " + esc(t.time) : ""}</h1>${t.note ? `<p class="lede">${esc(t.note)}</p>` : ""}</section>
      <section class="card stack"><div class="rowspread"><h2>Anwesenheit</h2><span class="bignum">${pres.size}</span></div>
        <p class="small">Tippe auf ein Trikot, um „da“ oder „nicht da“ zu setzen.</p>
        <div class="nrgrid">${LZ.C.players.map(p => { const m = moods[p.nr]; return `<button class="nr ${pres.has(p.nr) ? "" : "absent"}" data-act="tAtt" data-v="${p.nr}" aria-pressed="${pres.has(p.nr)}" aria-label="Nummer ${p.nr} ${pres.has(p.nr) ? "da" : "nicht da"}">${LZ.shirt(p.nr)}<span>${m && m.vor ? LAUNE[(m.vor.laune || 3) - 1] : "&nbsp;"}${m && m.nach ? " " + m.nach.rpe : ""}</span></button>`; }).join("")}</div></section>
      <section class="card stack"><h2>Befinden</h2>${sorted.length ? sorted.map(m => { const p = LZ.C.players.find(x => x.nr === m.nr) || {}; return `
        <div class="moodrow ${alert(m) ? "hot" : ""}"><b>Nr. ${m.nr}${p.name ? " · " + esc(p.name.split(" ")[0]) : ""}</b><span>${moodLine(m.vor, m.nach) || "–"}</span>${comments(m.vor, m.nach)}</div>`; }).join("") : `<p class="small">Noch keine Rückmeldungen. Die Spieler sehen die Abfrage am Trainingstag in „Mein Bereich“.</p>`}</section>
      ${errP()}
      ${T.confirm === "delTraining" ? `<section class="card stack danger"><p><b>Training wirklich löschen?</b> Anwesenheit und Rückmeldungen dazu werden entfernt.</p>
        <div class="row"><button class="btn danger-btn" data-act="tDelete">Ja, löschen</button><button class="btn ghost" data-act="cCancel">Abbrechen</button></div></section>`
        : `<button class="btn ghost wide danger-text" data-act="cAskDel" data-v="delTraining">Training löschen</button>`}`;
    }

    if (s === "coaches") {
      const me = Co();
      const list = me.isAdmin ? T.coaches : T.coaches.filter(c => c.id === me.id);
      return `${backGrid}<section><p class="eyebrow">Trainer-Bereich</p><h1>${me.isAdmin ? "Trainer" : "Mein Konto"}</h1>${me.isAdmin ? `<p class="lede">Admins legen Trainer an, vergeben Admin-Rechte und dürfen Spieler löschen.</p>` : ""}</section>${tabs()}
      <section class="stack">${list.map(c => `<button class="trow" data-act="cEdit" data-v="${c.id}"><span class="tdate">${esc(c.name)}${c.id === me.id ? " (du)" : ""}</span><span class="small">${esc(c.username || "")}</span>${c.isAdmin ? `<span class="badge">Admin</span>` : ""}</button>`).join("")}</section>
      ${me.isAdmin ? `<section class="card stack"><h2>Trainer hinzufügen</h2>
        <div class="fld"><label for="cf-name">Vorname</label><input id="cf-name" maxlength="30" value="${esc(T.cf.name)}"></div>
        ${userField("cf-user", "Benutzername", T.cf.user, "Leer lassen = Vorname.")}
        <label class="check"><input type="checkbox" id="cf-admin" ${T.cf.isAdmin ? "checked" : ""}> Admin</label>
        ${errP()}${okP()}<button class="btn wide" data-act="coachAdd" ${T.busy ? "disabled" : ""}>Trainer hinzufügen</button></section>` : ""}`;
    }

    if (s === "coachEdit") {
      const c = T.cEdit, me = Co(), self = c.id === me.id;
      return `<button class="back" data-act="ctab" data-v="coaches">‹ ${me.isAdmin ? "Trainer" : "Mein Konto"}</button>${tabs()}
      <section><p class="eyebrow">${self ? "Mein Konto" : "Trainer"}</p><h1>${esc(c.name)}</h1></section>
      <section class="card stack">
        <div class="fld"><label for="ce-name">Vorname</label><input id="ce-name" maxlength="30" value="${esc(T.cf.name)}"></div>
        ${userField("ce-user", "Benutzername", T.cf.user)}
        ${me.isAdmin ? `<label class="check"><input type="checkbox" id="ce-admin" ${T.cf.isAdmin ? "checked" : ""}> Admin</label>` : ""}
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
    const r = await St().get("players.php?nr=" + nr);
    if (!r.ok) return fail(r);
    T.detail = r; T.posOff = r.player.posOff; T.posDef = r.player.posDef; T.uname = r.username || ""; LZ.render();
  }
  LZ.actions.cPlayer = (b, v) => openPlayer(+v);
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
    const [r] = await Promise.all([St().get("trainings.php?id=" + id), refreshPlayers()]);
    if (!r.ok) return fail(r);
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
  LZ.actions.tAtt = async (b, v) => {
    const nr = +v, set = new Set(T.tr.present), on = !set.has(nr);
    on ? set.add(nr) : set.delete(nr); T.tr.present = [...set]; LZ.render();     // sofort anzeigen
    const r = await St().send("trainings.php", { action: "attend", id: T.tr.training.id, nr, present: on });
    if (!r.ok) { on ? set.delete(nr) : set.add(nr); T.tr.present = [...set]; fail(r); }
  };
  LZ.actions.tDelete = async () => {
    const r = await St().send("trainings.php", { action: "delete", id: T.tr.training.id });
    if (!r.ok) return fail(r);
    openTrainings();
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
    else if (id === "t-date") T.newT.date = el.value;
    else if (id === "t-time") T.newT.time = el.value;
    else if (id === "t-note") T.newT.note = el.value;
    else if (id === "cf-name" || id === "ce-name") T.cf.name = el.value;
    else if (id === "cf-user" || id === "ce-user") T.cf.user = el.value;
    else if ((id === "cf-admin" || id === "ce-admin") && e.type === "change") T.cf.isAdmin = el.checked;
  });
})();
