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
      <div class="fld"><label for="auth-u">Benutzername</label>
        <input id="auth-u" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" value="${esc(F.u)}" required></div>
      ${pwInput("auth-p", "Passwort", "current-password", F.p)}
      ${showToggle}${errP()}
      <button class="btn wide" type="submit" ${F.busy ? "disabled" : ""}>${F.busy ? "Einen Moment …" : "Anmelden"}</button>
    </form>
    <p class="small authnote"><b>Zum ersten Mal hier?</b> Gib deinen Benutzernamen und den Code von deinem Trainer ein (z. B. K7MP-3QX9). Danach legst du dein eigenes Passwort fest.</p>
    <p class="small authnote">Passwort vergessen? Dein Trainer gibt dir einen neuen Code.</p>`;

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
