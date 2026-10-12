/*
 * Lernzone – Anmeldung (nur Weg B / PHP)
 * Ansichten: login (Benutzername + Passwort oder Einmal-Code), setpw (eigenes Passwort festlegen),
 *            setup (erstes Trainer-Konto, nur localhost), pwchange (Passwort ändern)
 * Daten: api/auth.php über LZ.Store.signIn / setPassword / setupFirst / changePassword
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const F = { u: "", p: "", p2: "", old: "", name: "", club: "", team: "", show: false, err: "", msg: "", busy: false };
  const reset = () => Object.assign(F, { p: "", p2: "", old: "", err: "", msg: "", busy: false });

  const pwInput = (id, label, ac, val) => `<div class="fld"><label for="${id}">${label}</label>
    <input id="${id}" type="${F.show ? "text" : "password"}" autocomplete="${ac}" maxlength="200" value="${esc(val)}" required></div>`;
  const showToggle = `<label class="check small-check"><input type="checkbox" id="auth-show" ${F.show ? "checked" : ""}> Passwort anzeigen</label>`;
  const errP = () => F.err ? `<p class="err" role="alert" style="text-align:left">${esc(F.err)}</p>` : "";
  const minLen = () => ((LZ.Store.pending || LZ.Store.account || {}).minLen) || (LZ.Store.gate && LZ.Store.gate() === "setup" ? 14 : 12);
  const rules = () => `<ul class="rules"><li>mindestens ${minLen()} Zeichen</li><li>Groß- und Kleinbuchstaben, mindestens eine Zahl und ein Sonderzeichen (z. B. - ! ? #)</li><li>nicht dein Benutzername</li><li>Tipp: drei Wörter mit Bindestrich und eine Zahl, z. B. <i>Ball-Tor-Wolke-7</i></li></ul>`;
  const head = (eyebrow, title, lede) => `<section class="authhead"><div class="authshirt">${LZ.shirt("")}</div>
    <p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</section>`;

  /* ---------- Anmelden ---------- */
  LZ.views.login = () => `${head(esc(LZ.teamLabel()), "Anmelden", "Melde dich mit deinem Benutzernamen und deinem Passwort an.")}
    <form class="card stack authform" data-form="doLogin" novalidate>
      <div class="fld"><label for="auth-u">Benutzername oder E-Mail</label>
        <input id="auth-u" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="120" value="${esc(F.u)}" required></div>
      ${pwInput("auth-p", "Passwort", "current-password", F.p)}
      ${showToggle}${errP()}
      <button class="btn wide" type="submit" ${F.busy ? "disabled" : ""}>${F.busy ? "Einen Moment …" : "Anmelden"}</button>
    </form>
    <p class="small authnote"><b>Zum ersten Mal hier?</b> Gib deinen Benutzernamen und den Code von deinem Trainer ein (z. B. K7MP-3QX9). Danach legst du dein eigenes Passwort fest.</p>
    <p class="small authnote"><button class="linkbtn" data-act="forgotStart">Passwort vergessen?</button></p>`;

  LZ.actions.doLogin = async () => {
    if (F.busy) return;
    if (!F.u.trim() || !F.p) { F.err = "Bitte Benutzername und Passwort eingeben."; LZ.render(); return; }
    F.busy = true; F.err = ""; LZ.render();
    const r = await LZ.Store.signIn(F.u.trim(), F.p);
    F.busy = false; F.p = "";
    if (!r.ok) { F.err = r.error || "Anmeldung hat nicht geklappt."; LZ.render(); focus("auth-p"); return; }
    if (r.state === "setpw") { reset(); LZ.render(); focus("auth-p"); return; }
    done();
  };

  /* ---------- Passwort vergessen (ab 0.34.0) ---------- */
  LZ.publicViews = (LZ.publicViews || []).concat(["forgot", "pwreset", "mailverify"]);
  const R = { login: "", sent: false, test: false, valid: null, user: "", done: false };
  LZ.actions.forgotStart = () => { Object.assign(R, { login: F.u || "", sent: false, test: false }); F.err = ""; LZ.go("forgot"); };
  LZ.actions.forgotBack = () => { reset(); LZ.go("home"); };
  LZ.views.forgot = () => `${head("Passwort vergessen", "Neues Passwort anfordern", "")}
    <section class="card stack authform"><p><b>Spieler:</b> Dein Trainer gibt dir einen neuen Code. Damit legst du ein neues Passwort fest.</p>
      <p><b>Trainer und Admins:</b> Wenn du unter „Mein Konto“ eine E-Mail-Adresse hinterlegt hast, schicken wir dir einen Link (30 Minuten gültig).</p></section>
    ${R.sent ? `<section class="card stack authform"><p class="okmsg" role="status">Wenn zu diesem Konto eine bestätigte E-Mail-Adresse gehört, ist der Link jetzt unterwegs. Schau auch im Spam-Ordner nach.</p>
        ${R.test ? `<p class="small">Testmodus (kein Mailserver eingestellt): Die E-Mail liegt als Datei in <code>storage/mail-outbox/</code>.</p>` : ""}</section>`
      : `<form class="card stack authform" data-form="doForgot" novalidate>
      <div class="fld"><label for="fg-login">Benutzername oder E-Mail</label><input id="fg-login" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="120" value="${esc(R.login)}" required></div>
      ${errP()}<button class="btn wide" type="submit" ${F.busy ? "disabled" : ""}>Link anfordern</button></form>`}
    <p class="authnote"><button class="linkbtn" data-act="forgotBack">‹ Zur Anmeldung</button></p>`;
  LZ.actions.doForgot = async () => {
    if (F.busy) return;
    const v = (document.getElementById("fg-login") || {}).value || ""; R.login = v;
    if (!v.trim()) { F.err = "Bitte Benutzername oder E-Mail eingeben."; LZ.render(); return; }   // gleiche Eingabe wie bei der Anmeldung
    F.busy = true; F.err = ""; LZ.render();
    const r = await LZ.Store.send("reset.php", { action: "request", login: v.trim() });
    F.busy = false;
    if (!r.ok) { F.err = r.error || "Das hat nicht geklappt."; LZ.render(); return; }
    R.sent = true; R.test = !!r.testmode; LZ.render();
  };
  async function checkReset() {
    const r = await LZ.Store.send("reset.php", { action: "check", token: LZ.S.arg });
    R.valid = !!(r && r.ok && r.valid); R.user = (r && r.username) || ""; R.min = (r && r.minLen) || 14; LZ.render();
  }
  LZ.on("ready", () => { if (LZ.S.view === "pwreset") checkReset(); if (LZ.S.view === "mailverify") verifyMail(); });
  LZ.views.pwreset = () => {
    if (R.done) return `${head("Passwort vergessen", "Passwort geändert", "Du kannst dich jetzt mit dem neuen Passwort anmelden. Alle anderen Geräte sind abgemeldet.")}
      <p class="authnote"><button class="btn" data-act="forgotBack">Zur Anmeldung</button></p>`;
    if (R.valid === null) return `${head("Passwort vergessen", "Einen Moment …", "")}`;
    if (!R.valid) return `${head("Passwort vergessen", "Link nicht mehr gültig", "Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.")}
      <p class="authnote"><button class="btn" data-act="forgotStart">Neuen Link anfordern</button></p>`;
    return `${head("Passwort vergessen", "Neues Passwort festlegen", `Für den Zugang <b>${esc(R.user)}</b>.`)}
    <form class="card stack authform" data-form="doReset" novalidate>
      <input type="text" autocomplete="username" value="${esc(R.user)}" hidden>
      ${pwInput("auth-p", "Neues Passwort", "new-password", F.p)}
      ${pwInput("auth-p2", "Passwort wiederholen", "new-password", F.p2)}
      ${showToggle}<ul class="rules"><li>mindestens ${R.min} Zeichen</li><li>Groß- und Kleinbuchstaben, mindestens eine Zahl und ein Sonderzeichen</li><li>nicht dein Benutzername</li></ul>${errP()}
      <button class="btn wide" type="submit" ${F.busy ? "disabled" : ""}>Passwort speichern</button></form>`;
  };
  LZ.actions.doReset = async () => {
    if (F.busy) return;
    if (F.p !== F.p2) { F.err = "Die beiden Passwörter sind nicht gleich."; LZ.render(); return; }
    F.busy = true; F.err = ""; LZ.render();
    const r = await LZ.Store.send("reset.php", { action: "reset", token: LZ.S.arg, password: F.p, password2: F.p2 });
    F.busy = false;
    if (!r.ok) { F.err = r.error || "Das hat nicht geklappt."; LZ.render(); return; }
    reset(); F.u = r.username || ""; R.done = true; LZ.S.arg = null; LZ.render();
  };
  const V = { state: "wait", err: "" };
  async function verifyMail() {
    const r = await LZ.Store.send("reset.php", { action: "verify", token: LZ.S.arg });
    V.state = r && r.ok ? "ok" : "bad"; V.err = (r && r.error) || ""; LZ.S.arg = null; LZ.render();
  }
  LZ.views.mailverify = () => V.state === "wait" ? head("E-Mail bestätigen", "Einen Moment …", "")
    : `${head("E-Mail bestätigen", V.state === "ok" ? "Danke – bestätigt" : "Das hat nicht geklappt", V.state === "ok" ? "Deine E-Mail-Adresse ist jetzt für „Passwort vergessen“ hinterlegt." : esc(V.err))}
      <p class="authnote"><button class="btn" data-act="forgotBack">Weiter</button></p>`;

  /* E-Mail für „Passwort vergessen“ – Karte für „Mein Konto“ (Trainer) und die Verwaltung (Admins) */
  const M = { data: null, edit: false, email: "", pw: "", err: "", msg: "", busy: false };
  async function loadMail() { const r = await LZ.Store.get("mymail.php"); if (r && r.ok) { M.data = r; LZ.render(); } }
  LZ.mailCard = () => {
    if (LZ.Store.mode !== "api" || !LZ.Store.account) return "";
    if (!M.data) { loadMail(); return `<section class="card stack"><h2>E-Mail für „Passwort vergessen“</h2><p class="small">Lade …</p></section>`; }
    const d = M.data;
    return `<section class="card stack" id="mailcard"><h2>E-Mail für „Passwort vergessen“</h2>
      <p class="small">Freiwillig. Damit kannst du dich auch mit deiner E-Mail-Adresse anmelden und dir bei vergessenem Passwort selbst einen Link schicken. Nach dem Speichern bekommst du eine E-Mail – erst mit dem Klick auf den Link darin ist die Adresse aktiv.</p>
      <p>${d.email ? `Hinterlegt: <b>${esc(d.email)}</b>` : "Noch keine Adresse hinterlegt."}${d.pending ? `<br><span class="small">Wartet auf Bestätigung: <b>${esc(d.pending)}</b> – bitte den Link in der E-Mail anklicken.</span>` : ""}</p>
      ${M.edit || (!d.email && !d.pending) ? `<form class="stack" data-form="mailSave" novalidate>
        <div class="fld"><label for="mc-email">E-Mail-Adresse</label><input id="mc-email" type="email" autocomplete="email" maxlength="120" value="${esc(M.email)}"></div>
        <div class="fld"><label for="mc-pw">Dein aktuelles Passwort (zur Sicherheit)</label><input id="mc-pw" type="password" autocomplete="current-password" maxlength="200"></div>
        ${M.err ? `<p class="err" role="alert" style="text-align:left">${esc(M.err)}</p>` : ""}
        <div class="row"><button class="btn" type="submit" ${M.busy ? "disabled" : ""}>Speichern</button>${d.email ? `<button class="btn ghost" type="button" data-act="mailRemove">Adresse löschen</button>` : ""}${d.email || d.pending ? `<button class="btn ghost" type="button" data-act="mailEdit" data-v="0">Abbrechen</button>` : ""}</div></form>`
        : `<div class="row"><button class="btn ghost" data-act="mailEdit" data-v="1">${d.email || d.pending ? "Ändern" : "E-Mail hinterlegen"}</button></div>`}
      ${M.msg ? `<p class="okmsg" role="status">${esc(M.msg)}</p>` : ""}</section>`;
  };
  LZ.actions.mailEdit = (b, v) => { M.edit = v === "1"; M.email = (M.data && (M.data.pending || M.data.email)) || ""; M.err = ""; M.msg = ""; LZ.render(); };
  const mailSend = async body => {
    const password = (document.getElementById("mc-pw") || {}).value || "";   // vor dem Neuzeichnen lesen
    M.busy = true; M.err = ""; LZ.render();
    const r = await LZ.Store.send("mymail.php", Object.assign({ password }, body));
    M.busy = false;
    if (!r.ok) { M.err = r.error || "Das hat nicht geklappt."; LZ.render(); return; }
    M.data.email = r.email; M.data.pending = r.pending; M.edit = false;
    M.msg = body.action === "remove" ? "Adresse gelöscht." : r.testmode ? "Gespeichert. Testmodus: Die E-Mail liegt in storage/mail-outbox/." : `Gespeichert. Wir haben eine E-Mail an ${body.email} geschickt – bitte den Link darin anklicken.`;
    LZ.render();
  };
  LZ.actions.mailSave = () => { M.email = (document.getElementById("mc-email") || {}).value || ""; mailSend({ action: "set", email: M.email.trim() }); };
  LZ.actions.mailRemove = () => mailSend({ action: "remove" });

  /* ---------- Eigenes Passwort festlegen ---------- */
  LZ.views.setpw = () => `${head("Erste Anmeldung", "Dein eigenes Passwort", `Hallo <b>${esc((LZ.Store.pending || {}).username || "")}</b>! Lege jetzt ein Passwort fest, das nur du kennst.`)}
    <form class="card stack authform" data-form="doSetPw" novalidate>
      <input type="text" autocomplete="username" value="${esc((LZ.Store.pending || {}).username || "")}" hidden>
      ${pwInput("auth-p", "Neues Passwort", "new-password", F.p)}
      ${pwInput("auth-p2", "Passwort wiederholen", "new-password", F.p2)}
      ${showToggle}${rules()}${errP()}
      <button class="btn wide" type="submit" ${F.busy ? "disabled" : ""}>Passwort speichern</button>
    </form>
    <p class="authnote"><button class="linkbtn" data-act="authCancel">Abbrechen</button></p>`;

  LZ.actions.doSetPw = async () => {
    if (F.busy) return;
    if (F.p !== F.p2) { F.err = "Die beiden Passwörter sind nicht gleich."; LZ.render(); return; }
    F.busy = true; F.err = ""; LZ.render();
    const r = await LZ.Store.setPassword(F.p, F.p2);
    F.busy = false;
    if (!r.ok) { F.err = r.error || "Speichern hat nicht geklappt."; LZ.render(); return; }
    done();
  };
  LZ.actions.authCancel = async () => { await LZ.Store.cancelPending(); reset(); LZ.render(); };

  /* ---------- Erstes Trainer-Konto (nur localhost) ---------- */
  LZ.views.setup = () => `${head("Einrichtung", "Verein und erstes Trainer-Konto", "Noch gibt es keinen Verein. Lege deinen Verein, die erste Mannschaft und dein Konto an – du wirst Admin und kannst danach Spieler, Trainer und weitere Mannschaften anlegen.")}
    <form class="card stack authform" data-form="doSetup" novalidate>
      <div class="fld"><label for="auth-club">Verein</label><input id="auth-club" autocomplete="organization" maxlength="60" placeholder="z. B. SV Musterstadt" value="${esc(F.club)}" required></div>
      <div class="fld"><label for="auth-team">Mannschaft</label><input id="auth-team" maxlength="40" placeholder="z. B. U14" value="${esc(F.team)}" required></div>
      <div class="fld"><label for="auth-name">Dein Vorname</label><input id="auth-name" autocomplete="given-name" maxlength="30" value="${esc(F.name)}" required></div>
      <div class="fld"><label for="auth-u">Benutzername</label><input id="auth-u" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" placeholder="z. B. stojan" value="${esc(F.u)}" required></div>
      ${pwInput("auth-p", "Passwort", "new-password", F.p)}
      ${pwInput("auth-p2", "Passwort wiederholen", "new-password", F.p2)}
      ${showToggle}${rules()}${errP()}
      <button class="btn wide" type="submit" ${F.busy ? "disabled" : ""}>Konto anlegen</button>
    </form>`;

  LZ.actions.doSetup = async () => {
    if (F.busy) return;
    if (F.p !== F.p2) { F.err = "Die beiden Passwörter sind nicht gleich."; LZ.render(); return; }
    F.busy = true; F.err = ""; LZ.render();
    const r = await LZ.Store.setupFirst(F.name.trim(), F.u.trim(), F.p, F.p2, F.club.trim(), F.team.trim());
    F.busy = false;
    if (!r.ok) { F.err = r.error || "Anlegen hat nicht geklappt."; LZ.render(); return; }
    done();
  };

  /* ---------- Passwort ändern (angemeldet) ---------- */
  LZ.views.pwchange = () => `<button class="back" data-act="pwBack">‹ Zurück</button>
    <section><p class="eyebrow">Konto${LZ.Store.account ? " · " + esc(LZ.Store.account.username) : ""}</p><h1>Passwort ändern</h1>
    <p class="lede">Danach bist du auf allen anderen Geräten abgemeldet.</p></section>
    <form class="card stack authform" data-form="doPwChange" novalidate>
      <input type="text" autocomplete="username" value="${esc((LZ.Store.account || {}).username || "")}" hidden>
      ${pwInput("auth-old", "Bisheriges Passwort", "current-password", F.old)}
      ${pwInput("auth-p", "Neues Passwort", "new-password", F.p)}
      ${pwInput("auth-p2", "Neues Passwort wiederholen", "new-password", F.p2)}
      ${showToggle}${rules()}${errP()}${F.msg ? `<p class="okmsg" role="status">${esc(F.msg)}</p>` : ""}
      <button class="btn wide" type="submit" ${F.busy ? "disabled" : ""}>Passwort ändern</button>
    </form>`;

  LZ.actions.pwStart = () => { reset(); F.back = LZ.S.view; LZ.go("pwchange"); };
  LZ.actions.pwBack = () => { reset(); if (F.back === "coach" && LZ.actions.kaderStart) LZ.actions.kaderStart(); else if (F.back === "verwaltung") LZ.go("verwaltung"); else LZ.go("me"); };
  LZ.actions.doPwChange = async () => {
    if (F.busy) return;
    if (F.p !== F.p2) { F.err = "Die beiden neuen Passwörter sind nicht gleich."; LZ.render(); return; }
    F.busy = true; F.err = ""; F.msg = ""; LZ.render();
    const r = await LZ.Store.changePassword(F.old, F.p, F.p2);
    F.busy = false;
    if (!r.ok) { F.err = r.error || "Ändern hat nicht geklappt."; LZ.render(); return; }
    reset(); F.msg = "Dein Passwort ist geändert."; LZ.render();
  };

  /* Knopf in Mein Bereich */
  LZ.on("meBottom", () => LZ.Store.mode === "api" && LZ.Store.account
    ? `<p class="small" style="text-align:center">Angemeldet als <b>${esc(LZ.Store.account.username)}</b> · <button class="linkbtn" data-act="pwStart">Passwort ändern</button></p>` : "");

  /* ---------- Nach der Anmeldung ---------- */
  function done() {
    reset(); F.u = ""; F.name = "";
    LZ.S.user = LZ.Store.currentUser || null;
    LZ.go("home");
  }
  function focus(id) { setTimeout(() => { const el = document.getElementById(id); if (el) el.focus(); }, 0); }

  /* Formulare: Enter schickt ab, Passwort-Manager funktionieren */
  document.addEventListener("submit", e => {
    const f = e.target.closest("form[data-form]"); if (!f) return;
    e.preventDefault();
    if (LZ.actions[f.dataset.form]) LZ.actions[f.dataset.form]();
  });
  LZ.inputs.push(e => {
    const id = e.target.id;
    if (id === "auth-u") F.u = e.target.value;
    else if (id === "auth-p") F.p = e.target.value;
    else if (id === "auth-p2") F.p2 = e.target.value;
    else if (id === "auth-old") F.old = e.target.value;
    else if (id === "auth-name") F.name = e.target.value;
    else if (id === "auth-club") F.club = e.target.value;
    else if (id === "auth-team") F.team = e.target.value;
    else if (id === "auth-show" && e.type === "change") {
      F.show = e.target.checked;
      document.querySelectorAll(".authform input[id^='auth-p'], .authform input#auth-old").forEach(el => { el.type = F.show ? "text" : "password"; });
    }
  });
})();
