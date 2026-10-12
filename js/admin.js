/*
 * Lernzone – Verwaltung (ab 0.22.0, nur Weg B)
 * Superadmin: Vereine anlegen und sperren, Vereinsadmins einsetzen (sieht keine Mannschaftsdaten).
 * Vereinsadmin: Mannschaften anlegen/archivieren, Trainer einladen, Cheftrainer bestimmen, Mannschaften öffnen.
 * Daten: api/admin.php
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const SEC = { data: null, warn: true, all: false };
  const A = { data: null, err: "", note: null, open: "", confirm: "", club: 0, busy: false };
  const val = id => ((document.getElementById(id) || {}).value || "").trim();
  const me = () => (LZ.Store.coach || {}).accountId;
  const chk = id => !!(document.getElementById(id) || {}).checked;

  async function loadSec() {
    const r = await LZ.Store.get("security.php" + (SEC.warn ? "?only=warn" : ""));
    SEC.data = r && r.ok ? r : null; LZ.render();
  }
  async function load() {
    loadSec();
    const r = await LZ.Store.get("admin.php");
    if (r && r.ok) { A.data = r; A.err = ""; } else A.err = (r && r.error) || "Verwaltung konnte nicht geladen werden.";
    LZ.render();
  }
  // ab 0.36.0 in der Admin-Zone (admin/): Übersicht, Vereine & Mannschaften, Rechtliches, E-Mail-Versand, Sicherheit, Mein Konto
  const ADMV = ["home", "me", "verwaltung", "rechtliches", "sicherheit"];
  LZ.on("enter", v => { if (LZ.zone === "admin" && LZ.isAdmin() && ADMV.includes(v)) { load(); if (LZ.legal) LZ.legal.load(true); } });
  LZ.on("ready", () => { if (LZ.zone === "admin" && LZ.isAdmin()) { load(); if (LZ.legal) LZ.legal.load(true); } });

  async function send(body, after) {
    if (A.busy) return;
    A.busy = true; A.err = ""; LZ.render();
    const r = await LZ.Store.send("admin.php", body);
    A.busy = false;
    if (!r || !r.ok) { A.err = (r && r.error) || "Das hat nicht geklappt."; LZ.render(); return; }
    A.open = ""; A.confirm = "";
    if (r.code) A.note = { username: r.username, code: r.code, expires: r.expires };
    else if (r.username && body.action.endsWith("_add")) A.note = { username: r.username, existing: true };
    if (after) after(r);
    await load();
  }

  /* ---------- Bausteine ---------- */
  const noteBox = () => !A.note ? "" : `<section class="card stack codebox" role="status">
      ${A.note.code ? `<p>Zugang für <b>${esc(A.note.username)}</b></p><p class="code">${esc(A.note.code)}</p>
        <p class="small">Gültig bis ${esc(A.note.expires)}. Persönlich weitergeben – der Code wird nur jetzt angezeigt. Damit anmelden und eigenes Passwort festlegen.</p>`
      : `<p><b>${esc(A.note.username)}</b> hat schon ein Konto und meldet sich mit seinem bisherigen Passwort an.</p>`}
      <button class="btn ghost small" data-act="admNoteClose">OK</button></section>`;
  const errBox = () => A.err ? `<p class="err" role="alert" style="text-align:left">${esc(A.err)}</p>` : "";
  const pend = x => x.pending ? ` <span class="badge muted" title="Hat sich noch nicht angemeldet">Code offen</span>` : "";
  const personForm = (key, label, extra = "") => A.open !== key ? "" : `<div class="stack subform">
      <div class="fld"><label for="${key}-name">Vorname</label><input id="${key}-name" maxlength="30" autocomplete="off"></div>
      <div class="fld"><label for="${key}-user">Benutzername <span class="small">(leer = Vorschlag; vorhandenen eingeben, um ein bestehendes Konto hinzuzufügen)</span></label>
        <input id="${key}-user" maxlength="30" autocapitalize="none" spellcheck="false" autocomplete="off" placeholder="z. B. vorname.n"></div>
      ${extra}
      <div class="chiprow"><button class="btn" data-act="admSubmit" data-v="${key}" ${A.busy ? "disabled" : ""}>${label}</button><button class="btn ghost" data-act="admOpen" data-v="">Abbrechen</button></div></div>`;
  const confirmBtn = (key, label, act, attrs) => A.confirm === key
    ? `<button class="btn small danger-btn" data-act="${act}" ${attrs}>Wirklich ${label}?</button> <button class="linkbtn" data-act="admConfirm" data-v="">Nein</button>`
    : `<button class="linkbtn" data-act="admConfirm" data-v="${key}">${label}</button>`;

  /* ---------- Plattform (Superadmin) ---------- */
  function platformCard(d) {
    return `<section class="card stack"><div class="rowspread"><h2>Plattform</h2><span class="badge">Superadmin</span></div>
      <p class="small">Vereine freischalten und Vereinsadmins einsetzen. Kader, IEP, Noten und Befinden der Mannschaften siehst du hier nicht.</p>
      <ul class="admlist">${d.clubs.map(c => `<li class="rowspread">
        <span><b>${esc(c.name)}</b>${c.active ? "" : ` <span class="badge muted">gesperrt</span>`}<br><span class="small">${(n => n + (n === 1 ? " Mannschaft" : " Mannschaften"))(c.teams.filter(t => t.active).length)} · Vereinsadmin: ${c.admins.map(a => esc(a.name || a.username)).join(", ") || "—"}</span></span>
        <span class="chiprow">${c.own ? "" : `<button class="btn ghost small" data-act="admClub" data-v="${c.id}">${A.club === c.id ? "Schließen" : "Verwalten"}</button>`}
          <button class="linkbtn" data-act="admClubActive" data-v="${c.id}" data-on="${c.active ? 0 : 1}">${c.active ? "Sperren" : "Entsperren"}</button></span></li>`).join("") || `<li class="small">Noch keine Vereine.</li>`}</ul>
      ${A.open === "club" ? `<div class="stack subform"><div class="fld"><label for="club-cname">Vereinsname</label><input id="club-cname" maxlength="60" placeholder="z. B. SV Musterstadt"></div>
        <p class="small"><b>Vereinsadmin</b> (z. B. Jugendleiter)</p></div>` : ""}
      ${personForm("club", "Verein anlegen")}
      ${A.open === "club" ? "" : `<button class="btn ghost" data-act="admOpen" data-v="club">+ Neuer Verein</button>`}
    </section>`;
  }

  /* ---------- Rechtliches (ab 0.23.0) ---------- */
  const lg = () => (LZ.legal && LZ.legal.get()) || { operator: {}, clubs: [] };
  const fld = (id, label, v, area, ph = "") => `<div class="fld"><label for="${id}">${label}</label>${area
    ? `<textarea id="${id}" rows="3" maxlength="300" placeholder="${esc(ph)}">${esc(keep[id] ?? v ?? "")}</textarea>`
    : `<input id="${id}" maxlength="100" value="${esc(keep[id] ?? v ?? "")}" placeholder="${esc(ph)}">`}</div>`;
  let keep = {};                                                               // Eingaben behalten, wenn Speichern scheitert
  function operatorCard() {
    const o = lg().operator || {}, done = o.name && o.street && o.city && o.email;
    return `<section class="card stack"><div class="rowspread"><h2>Impressum und Betreiber</h2>${done ? "" : `<span class="badge">fehlt noch</span>`}</div>
      <p class="small">Steht im Impressum und in der Datenschutzerklärung (öffentlich). Die Angaben liegen nur in der Datenbank.</p>
      ${A.open === "op" ? `<div class="stack subform">
        ${fld("op-name", "Name", o.name, false, "Vorname Nachname")}${fld("op-street", "Straße und Hausnummer", o.street)}${fld("op-city", "PLZ und Ort", o.city)}
        ${fld("op-email", "E-Mail", o.email)}${fld("op-phone", "Telefon (empfohlen)", o.phone)}
        ${fld("op-host", "Hosting-Anbieter (Name, Anschrift, Serverstandort)", o.host, true, "z. B. Firma GmbH, Straße, Ort – Server in Deutschland")}
        ${fld("op-logs", "Server-Protokolle (optional, sonst Standardtext)", o.logs, true, "z. B. … werden nach 7 Tagen gelöscht")}
        <div class="chiprow"><button class="btn" data-act="admOpSave">Speichern</button><button class="btn ghost" data-act="admOpen" data-v="">Abbrechen</button></div></div>`
        : `<p>${o.name ? `${esc(o.name)} · ${esc(o.city)}` : `<span class="legal-missing">Noch keine Angaben</span>`}</p>
        <div class="chiprow"><button class="btn ghost small" data-act="admOpen" data-v="op">Bearbeiten</button><button class="linkbtn" data-act="legal" data-v="impressum">Impressum ansehen</button></div>`}
    </section>`;
  }
  function clubLegal(c) {
    const x = lg().clubs.find(y => y.id === c.id) || {}, k = "c" + c.id + "legal", done = x.address && x.email;
    return `<section class="card stack"><div class="rowspread"><h2>${esc(c.name)}</h2>${done && x.contentResp ? "" : `<span class="badge">fehlt noch</span>`}</div>
      <p class="small">Der Verein ist Verantwortlicher für die Daten seiner Mannschaften und für die Inhalte, die seine Trainer eintragen. Die Angaben stehen im Impressum, in der Datenschutzerklärung und auf der Einwilligung.</p>
      ${A.open === k ? `<div class="stack subform">
        ${fld(k + "-name", "Offizieller Name", x.legalName, false, "z. B. SV Musterstadt e. V.")}${fld(k + "-addr", "Anschrift des Vereins", x.address, true, "Straße\nPLZ Ort")}
        ${fld(k + "-board", "Vertretungsberechtigter Vorstand", x.board, true, "z. B. Max Muster (1. Vorsitzender), Erika Muster (2. Vorsitzende)")}
        ${fld(k + "-resp", "Verantwortlich für den Inhalt (Name, Anschrift)", x.contentResp, true, "z. B. Jugendleiter Max Muster, Straße, PLZ Ort")}
        ${fld(k + "-email", "E-Mail für Datenschutz-Fragen", x.email)}${fld(k + "-dpo", "Datenschutzbeauftragte/r (falls vorhanden)", x.dpo, true)}
        <div class="chiprow"><button class="btn" data-act="admClubLegal" data-v="${c.id}">Speichern</button><button class="btn ghost" data-act="admOpen" data-v="">Abbrechen</button></div></div>`
        : `<dl class="legaldl">${[["Offizieller Name", x.legalName], ["Anschrift", x.address], ["Vertreten durch", x.board], ["Verantwortlich für den Inhalt", x.contentResp], ["E-Mail Datenschutz", x.email], ["Datenschutzbeauftragte/r", x.dpo]]
            .map(([l, v]) => `<dt>${l}</dt><dd>${v ? esc(v).replace(/\n/g, "<br>") : `<span class="legal-missing">—</span>`}</dd>`).join("")}</dl>
          <div class="chiprow"><button class="btn ghost small" data-act="admOpen" data-v="${k}">Bearbeiten</button><button class="linkbtn" data-act="legal" data-v="impressum">Impressum ansehen</button><button class="linkbtn" data-act="legal" data-v="einwilligung">Einwilligung drucken</button></div>`}
    </section>`;
  }
  async function legalSend(body) {
    const r = await LZ.Store.send("legal.php", body);
    if (!r || !r.ok) {
      keep = {}; document.querySelectorAll(".subform input, .subform textarea").forEach(el => { keep[el.id] = el.value; });
      A.err = (r && r.error) || "Speichern hat nicht geklappt."; LZ.render(); return;
    }
    keep = {}; A.open = ""; A.err = ""; await LZ.legal.load(true); LZ.render();
  }
  LZ.actions.admOpSave = () => legalSend({ action: "operator", name: val("op-name"), street: val("op-street"), city: val("op-city"),
    email: val("op-email"), phone: val("op-phone"), host: val("op-host"), logs: val("op-logs") });
  LZ.actions.admClubLegal = (b, v) => { const k = "c" + v + "legal";
    legalSend({ action: "club", club: +v, legalName: val(k + "-name"), address: val(k + "-addr"), board: val(k + "-board"), contentResp: val(k + "-resp"), email: val(k + "-email"), dpo: val(k + "-dpo") }); };

  /* ---------- Verein ---------- */
  function teamBlock(c, t) {
    const k = "t" + t.id;
    return `<li class="admteam">
      <div class="rowspread"><span><b>${esc(t.name)}</b>${t.season ? ` <span class="small">· ${esc(t.season)}</span>` : ""}<br><span class="small">${t.players} Spieler · ${t.coaches.length} Trainer</span></span>
        <span class="chiprow">${c.own ? `<button class="btn small" data-act="admTeamOpen" data-v="${t.id}">Öffnen</button>` : ""}<button class="btn ghost small" data-act="admOpen" data-v="${k}edit">Bearbeiten</button></span></div>
      ${A.open === k + "edit" ? `<div class="stack subform">
        <div class="fld"><label for="${k}edit-name">Name</label><input id="${k}edit-name" maxlength="40" value="${esc(t.name)}"></div>
        <div class="fld"><label for="${k}edit-season">Saison</label><input id="${k}edit-season" maxlength="20" value="${esc(t.season)}"></div>
        <div class="chiprow"><button class="btn" data-act="admTeamSave" data-v="${t.id}">Speichern</button><button class="btn ghost" data-act="admOpen" data-v="">Abbrechen</button></div>
        <p>${confirmBtn(k + "arch", "archivieren", "admTeamActive", `data-v="${t.id}" data-on="0"`)} <span class="small">Die Mannschaft verschwindet aus der Auswahl, ihre Daten bleiben erhalten.</span></p></div>` : ""}
      <ul class="admcoaches">${t.coaches.map(co => `<li class="rowspread"><span>${esc(co.name)} <span class="small">${esc(co.username)}</span>${co.head ? ` <span class="badge">Cheftrainer</span>` : ""}${pend(co)}</span>
        <span class="chiprow"><button class="linkbtn" data-act="admHead" data-v="${t.id}" data-c="${co.id}" data-on="${co.head ? 0 : 1}">${co.head ? "Kein Cheftrainer" : "Cheftrainer"}</button>
          ${co.accountId === me() ? "" : `<button class="linkbtn" data-act="admCode" data-v="${co.accountId}" data-club="${c.id}">Code</button>`}
          ${confirmBtn(k + "rm" + co.id, "entfernen", "admCoachRm", `data-v="${t.id}" data-c="${co.id}"`)}</span></li>`).join("") || `<li class="small">Noch keine Trainer.</li>`}</ul>
      ${personForm(k + "coach", "Trainer hinzufügen", `<label class="check"><input type="checkbox" id="${k}coach-head"> Cheftrainer (verwaltet Co-Trainer, löscht Spieler)</label>`)}
      ${A.open === k + "coach" ? "" : `<button class="linkbtn" data-act="admOpen" data-v="${k}coach">+ Trainer hinzufügen</button>`}
    </li>`;
  }
  function clubCard(c) {
    const k = "c" + c.id, active = c.teams.filter(t => t.active), archived = c.teams.filter(t => !t.active);
    return `<section class="card stack"><div class="rowspread"><h2>${esc(c.name)}</h2>${c.own ? `<span class="badge">Vereinsadmin</span>` : ""}</div>
      <h3>Mannschaften</h3>
      <ul class="admlist">${active.map(t => teamBlock(c, t)).join("") || `<li class="small">Noch keine Mannschaft – lege die erste an.</li>`}</ul>
      ${A.open === k + "team" ? `<div class="stack subform">
        <div class="fld"><label for="${k}team-name">Name</label><input id="${k}team-name" maxlength="40" placeholder="z. B. U15"></div>
        <div class="fld"><label for="${k}team-season">Saison (optional)</label><input id="${k}team-season" maxlength="20" placeholder="z. B. 26/27"></div>
        <div class="chiprow"><button class="btn" data-act="admTeamCreate" data-v="${c.id}" ${A.busy ? "disabled" : ""}>Anlegen</button><button class="btn ghost" data-act="admOpen" data-v="">Abbrechen</button></div></div>`
        : `<button class="btn ghost" data-act="admOpen" data-v="${k}team">+ Neue Mannschaft</button>`}
      ${archived.length ? `<details><summary class="small">Archiv (${archived.length})</summary><ul class="admlist">${archived.map(t => `<li class="rowspread"><span>${esc(t.name)}${t.season ? " · " + esc(t.season) : ""}</span>
        <button class="linkbtn" data-act="admTeamActive" data-v="${t.id}" data-on="1">Wiederherstellen</button></li>`).join("")}</ul></details>` : ""}
      <h3>Vereinsadmins</h3>
      <p class="small">Legen Mannschaften an, laden Trainer ein und sehen alle Mannschaften des Vereins.</p>
      <ul class="admcoaches">${c.admins.map(a => `<li class="rowspread"><span>${esc(a.name || a.username)} <span class="small">${esc(a.username)}</span>${pend(a)}</span>
        <span class="chiprow">${a.accountId === me() ? "" : `<button class="linkbtn" data-act="admCode" data-v="${a.accountId}" data-club="${c.id}">Code</button>`}
        ${c.admins.length > 1 && a.accountId !== me() ? confirmBtn(k + "adm" + a.accountId, "entfernen", "admAdminRm", `data-v="${c.id}" data-c="${a.accountId}"`) : ""}</span></li>`).join("")}</ul>
      ${personForm(k + "admin", "Vereinsadmin hinzufügen")}
      ${A.open === k + "admin" ? "" : `<button class="linkbtn" data-act="admOpen" data-v="${k}admin">+ Vereinsadmin hinzufügen</button>`}
      <p class="small">Impressum und Datenschutz-Angaben des Vereins: <button class="linkbtn" data-act="side" data-v="rechtliches">Rechtliches</button></p>
    </section>`;
  }

  const H = (t, lede) => `<section>${LZ.area("Admin-Zone")}<h1>${t}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</section>`;
  const wait = t => `${H(t)}${errBox() || `<p class="small">Lade …</p>`}`;
  LZ.views.verwaltung = () => {
    const d = A.data, t = d && d.platform ? "Vereine & Mannschaften" : "Verein & Mannschaften";
    if (!d) return wait(t);
    const clubs = d.clubs.filter(c => c.own || c.id === A.club);
    return `${H(t)}${noteBox()}${errBox()}${d.platform ? platformCard(d) : ""}${clubs.map(clubCard).join("")}`;
  };
  LZ.views.rechtliches = () => {
    const d = A.data;
    if (!d) return wait("Rechtliches");
    const clubs = d.clubs.filter(c => c.own || c.id === A.club);
    return `${H("Rechtliches", "Angaben für Impressum, Datenschutzerklärung und Einwilligung. Sie sind öffentlich sichtbar, sobald sie gespeichert sind.")}${errBox()}
      ${d.platform ? operatorCard() : ""}
      ${clubs.length ? `<h2 class="sechead">Vereine</h2>${clubs.map(clubLegal).join("")}` : ""}`;
  };
  LZ.views.sicherheit = () => `${H("Sicherheit")}${secCard() || `<p class="small">Lade …</p>`}`;
  LZ.views.mailversand = () => `${H("E-Mail-Versand")}${(LZ.Store.coach || {}).platformAdmin ? mailSettingsCard() || `<p class="small">Lade …</p>` : `<p class="small">Nur für den Superadmin.</p>`}`;
  LZ.views.konto = () => {
    const acc = LZ.Store.account || {};
    return `<section>${LZ.area(LZ.zone === "admin" ? "Admin-Zone" : "Eltern")}<h1>Mein Konto</h1></section><section class="card stack"><p class="small">Angemeldet als <b>${esc(acc.username || "")}</b></p>
      <div class="row"><button class="btn ghost" data-act="pwStart">Passwort ändern</button></div></section>${LZ.mailCard ? LZ.mailCard() : ""}`;
  };

  /* Übersicht der Admin-Zone: Kacheln nach Rechten, offene Punkte */
  LZ.views.adminHome = () => {
    const Co = LZ.Store.coach || {}, d = A.data, club = LZ.isAdmin(), team = LZ.coachMode() && Co.isAdmin;
    const L = lg(), myClubs = d ? d.clubs.filter(c => c.own) : [];
    const todo = [];
    if (d && d.platform) { const o = L.operator || {}; if (!(o.name && o.street && o.city && o.email)) todo.push(["Impressum: Angaben des Betreibers fehlen", "rechtliches"]); }
    myClubs.forEach(c => { const x = (L.clubs || []).find(y => y.id === c.id) || {};
      if (!(x.address && x.email)) todo.push([`${c.name}: Anschrift oder Datenschutz-E-Mail fehlt`, "rechtliches"]);
      if (!x.contentResp) todo.push([`${c.name}: Verantwortlicher für den Inhalt fehlt`, "rechtliches"]); });
    if (SEC.data && (SEC.data.stats.locks || SEC.data.stats.blocked)) todo.push(["Sicherheit: Sperren in den letzten 24 Stunden", "sicherheit"]);
    const tile = (v, act, icon, t, s) => `<button class="card admtile" data-act="${act}" ${v ? `data-v="${v}"` : ""}><span class="eyebrow">${icon}</span><h2>${t}</h2><span class="small">${s}</span></button>`;
    const tiles = [
      club && tile("verwaltung", "side", "Verein", d && d.platform ? "Vereine & Mannschaften" : "Verein & Mannschaften", "Mannschaften anlegen, Trainer einladen, Cheftrainer bestimmen"),
      team && tile("", "coachesStart", "Mannschaft", "Trainer", "Co-Trainer anlegen, Zugänge und Einmal-Codes"),
      team && tile("inhalte", "side", "Mannschaft", "Inhalte", "Prinzipien, Quizfragen und Texte der Phasen"),
      team && tile("einstellungen", "side", "Mannschaft", "Einstellungen", "Google-Kalender, Saisonbeginn, Spielzeiten"),
      team && tile("infoAdmin", "side", "Verein", "Info & Partner", "Vereinsinfos, Ärzte, Therapie, Partner für Eltern; Anfragen „Partner werden“"),
      club && tile("rechtliches", "side", "Verein", "Rechtliches", "Impressum, Vorstand, Verantwortlicher für den Inhalt"),
      Co.platformAdmin && tile("mailversand", "side", "Plattform", "E-Mail-Versand", "Mailserver für „Passwort vergessen“"),
      club && tile("sicherheit", "side", "Plattform", "Sicherheit", "Anmeldungen, Fehlversuche, Sperren")
    ].filter(Boolean).join("");
    const where = LZ.coachMode() ? `Mannschaft: <b>${esc(Co.team ? Co.team.club + " · " + Co.team.name : "")}</b>` : "Keine Mannschaft geöffnet";
    return `${H("Admin-Zone", `Verwaltung, Inhalte und Rechtliches. Trainer, Kinder und später Eltern nutzen FU-STARS unter der normalen Adresse.`)}
      ${noteBox()}${errBox()}
      ${todo.length ? `<section class="card stack"><h2>Offen</h2><ul class="admtodo">${todo.map(([t, v]) => `<li><button class="linkbtn" data-act="side" data-v="${v}">${esc(t)}</button></li>`).join("")}</ul></section>` : ""}
      <div class="admtiles">${tiles}</div>
      <p class="small">${where}${LZ.coachMode() ? ` · <a href="./">Zu FU-STARS</a>` : ""}</p>`;
  };
  LZ.views.noAdmin = () => `<section>${LZ.area("Admin-Zone")}<h1>Kein Zugang</h1><p class="lede">Die Admin-Zone ist für Cheftrainer, Vereinsadmins und den Betreiber.</p></section>
    <div class="row"><a class="btn" href="./">Zu FU-STARS</a><button class="btn ghost" data-act="logout">Abmelden</button></div>`;

  /* ---------- E-Mail-Versand (ab 0.34.0, Superadmin) ---------- */
  const MS = { d: null, err: "", msg: "", busy: false };
  async function loadMS() { const r = await LZ.Store.get("mailsettings.php"); if (r && r.ok) { MS.d = r; LZ.render(); } else MS.d = { failed: true }; }
  function mailSettingsCard() {
    if (!MS.d) { loadMS(); return ""; }
    const d = MS.d; if (d.failed) return "";
    const f = (id, label, val, type = "text", ph = "") => `<div class="fld"><label for="ms-${id}">${label}</label><input id="ms-${id}" type="${type}" maxlength="200" value="${esc(val ?? "")}" placeholder="${esc(ph)}" autocomplete="off"></div>`;
    return `<section class="card stack"><h2>E-Mail-Versand</h2>
      <p class="small">Für „Passwort vergessen“ und die Bestätigung von E-Mail-Adressen (nur Trainer und Admins). ${d.testmode ? "<b>Testmodus:</b> Ohne Mailserver landen E-Mails als Datei in <code>storage/mail-outbox/</code>." : ""}</p>
      ${f("app", "Adresse der App (https://…)", d.appUrl, "url", "https://lernzone.verein.de/")}
      <p class="small">Für die Links in den E-Mails. Lokal (localhost) geht es auch ohne.</p>
      <div class="grid2">${f("host", "Mailserver (SMTP)", d.host, "text", "smtp.anbieter.de")}${f("port", "Port", d.port, "number")}</div>
      <div class="fld"><label for="ms-secure">Verschlüsselung</label><select id="ms-secure"><option value="tls" ${d.secure !== "ssl" ? "selected" : ""}>STARTTLS (meist Port 587)</option><option value="ssl" ${d.secure === "ssl" ? "selected" : ""}>SSL/TLS (meist Port 465)</option></select></div>
      <div class="grid2">${f("user", "Benutzer", d.user)}${f("pass", d.hasPass ? "Passwort (leer = unverändert)" : "Passwort", "", "password")}</div>
      <div class="grid2">${f("from", "Absender-Adresse", d.from, "email", "noreply@verein.de")}${f("fromName", "Absender-Name", d.fromName, "text", "FU-STARS Lernzone")}</div>
      ${MS.err ? `<p class="err" role="alert" style="text-align:left">${esc(MS.err)}</p>` : ""}${MS.msg ? `<p class="okmsg">${esc(MS.msg)}</p>` : ""}
      <div class="row"><button class="btn" data-act="msSave" ${MS.busy ? "disabled" : ""}>Speichern</button><button class="btn ghost" data-act="msTest" ${MS.busy ? "disabled" : ""}>Test-Mail an mich</button></div></section>`;
  }
  const msVal = id => ((document.getElementById("ms-" + id) || {}).value || "").trim();
  LZ.actions.msSave = async () => {
    const body = { action: "save", appUrl: msVal("app"), host: msVal("host"), port: +msVal("port") || 587, secure: msVal("secure"),
      user: msVal("user"), pass: (document.getElementById("ms-pass") || {}).value || "", from: msVal("from"), fromName: msVal("fromName") };   // vor dem Neuzeichnen lesen
    MS.busy = true; MS.err = ""; MS.msg = ""; LZ.render();
    const r = await LZ.Store.send("mailsettings.php", body);
    MS.busy = false;
    if (!r.ok) { MS.err = r.error || "Speichern hat nicht geklappt."; LZ.render(); return; }
    MS.d = null; MS.msg = "Gespeichert."; await loadMS();
  };
  LZ.actions.msTest = async () => {
    MS.busy = true; MS.err = ""; MS.msg = ""; LZ.render();
    const r = await LZ.Store.send("mailsettings.php", { action: "test" });
    MS.busy = false;
    if (!r.ok) MS.err = r.error || "Test hat nicht geklappt."; else MS.msg = r.result === "outbox" ? "Testmodus: Mail liegt in storage/mail-outbox/." : "Test-Mail verschickt.";
    LZ.render();
  };

  /* ---------- Sicherheitsprotokoll (ab 0.25.0) ---------- */
  const SEC_LABELS = { login_ok: "Anmeldung", login_code: "Anmeldung mit Einmal-Code", login_fail: "Fehlversuch", login_locked: "Versuch trotz Sperre",
    account_locked: "Konto gesperrt", ip_blocked: "Netz gesperrt", pw_set: "Passwort festgelegt", pw_change: "Passwort geändert", pw_change_fail: "Passwort ändern fehlgeschlagen", pw_reset_request: "Passwort vergessen angefragt", pw_reset: "Passwort per E-Mail-Link neu gesetzt",
    email_set: "E-Mail eingetragen", email_verified: "E-Mail bestätigt", email_removed: "E-Mail gelöscht", email_change_fail: "E-Mail ändern fehlgeschlagen", mail_settings: "E-Mail-Versand geändert",
    code_issued: "Neuer Einmal-Code", username_change: "Benutzername geändert", coach_add: "Trainer hinzugefügt", coach_remove: "Trainer entfernt",
    role_change: "Rolle geändert", player_add: "Spieler angelegt", player_delete: "Spieler gelöscht", consent: "Einwilligung", setup: "Einrichtung",
    parent_add: "Elternzugang angelegt", parent_link: "Elternzugang verknüpft", parent_remove: "Elternzugang entfernt", parent_absence: "Absage durch Eltern" };
  function secCard() {
    const d = SEC.data; if (!d) return "";
    const st = d.stats, fmt = ts => new Date(ts * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const list = SEC.all ? d.events : d.events.slice(0, 25);
    const chip = (n, l, bad) => `<span class="secstat ${n && bad ? "bad" : ""}"><b>${n}</b> ${l}</span>`;
    return `<section class="card stack"><div class="rowspread"><h2>Sicherheitsprotokoll</h2>${st.locks || st.blocked ? `<span class="badge">Achtung</span>` : ""}</div>
      <p class="small">Letzte 24 Stunden:</p>
      <div class="chiprow">${chip(st.fails, "Fehlversuche", st.fails >= 10)}${chip(st.locks, "Kontosperren", true)}${chip(st.blocked, "gesperrte Netze", true)}${chip(st.night, "nachts angemeldet", true)}</div>
      <label class="check small-check"><input type="checkbox" id="sec-warn" ${SEC.warn ? "checked" : ""}> Nur Warnungen</label>
      <ul class="seclog">${list.map(e => `<li class="lv-${esc(e.level)}"><span class="small">${fmt(e.ts)}</span>
        <span><b>${esc(SEC_LABELS[e.event] || (e.event.startsWith("admin_") ? "Verwaltung" : e.event))}</b>${e.username ? ` · ${esc(e.username)}` : ""}${e.detail ? ` <span class="small">– ${esc(e.detail)}</span>` : ""}
        ${e.actor && e.actor !== e.username ? `<span class="small"> · von ${esc(e.actor)}</span>` : ""} <span class="small ipk" title="Netz (verschlüsselt)">#${esc((e.ip || "").slice(0, 6))}</span></span></li>`).join("") || `<li class="small">Keine Einträge.</li>`}</ul>
      ${!SEC.all && d.events.length > 25 ? `<button class="linkbtn" data-act="secAll">Alle ${d.events.length} anzeigen</button>` : ""}
      <p class="small">Einträge werden nach 90 Tagen gelöscht. Netze erscheinen nur verschlüsselt (#…), gleiche Kennung = gleiches Netz.</p>
    </section>`;
  }
  LZ.actions.secAll = () => { SEC.all = true; LZ.render(); };
  LZ.inputs.push(e => { if (e.target.id === "sec-warn" && e.type === "change") { SEC.warn = e.target.checked; SEC.all = false; loadSec(); } });

  /* ---------- Aktionen ---------- */
  LZ.actions.admOpen = (b, v) => { keep = {}; A.open = v; A.confirm = ""; A.err = ""; LZ.render(); const f = document.querySelector(".subform input"); if (f) f.focus(); };
  LZ.actions.admConfirm = (b, v) => { A.confirm = v; LZ.render(); };
  LZ.actions.admNoteClose = () => { A.note = null; LZ.render(); };
  LZ.actions.admClub = (b, v) => { A.club = A.club === +v ? 0 : +v; LZ.render(); };
  LZ.actions.admClubActive = b => send({ action: "club_update", club: +b.dataset.v, active: b.dataset.on === "1" });
  LZ.actions.admSubmit = (b, k) => {
    const name = val(k + "-name"), username = val(k + "-user");
    if (k === "club") return send({ action: "club_create", name: val("club-cname"), adminName: name, adminUsername: username });
    let m = k.match(/^c(\d+)admin$/);
    if (m) return send({ action: "admin_add", club: +m[1], name, username });
    m = k.match(/^t(\d+)coach$/);
    if (m) return send({ action: "coach_add", team: +m[1], name, username, head: chk(k + "-head") });
  };
  LZ.actions.admTeamCreate = (b, v) => send({ action: "team_create", club: +v, name: val("c" + v + "team-name"), season: val("c" + v + "team-season") });
  LZ.actions.admTeamSave = (b, v) => send({ action: "team_update", team: +v, name: val("t" + v + "edit-name"), season: val("t" + v + "edit-season") });
  LZ.actions.admTeamActive = b => send({ action: "team_update", team: +b.dataset.v, active: b.dataset.on === "1" });
  LZ.actions.admHead = b => send({ action: "coach_head", team: +b.dataset.v, coachId: +b.dataset.c, head: b.dataset.on === "1" });
  LZ.actions.admCoachRm = b => send({ action: "coach_remove", team: +b.dataset.v, coachId: +b.dataset.c });
  LZ.actions.admAdminRm = b => send({ action: "admin_remove", club: +b.dataset.v, accountId: +b.dataset.c });
  LZ.actions.admCode = b => send({ action: "code", club: +b.dataset.club, accountId: +b.dataset.v });
  LZ.actions.admTeamOpen = async (b, v) => {
    const r = await LZ.Store.send("teams.php", { action: "switch", id: +v });
    if (r && r.ok) location.reload(); else { A.err = (r && r.error) || "Öffnen hat nicht geklappt."; LZ.render(); }
  };
})();
