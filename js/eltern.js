/*
 * Lernzone – Eltern-Zugang (ab 0.37.0, nur Weg B)
 * Eltern sehen nur ihr eigenes Kind: Termine mit Absage, Kader-Status bekannt gegebener Spiele, Lernfortschritt (Quiz),
 * und können die Einwilligung digital erteilen oder widerrufen. Nicht: Befinden, Profil, IEP, Noten, Spielzeiten, andere Kinder.
 * Daten: api/parent.php (lesen, Kind wechseln, Einwilligung), api/absence.php (Absagen, gleiche Regeln wie für das Kind)
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const P = { d: null, err: "", abs: null, absErr: "", busy: false, ask: false, c1: false, c2: false, msg: "" };
  const on = () => LZ.parentMode && LZ.parentMode();
  const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const day = iso => (LZ.calendar ? LZ.calendar.dayName(iso) : fmtDate(iso));
  const where = loc => loc ? (LZ.mapLink ? LZ.mapLink(loc) : esc(loc)) : "";

  async function load() {
    if (!on()) return;
    const r = await LZ.Store.get("parent.php");
    if (r && r.ok) { P.d = r; P.err = ""; if (r.parent) LZ.Store.parent = r.parent; } else P.err = (r && r.error) || "Daten konnten nicht geladen werden.";
    LZ.render();
  }
  LZ.on("enter", v => { if (on() && ["home", "me", "elternConsent"].includes(v)) load(); });
  LZ.on("ready", () => { if (on()) load(); });

  const kidName = d => `Nr. ${d.nr}`;
  const head = (title, lede) => `<section>${LZ.area("Eltern")}<h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</section>`;
  const wait = () => P.err ? `<p class="err" role="alert" style="text-align:left">${esc(P.err)}</p>` : `<p class="small">Lade …</p>`;

  /* Mehrere Kinder (Geschwister, auch andere Mannschaften): Umschalter */
  function kids(d) {
    if ((d.children || []).length < 2) return "";
    return `<div class="seg kidseg">${d.children.map(c => { const cur = c.team === (d.team || {}).id && c.nr === d.nr;
      return `<button aria-pressed="${cur}" data-act="elKid" data-t="${c.team}" data-v="${c.nr}">${esc(c.teamName)} · Nr. ${c.nr}</button>`; }).join("")}</div>`;
  }
  LZ.actions.elKid = async b => {
    const r = await LZ.Store.send("parent.php", { action: "switch", team: +b.dataset.t, nr: +b.dataset.v });
    if (r && r.ok) { P.d = r; P.abs = null; if (LZ.reloadContent) LZ.reloadContent(); LZ.render(); } else { P.err = (r && r.error) || "Wechseln hat nicht geklappt."; LZ.render(); }
  };

  function consentShort(d) {
    if (d.consent) return "";
    return `<section class="card stack"><div class="rowspread"><h2>Einwilligung</h2><span class="badge">offen</span></div>
      <p class="small">Profil, Befindens-Barometer und Selbsteinschätzung nach Spielen sind für ${esc(kidName(d))} erst nach Ihrer Einwilligung frei. Alles andere funktioniert auch ohne.</p>
      <div class="row"><button class="btn ghost" data-act="side" data-v="elternConsent">Einwilligung ansehen</button></div></section>`;
  }

  function gamesCard(d) {
    return (d.games || []).map(x => `<section class="card stack kme ${x.status}"><p class="eyebrow">Kader · ${esc(day(x.date))}${x.time ? " · " + esc(x.time) + " Uhr" : ""}</p><h2>${esc(x.title)}</h2>
      ${x.status === "kader" ? `<p class="kbig">✓ ${esc(kidName(d))} ist im Kader</p>` : `<p class="kbig">Diesmal nicht dabei</p>${x.reason ? `<p>Grund: <b>${esc(x.reason)}</b></p>` : ""}<p class="small">Fragen dazu bitte direkt an den Trainer.</p>`}
      ${x.location ? `<p class="small">${where(x.location)}</p>` : ""}</section>`).join("");
  }

  function trainingsCard(d) {
    const list = d.upcoming || [], R = d.reasons || {};
    if (!list.length) return `<section class="card stack"><h2>Trainings</h2><p class="small">In den nächsten zwei Wochen ist kein Training eingetragen.</p></section>`;
    const row = t => {
      const dl = `${fmtDate(t.deadline.slice(0, 10))} ${t.deadline.slice(11, 16)}`;
      let right;
      if (t.cancelled) right = `<span class="abschip">Fällt aus</span>`;
      else if (P.abs === t.id) right = `<div class="reasons">${Object.entries(R).map(([k, l]) => `<button class="btn ghost small-btn" data-act="elAbsSet" data-t="${t.id}" data-v="${k}">${esc(l)}</button>`).join("")}
          <button class="linkbtn" data-act="elAbsCancel">Abbrechen</button></div>`;
      else if (t.absent) right = `<span class="abschip">Abgesagt · ${esc(R[t.absent] || t.absent)}</span>${t.canChange ? `<button class="linkbtn" data-act="elAbsBack" data-t="${t.id}">Doch dabei</button>` : ""}`;
      else right = t.canChange ? `<button class="btn ghost small-btn" data-act="elAbsOpen" data-t="${t.id}">Absagen</button>` : `<span class="small">Absagen nur noch beim Trainer</span>`;
      return `<li class="trrow${t.absent ? " off" : ""}"><div><b>${esc(fmtDate(t.date))}${t.time ? " · " + esc(t.time) : ""}</b><span class="small">${esc(t.title)}${t.location ? " · " + where(t.location) : ""}</span>
        ${!t.absent && !t.cancelled && t.canChange && P.abs !== t.id ? `<span class="small">absagen bis ${esc(dl)} Uhr</span>` : ""}</div><div class="trright">${right}</div></li>`;
    };
    return `<section class="card stack"><h2>Trainings</h2>
      ${P.abs ? `<p class="small"><b>Grund wählen.</b> Der Trainer sieht nur den Grund.</p>` : ""}
      ${P.absErr ? `<p class="err" style="text-align:left">${esc(P.absErr)}</p>` : ""}
      <ul class="trlist">${list.map(row).join("")}</ul>
      <p class="small">Wer nicht absagt, wird als anwesend gezählt. Absagen geht bis 2 Stunden vor Beginn – danach bitte direkt beim Trainer.</p></section>`;
  }
  LZ.actions.elAbsOpen = b => { P.abs = +b.dataset.t; P.absErr = ""; LZ.render(); };
  LZ.actions.elAbsCancel = () => { P.abs = null; P.absErr = ""; LZ.render(); };
  async function absSend(body) {
    if (P.busy) return; P.busy = true;
    const r = await LZ.Store.send("absence.php", body);
    P.busy = false;
    if (!r.ok) { P.absErr = r.error || "Hat nicht geklappt."; LZ.render(); return; }
    P.abs = null; P.absErr = ""; P.d.upcoming = r.upcoming; LZ.render();
  }
  LZ.actions.elAbsSet = b => absSend({ action: "set", id: +b.dataset.t, reason: b.dataset.v });
  LZ.actions.elAbsBack = b => absSend({ action: "withdraw", id: +b.dataset.t });

  function progressCard(d) {
    const C = LZ.C || {}, q = (d.progress && d.progress.quiz) || {};
    const mods = [["zonen", "Spielfeld & Zonen"], ...(C.phases || []).map(x => [x.id, x.title]), ...(C.modules || []).map(x => [x.id, x.title])];
    const done = mods.filter(([id]) => q[id]).length;
    return `<section class="card stack"><div class="rowspread"><h2>Lernfortschritt</h2><span class="small">${done} von ${mods.length} Quiz gemacht</span></div>
      ${mods.map(([id, t]) => { const x = q[id], pc = x && x.of ? Math.round(x.best / x.of * 100) : 0;
        return `<div class="prow"><b>${esc(t)}</b><span>${x ? `${x.best}/${x.of}` : "–"}</span><span class="meter"><b style="width:${pc}%"></b></span></div>`; }).join("")}
      <p class="small">Bestes Ergebnis je Quiz. Die Inhalte sind die Spielphasen aus dem Training.</p></section>`;
  }

  LZ.views.parentHome = () => {
    const d = P.d;
    if (!d) return `${head("Eltern")}${wait()}`;
    return `${head(esc(kidName(d)), "Termine, Absagen, Kader und Lernfortschritt Ihres Kindes.")}
      ${kids(d)}${P.err ? `<p class="err" role="alert" style="text-align:left">${esc(P.err)}</p>` : ""}
      ${consentShort(d)}${gamesCard(d)}${trainingsCard(d)}${progressCard(d)}
      <p class="small">Im Elternzugang sehen Sie nur Ihr eigenes Kind. Befinden, Profil, Entwicklungsplan und Bewertungen bleiben zwischen Kind und Trainer.
        <button class="linkbtn" data-act="legal" data-v="datenschutz">Datenschutz</button></p>`;
  };

  /* ---------- Einwilligung digital ---------- */
  LZ.views.elternConsent = () => {
    const d = P.d;
    if (!d) return `${head("Einwilligung")}${wait()}`;
    const i = d.consentInfo, team = d.team || {};
    const status = d.consent
      ? `<p class="okmsg">Erteilt${i && i.given ? ` – ${i.source === "eltern" ? `digital von ${esc(i.username)}` : "auf Papier (vom Trainer eingetragen)"} am ${esc(i.at)}` : ""}.</p>`
      : `<p><b>Noch nicht erteilt.</b>${i && !i.given ? ` Zuletzt widerrufen am ${esc(i.at)}.` : ""}</p>`;
    const form = d.consent
      ? (P.ask ? `<section class="card stack danger"><p><b>Einwilligung wirklich widerrufen?</b> Profil, Befindens-Einträge und Selbsteinschätzungen von ${esc(kidName(d))} werden sofort gelöscht und sind danach gesperrt. Das lässt sich nicht rückgängig machen.</p>
          <div class="row"><button class="btn danger-btn" data-act="elRevoke" ${P.busy ? "disabled" : ""}>Ja, widerrufen</button><button class="btn ghost" data-act="elAsk" data-v="0">Abbrechen</button></div></section>`
        : `<button class="btn ghost danger-text" data-act="elAsk" data-v="1">Einwilligung widerrufen</button>`)
      : `<label class="check"><input type="checkbox" id="el-c1" ${P.c1 ? "checked" : ""}> Ich bin sorgeberechtigt und willige ein, dass die oben genannten Angaben in der Lernzone verarbeitet werden (Art. 6 Abs. 1 lit. a DSGVO).</label>
        <label class="check"><input type="checkbox" id="el-c2" ${P.c2 ? "checked" : ""}> Ich willige ausdrücklich ein, dass dabei auch der Hinweis „nicht fit“ verarbeitet wird – eine Angabe mit Gesundheitsbezug (Art. 9 Abs. 2 lit. a DSGVO). Diagnosen oder Krankheiten werden nicht abgefragt.</label>
        <div class="row"><button class="btn" data-act="elGive" ${P.busy || !P.c1 || !P.c2 ? "disabled" : ""}>Einwilligen</button></div>`;
    return `${head("Einwilligung", `${esc(kidName(d))} · ${esc(team.club || "")} ${esc(team.name || "")}`)}${kids(d)}
      <section class="card stack legal"><h2>Status</h2>${status}
        ${P.msg ? `<p class="okmsg" role="status">${esc(P.msg)}</p>` : ""}${P.err ? `<p class="err" role="alert" style="text-align:left">${esc(P.err)}</p>` : ""}</section>
      <section class="card stack legal"><h2>Worum es geht</h2>
        <p>Die Lernzone wird im Training ohne diese Einwilligung genutzt (Lerninhalte, Termine, Absagen, Trainingsbeteiligung). Die folgenden Bereiche sind <b>erst nach der Einwilligung</b> frei:</p>
        ${LZ.consentItems ? LZ.consentItems() : ""}
        <p>Die Einwilligung ist freiwillig. Ohne sie entstehen keine Nachteile. Sie können sie hier jederzeit für die Zukunft widerrufen. Haben beide Sorgeberechtigte einen Zugang, genügt die Einwilligung eines Elternteils, der im Einvernehmen mit dem anderen handelt.</p>
        ${form}
        <p class="small">Fassung ${esc(d.consentVersion || "")} · <button class="linkbtn" data-act="legal" data-v="datenschutz">Datenschutzerklärung</button> · <button class="linkbtn" data-act="legal" data-v="einwilligung">Papierformular</button></p></section>`;
  };
  LZ.actions.elAsk = (b, v) => { P.ask = v === "1"; P.msg = ""; LZ.render(); };
  async function consentSend(body, msg) {
    if (P.busy) return; P.busy = true; P.err = ""; P.msg = ""; LZ.render();
    const r = await LZ.Store.send("parent.php", body);
    P.busy = false;
    if (!r || !r.ok) { P.err = (r && r.error) || "Das hat nicht geklappt."; LZ.render(); return; }
    P.d = r; P.ask = false; P.c1 = P.c2 = false; P.msg = msg; LZ.render();
  }
  LZ.actions.elGive = () => consentSend({ action: "consent", give: true, data: P.c1, health: P.c2 }, "Danke – die Einwilligung ist gespeichert. Profil und Barometer sind jetzt frei.");
  LZ.actions.elRevoke = () => consentSend({ action: "consent", give: false }, "Die Einwilligung ist widerrufen; die Daten sind gelöscht.");
  LZ.inputs.push(e => {
    const id = e.target.id;
    if ((id === "el-c1" || id === "el-c2") && e.type === "change") { P[id === "el-c1" ? "c1" : "c2"] = e.target.checked; LZ.render(); return true; }
  });
})();
