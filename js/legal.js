/*
 * Lernzone – Rechtliches (ab 0.23.0): Impressum, Datenschutzerklärung, Regeln für Kinder, Einwilligung der Eltern (Druckvorlage)
 * Alle Seiten sind auch ohne Anmeldung erreichbar (Fußzeile). Angaben zu Betreiber und Vereinen: api/legal.php
 * (Pflege: Verwaltung → Plattform bzw. Verein). Weg A (ohne PHP) zeigt Platzhalter.
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const L = { data: null, at: 0, club: 0 };
  const PAGES = ["impressum", "datenschutz", "regeln", "einwilligung"];
  LZ.legalPages = PAGES;

  async function load(force) {
    if (!force && L.data && Date.now() - L.at < 60000) return;
    const r = LZ.Store.mode === "api" ? await LZ.Store.get("legal.php") : null;
    L.data = r && r.ok ? r : { operator: {}, clubs: [], myClub: null, updated: "" };
    L.at = Date.now();
    if (PAGES.includes(LZ.S.view) || LZ.S.view === "verwaltung") LZ.render();
  }
  LZ.legal = { load, get: () => L.data };
  LZ.on("enter", v => { if (PAGES.includes(v)) { load(); window.scrollTo(0, 0); } });
  LZ.actions.legal = (b, v) => LZ.go(v);
  LZ.actions.legalBack = () => LZ.go("home");
  LZ.actions.legalPrint = () => window.print();

  const nl = s => esc(s || "").replace(/\n/g, "<br>");
  const missing = what => `<span class="legal-missing">${what} wird noch ergänzt</span>`;
  const head = (eyebrow, title) => `<button class="back noprint" data-act="legalBack">‹ Zurück</button>
    <section><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></section>`;
  const op = () => (L.data || {}).operator || {};
  const opBlock = () => {
    const o = op();
    return o.name ? `<p>${esc(o.name)}<br>${esc(o.street)}<br>${esc(o.city)}</p>` : `<p>${missing("Name und Anschrift des Betreibers")}</p>`;
  };
  const myClubs = () => {
    const d = L.data || { clubs: [] };
    const mine = d.clubs.filter(c => c.id === d.myClub);
    return mine.length ? mine : d.clubs;
  };
  const clubBlock = c => `<div class="legal-club"><p><b>${esc(c.legalName || c.name)}</b>${c.address ? "<br>" + nl(c.address) : "<br>" + missing("Anschrift")}</p>
    <p>Kontakt Datenschutz: ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : missing("E-Mail")}${c.dpo ? `<br>Datenschutzbeauftragte/r: ${nl(c.dpo)}` : ""}</p></div>`;
  const loading = () => !L.data ? `<p class="small">Lade …</p>` : "";

  /* ---------- Impressum ---------- */
  LZ.views.impressum = () => {
    const o = op();
    return `${head("Rechtliches", "Impressum")}${loading()}
    <section class="card stack legal">
      <h2>Angaben gemäß § 5 DDG</h2>
      ${opBlock()}
      <h2>Kontakt</h2>
      <p>E-Mail: ${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : missing("E-Mail")}${o.phone ? `<br>Telefon: ${esc(o.phone)}` : ""}</p>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      ${opBlock()}
      <h2>Inhalte der Vereine</h2>
      <p>Die Lernzone ist eine Plattform für Fußballvereine. Für die Daten und Inhalte ihrer Mannschaften (Kader, Termine, Trainingsinhalte, Bewertungen) ist der jeweilige Verein verantwortlich – siehe <button class="linkbtn" data-act="legal" data-v="datenschutz">Datenschutzerklärung</button>.</p>
      <h2>Schriften</h2>
      <p class="small">Barlow Condensed und Source Sans 3, SIL Open Font License 1.1, lokal eingebunden.</p>
    </section>`;
  };

  /* ---------- Datenschutzerklärung ---------- */
  LZ.views.datenschutz = () => {
    const o = op(), d = L.data || {};
    return `${head("Rechtliches", "Datenschutz")}${loading()}
    <section class="card stack legal">
      <p class="lede">Die Lernzone ist für Kinder und Jugendliche gemacht. Deshalb speichern wir so wenig wie möglich, zeigen Kindern nie die Daten anderer Kinder und verzichten auf Werbung, Tracking und Analyse-Werkzeuge.</p>
      ${d.updated ? `<p class="small">Stand: ${esc(d.updated)}</p>` : ""}

      <h2>1. Verantwortlich</h2>
      <p>Verantwortlich im Sinne der DSGVO ist der Verein, in dessen Mannschaft du bist:</p>
      ${myClubs().map(clubBlock).join("") || `<p>${missing("Der Verein")}</p>`}

      <h2>2. Betreiber der Plattform</h2>
      <p>Die Lernzone wird technisch betrieben von:</p>${opBlock()}
      <p>Der Betreiber verarbeitet die Daten nur im Auftrag der Vereine (Art. 28 DSGVO) und nutzt sie nicht für eigene Zwecke.</p>
      <p>Hosting: ${o.host ? nl(o.host) : missing("Der Hosting-Anbieter")}</p>

      <h2>3. Welche Daten wir verarbeiten</h2>
      <h3>Alle Nutzer</h3>
      <ul><li>Benutzername, Passwort (nur verschlüsselt als Hash – niemand kann es lesen), Mannschaft und Rolle</li>
        <li>Zeitpunkt der letzten Anmeldung, falsche Anmeldeversuche und Sperren (Schutz vor Missbrauch)</li>
        <li>Sicherheitsprotokoll: Anmeldungen, Fehlversuche, Sperren, neue Einmal-Codes sowie Änderungen an Konten und Rechten – mit einer Kennung des Netzes. Die IP-Adresse wird dabei nie im Klartext gespeichert, sondern nur als Prüfwert (Hash mit geheimem Schlüssel).</li></ul>
      <h3>Spielerinnen und Spieler</h3>
      <ul><li>Trikotnummer, Torwart oder Feldspieler, Positionen (vom Trainer festgelegt)</li>
        <li>Lernfortschritt in der App (Quiz-Ergebnisse)</li>
        <li>Trainingsbeteiligung und Absagen (Grund aus einer festen Auswahl, kein Freitext)</li>
        <li>Aufstellungen, Taktiktafeln und Spielminuten</li>
        <li>Individueller Entwicklungsplan: Ziele und Zeitplan (sieht auch das Kind); Einschätzungen und Notizen der Trainer (nur Trainer)</li>
        <li>Bewertungen nach dem Training in Verhalten, Umsetzung, Soziales und kurze Notizen der Trainer (nur Trainer)</li></ul>
      <h3>Nur mit Einwilligung der Eltern</h3>
      <ul><li>Profil: Vor- und Nachname, starker Fuß, Wunschposition, Vorbild, Saisonziel, Trikot- und Schuhgröße, Schulschluss</li>
        <li>Befindens-Barometer: Laune, Schlaf, Energie, Hinweis „nicht fit“, Belastung nach dem Training, freiwilliger Kommentar</li>
        <li>Selbsteinschätzung nach Spielen</li></ul>
      <p>Bis die Einwilligung da ist, sind diese Bereiche gesperrt. „Nicht fit“ ist nur ein Hinweis an den Trainer – Krankheiten oder Diagnosen werden nicht abgefragt.</p>
      <h3>Trainerinnen und Trainer</h3>
      <ul><li>Vorname, Benutzername, Mannschaften, Abwesenheiten bei Terminen</li>
        <li>Trainingspläne und Übungen, auch als hochgeladenes PDF</li>
        <li>Einträge im Trainer-Wissen (wer zuletzt geändert hat); Verweise auf Material öffnen die Seite des jeweiligen Anbieters, z. B. Google Drive</li></ul>

      <h2>4. Wozu und auf welcher Rechtsgrundlage</h2>
      <ul><li><b>Trainings- und Spielbetrieb, sportliche Ausbildung</b> im Rahmen der Vereinsmitgliedschaft: Art. 6 Abs. 1 lit. b DSGVO; Organisation und Planung durch den Verein: Art. 6 Abs. 1 lit. f DSGVO</li>
        <li><b>Profil, Befindens-Barometer, Selbsteinschätzung:</b> Einwilligung der Erziehungsberechtigten, Art. 6 Abs. 1 lit. a DSGVO; für den Hinweis „nicht fit“ zusätzlich Art. 9 Abs. 2 lit. a DSGVO. Die Einwilligung ist freiwillig und kann jederzeit für die Zukunft widerrufen werden – beim Trainer oder beim Verein.</li>
        <li><b>Sicherheit</b> (Anmeldung, Sperre nach Fehlversuchen, Protokolle): Art. 6 Abs. 1 lit. f DSGVO und Art. 32 DSGVO</li></ul>

      <h2>5. Wer was sieht</h2>
      <ul><li>Kinder sehen nur ihre eigenen Daten – nie die anderer Kinder.</li>
        <li>Die Trainer einer Mannschaft sehen die Daten ihrer Spielerinnen und Spieler.</li>
        <li>Die Vereinsadmins (z. B. Jugendleitung) sehen alle Mannschaften ihres Vereins.</li>
        <li>Der Betreiber hat nur technischen Zugriff (z. B. für Fehlerbehebung und Sicherungen) und sieht das Sicherheitsprotokoll; die Vereinsadmins sehen es für ihren Verein.</li>
        <li>Es gibt keine Weitergabe an Dritte, keine Werbung und kein Tracking.</li></ul>

      <h2>6. Cookies und Speicher im Browser</h2>
      <p>Wir setzen nur ein einziges, technisch notwendiges Cookie („lernzone“). Es hält dich angemeldet (bis zum Abmelden, höchstens 30 Tage) und enthält keine persönlichen Daten außer einer zufälligen Sitzungsnummer. Dafür ist keine Einwilligung nötig (§ 25 Abs. 2 Nr. 2 TDDDG) – deshalb gibt es kein Cookie-Banner.</p>

      <h2>7. Externe Dienste</h2>
      <ul><li><b>Schriften</b> liegen auf unserem Server – es wird keine Verbindung zu Google Fonts aufgebaut.</li>
        <li><b>Termine:</b> Unser Server liest den öffentlichen Mannschaftskalender (Google Kalender) ein. Dabei werden keine Daten von dir an Google übertragen.</li>
        <li><b>Ortsangaben</b> sind Links zu Google Maps. Erst wenn du darauf tippst, öffnet sich Google Maps; dann gilt die Datenschutzerklärung von Google.</li></ul>

      <h2>8. Server-Protokolle</h2>
      <p>${o.logs ? nl(o.logs) : "Beim Aufruf der Seite speichert der Webserver technische Protokolle (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser). Sie dienen nur der Sicherheit und Fehlersuche und werden automatisch gelöscht."}</p>

      <h2>9. Wie lange wir Daten speichern</h2>
      <p>Solange das Kind in der Mannschaft ist. Verlässt es die Mannschaft, löscht der Trainer es aus dem Kader – damit werden alle zugehörigen Daten gelöscht. Trainer-Konten werden gelöscht, wenn sie keiner Mannschaft mehr angehören. Das Sicherheitsprotokoll wird nach 90 Tagen gelöscht, Sperren von Netzen nach 24 Stunden. Auf Wunsch löschen wir früher.</p>

      <h2>10. Sicherheit</h2>
      <p>Verschlüsselte Verbindung (HTTPS), Passwörter nur als Argon2id-Hash, Sperre nach mehreren Fehlversuchen pro Konto und pro Netz, Sicherheitsprotokoll, automatische Abmeldung von Trainern nach 8 Stunden ohne Aktivität, Schutz vor fremden Anfragen (CSRF), Daten jeder Mannschaft in einer eigenen Datei.</p>

      <h2>11. Deine Rechte</h2>
      <p>Du (bzw. deine Eltern) kannst jederzeit Auskunft verlangen, welche Daten gespeichert sind, und Berichtigung, Löschung, Einschränkung, Übertragung der Daten oder Widerspruch verlangen (Art. 15–21 DSGVO). Eine Einwilligung kann jederzeit widerrufen werden (Art. 7 Abs. 3 DSGVO). Wende dich dafür an deinen Verein (siehe 1).</p>
      <p>Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Für Vereine in Bayern ist das das Bayerische Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach.</p>
      <p class="noprint"><button class="linkbtn" data-act="legal" data-v="einwilligung">Einwilligung der Eltern (Formular zum Ausdrucken)</button> · <button class="linkbtn" data-act="legal" data-v="regeln">Regeln für Kinder</button></p>
    </section>`;
  };

  /* ---------- Regeln für Kinder ---------- */
  LZ.views.regeln = () => `${head("Für dich", "Regeln in der Lernzone")}
    <section class="card stack legal">
      <ol class="rules-kids">
        <li><b>Dein Konto gehört nur dir.</b> Sag dein Passwort niemandem – auch nicht deinen Freunden.</li>
        <li><b>Fremdes Handy oder Tablet?</b> Melde dich danach wieder ab.</li>
        <li><b>Niemand anderes sieht deine Sachen.</b> Was du hier machst, sehen nur deine Trainer. Andere Kinder sehen nichts von dir – und du nichts von ihnen.</li>
        <li><b>Profil und Barometer sind freiwillig.</b> Sie gehen erst, wenn deine Eltern einverstanden sind.</li>
        <li><b>Schreib nichts über andere Kinder</b> in Kommentare – und nichts Gemeines.</li>
        <li><b>Sag ehrlich und rechtzeitig ab</b>, wenn du nicht zum Training kommen kannst.</li>
        <li><b>Komisch?</b> Jemand kennt dein Passwort oder du siehst Daten, die nicht deine sind? Sag sofort deinem Trainer Bescheid.</li>
      </ol>
      <h2>Was mit deinen Daten passiert</h2>
      <ul><li>Deine Trainer sehen, was du gelernt hast, wie oft du da warst und woran du arbeitest – damit sie dir besser helfen können.</li>
        <li>Es gibt keine Werbung und niemand verkauft deine Daten.</li>
        <li>Wenn du die Mannschaft verlässt, wird alles gelöscht.</li>
        <li>Du und deine Eltern dürft jederzeit fragen, was gespeichert ist.</li></ul>
      <p class="small noprint">Genauer steht es in der <button class="linkbtn" data-act="legal" data-v="datenschutz">Datenschutzerklärung</button>.</p>
    </section>`;

  /* ---------- Einwilligung der Eltern (Druckvorlage) ---------- */
  LZ.views.einwilligung = () => {
    const d = L.data || { clubs: [] }, team = (LZ.Store.coach || {}).team;
    const clubs = d.clubs;
    const club = clubs.find(c => c.id === (L.club || d.myClub)) || (clubs.length === 1 ? clubs[0] : null);
    const line = label => `<div class="sigline"><span></span><small>${label}</small></div>`;
    return `${head("Für Eltern", "Einwilligung")}${loading()}
    <div class="noprint chiprow">${clubs.length > 1 ? `<label class="small">Verein <select id="consent-club">${clubs.map(c => `<option value="${c.id}" ${club && c.id === club.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>` : ""}
      <button class="btn" data-act="legalPrint">Drucken</button></div>
    <section class="card stack legal printable">
      <h2>Einwilligung in die Nutzung der Lernzone</h2>
      <p><b>Verein:</b> ${club ? esc(club.legalName || club.name) : "______________________________"} &nbsp; <b>Mannschaft:</b> ${team && club && team.clubId === club.id ? esc(team.name) : "__________"}</p>
      ${line("Vor- und Nachname des Kindes")}
      <p>Die Lernzone wird im Training ohne diese Einwilligung genutzt (Lerninhalte, Termine, Absagen, Trainingsbeteiligung). Die folgenden Bereiche schaltet der Trainer <b>erst nach dieser Einwilligung</b> frei:</p>
      <ul><li><b>Profil:</b> Vor- und Nachname, starker Fuß, Wunschposition, Vorbild, Saisonziel, Trikot- und Schuhgröße, Schulschluss</li>
        <li><b>Befindens-Barometer</b> vor und nach dem Training: Laune, Schlaf, Energie, Belastung, freiwilliger Kommentar sowie ein Hinweis „nicht fit“</li>
        <li><b>Selbsteinschätzung</b> nach Spielen</li></ul>
      <p>Diese Angaben sehen nur die Trainer der Mannschaft und die Vereinsadmins (z. B. Jugendleitung) – nie andere Kinder. Sie dienen der sportlichen Betreuung und werden gelöscht, wenn das Kind die Mannschaft verlässt.</p>
      <label class="check"><span class="box">☐</span> Ich willige / Wir willigen ein, dass die oben genannten Angaben in der Lernzone verarbeitet werden (Art. 6 Abs. 1 lit. a DSGVO).</label>
      <label class="check"><span class="box">☐</span> Ich willige / Wir willigen ausdrücklich ein, dass dabei auch der Hinweis „nicht fit“ verarbeitet wird – eine Angabe mit Gesundheitsbezug (Art. 9 Abs. 2 lit. a DSGVO). Diagnosen oder Krankheiten werden nicht abgefragt.</label>
      <p>Die Einwilligung ist freiwillig. Ohne sie entstehen keine Nachteile – das Kind kann die Lernzone und das Training ganz normal nutzen. Sie kann jederzeit ohne Angabe von Gründen beim Trainer oder beim Verein für die Zukunft widerrufen werden. Weitere Informationen: Datenschutzerklärung der Lernzone.</p>
      <div class="sigrow">${line("Ort, Datum")}${line("Unterschrift Erziehungsberechtigte/r")}</div>
      <div class="sigrow">${line("")}${line("Unterschrift zweite/r Erziehungsberechtigte/r")}</div>
      <div class="sigrow">${line("Kenntnis genommen: Unterschrift des Kindes")}</div>
    </section>`;
  };
  LZ.inputs.push(e => { if (e.target.id === "consent-club" && e.type === "change") { L.club = +e.target.value; LZ.render(); } });
})();
