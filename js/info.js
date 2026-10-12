/*
 * Lernzone – Info für Eltern und Trainer (ab 0.39.0)
 * Ansicht „info“ (FU-STARS): Vom Verein · Ärzte · Therapie · Partner & Sponsoren – Kinder sehen das nicht.
 * Ansicht „infoAdmin“ (Admin-Zone): Einträge anlegen, sortieren, als Entwurf; Anfragen „Partner werden“ bearbeiten.
 * Ansicht „partner“ (öffentlich, ohne Anmeldung): Praxen und Firmen fragen beim Verein an.
 * Daten: api/info.php, api/partner.php · Links nur https, keine fremden Bilder oder Skripte (kein Tracking).
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const I = { d: null, err: "", msg: "", busy: false, edit: null, req: null, confirm: "", pub: null };
  const GROUPS = [["verein", "Vom Verein"], ["arzt", "Ärzte"], ["therapie", "Therapie"], ["partner", "Partner & Sponsoren"]];
  const GL = Object.fromEntries(GROUPS);
  LZ.publicViews = (LZ.publicViews || []).concat(["partner"]);
  const errP = () => I.err ? `<p class="err" role="alert" style="text-align:left">${esc(I.err)}</p>` : "";
  const okP = () => I.msg ? `<p class="okmsg" role="status">${esc(I.msg)}</p>` : "";
  const nl = s => esc(s || "").replace(/\n/g, "<br>");
  const val = id => ((document.getElementById(id) || {}).value || "").trim();

  async function load() {
    const r = await LZ.Store.get("info.php");
    I.d = r && r.ok ? r : { items: [], failed: (r && r.error) || "Konnte die Infos nicht laden." };
    LZ.render();
  }
  async function loadReq() { const r = await LZ.Store.get("partner.php"); I.req = r && r.ok ? r.requests : []; LZ.render(); }
  LZ.on("enter", v => {
    if (!LZ.Store || LZ.Store.mode !== "api") return;
    if (v === "info") { I.err = ""; load(); }
    if (v === "infoAdmin") { I.err = ""; I.msg = ""; I.edit = null; load(); loadReq(); }
    if (v === "partner") { I.pub = { sent: false, err: "" }; if (LZ.legal) LZ.legal.load().then(() => { if (LZ.S.view === "partner") LZ.render(); }); }
  });

  /* ---------- Ansicht für Eltern und Trainer ---------- */
  const card = x => {
    const d = x.data;
    if (x.kind === "text") return `<section class="card stack infotext"><h3>${esc(d.title)}</h3>${d.body ? `<p>${nl(d.body)}</p>` : ""}</section>`;
    return `<section class="card stack infocard">
      <div class="rowspread"><div><h3>${esc(d.name)}</h3>${d.specialty ? `<p class="small">${esc(d.specialty)}</p>` : ""}</div>${x.ad ? `<span class="badge muted" title="Der Verein erhält dafür eine Gegenleistung">Anzeige</span>` : ""}</div>
      ${d.text ? `<p>${nl(d.text)}</p>` : ""}
      <p class="small infolinks">${[d.address ? (LZ.mapLink ? LZ.mapLink(d.address.replace(/\n/g, ", ")) : esc(d.address)) : "",
        d.phone ? `<a href="tel:${esc(d.phone.replace(/[^0-9+]/g, ""))}">${esc(d.phone)}</a>` : "",
        d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : "",
        d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(d.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>` : ""].filter(Boolean).join(" · ")}</p></section>`;
  };
  LZ.views.info = () => {
    const head = `<section>${LZ.area(LZ.parentMode && LZ.parentMode() ? "Eltern" : "Info")}<h1>Info</h1><p class="lede">Ansprechpartner, Ärzte und Therapeuten in der Nähe und Partner des Vereins.</p></section>`;
    const d = I.d; if (!d) return `${head}<p class="small">Lade …</p>`;
    if (d.failed) return `${head}<p class="err" style="text-align:left">${esc(d.failed)}</p>`;
    const vis = d.items.filter(x => !x.draft);
    const body = GROUPS.map(([g, l]) => { const list = vis.filter(x => x.grp === g); return list.length ? `<h2 class="sechead">${l}</h2>${list.map(card).join("")}` : ""; }).join("");
    return `${head}${body || `<p class="small">Hier stehen bald Infos vom Verein.</p>`}
      <p class="small">Einträge mit „Anzeige“ sind Partner, die den Verein unterstützen. Sie sind keine medizinische Empfehlung – im Zweifel bitte die Hausärztin bzw. den Kinderarzt fragen.
        ${d.canEdit ? ` · <a href="admin/#infoAdmin">Bearbeiten ↗</a>` : ""} · <button class="linkbtn" data-act="side" data-v="partner">Partner werden</button></p>`;
  };

  /* ---------- Admin-Zone ---------- */
  const blank = (kind, grp) => ({ id: 0, kind, grp, ad: kind === "partner" && grp !== "verein", draft: false,
    data: kind === "text" ? { title: "", body: "" } : { name: "", specialty: "", address: "", phone: "", email: "", url: "", text: "" } });
  const fld = (id, label, v, area, ph = "", max = 120) => `<div class="fld"><label for="${id}">${label}</label>${area
    ? `<textarea id="${id}" rows="${area}" maxlength="${max}" placeholder="${esc(ph)}">${esc(v || "")}</textarea>`
    : `<input id="${id}" maxlength="${max}" value="${esc(v || "")}" placeholder="${esc(ph)}">`}</div>`;
  function form() {
    const e = I.edit, d = e.data;
    return `<section class="card stack"><h2>${e.id ? "Eintrag bearbeiten" : e.kind === "text" ? "Neue Vereinsinfo" : "Neuer Eintrag"}</h2>
      ${e.kind === "partner" ? `<div class="fld"><label for="if-grp">Rubrik</label><select id="if-grp">${GROUPS.filter(g => g[0] !== "verein").map(([g, l]) => `<option value="${g}" ${e.grp === g ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        ${fld("if-name", "Name der Praxis / Firma", d.name, 0, "z. B. Orthopädie am Sportpark", 80)}${fld("if-spec", "Fachrichtung / Angebot", d.specialty, 0, "z. B. Orthopädie, Sportmedizin, Kinder und Jugendliche", 80)}
        ${fld("if-text", "Kurzer Text (sachlich)", d.text, 3, "z. B. Sprechstunde für junge Sportler, Termine meist innerhalb einer Woche", 600)}
        ${fld("if-addr", "Anschrift", d.address, 2, "Straße\nPLZ Ort", 200)}
        <div class="grid2">${fld("if-phone", "Telefon", d.phone, 0, "089 …", 30)}${fld("if-mail", "E-Mail", d.email, 0, "", 120)}</div>
        ${fld("if-url", "Webseite (https://…)", d.url, 0, "https://", 200)}
        <label class="check"><input type="checkbox" id="if-ad" ${e.ad ? "checked" : ""}> Als „Anzeige“ kennzeichnen (der Verein bekommt eine Gegenleistung, z. B. Sponsoring)</label>
        <p class="small">Ärzte dürfen nur sachlich informieren (Fachrichtung, Leistungen, Kontakt) – keine anpreisenden Aussagen wie „der beste Orthopäde“.</p>`
      : `${fld("if-title", "Überschrift", d.title, 0, "z. B. Ansprechpartner im Verein", 80)}${fld("if-body", "Text", d.body, 8, "Ein Absatz pro Zeile", 3000)}`}
      <label class="check"><input type="checkbox" id="if-draft" ${e.draft ? "checked" : ""}> Entwurf (noch nicht sichtbar)</label>
      ${errP()}<div class="chiprow"><button class="btn" data-act="ifSave" ${I.busy ? "disabled" : ""}>Speichern</button><button class="btn ghost" data-act="ifCancel">Abbrechen</button></div></section>`;
  }
  const STAT = { neu: "Neu", erledigt: "Erledigt", abgelehnt: "Abgelehnt" };
  function requests() {
    const list = I.req; if (!list) return "";
    const neu = list.filter(r => r.status === "neu").length;
    return `<section class="card stack"><div class="rowspread"><h2>Anfragen „Partner werden“</h2>${neu ? `<span class="badge">${neu} neu</span>` : ""}</div>
      <p class="small">Über die öffentliche Seite <button class="linkbtn" data-act="side" data-v="partner">Partner werden</button> (Link unten auf jeder Seite) können Praxen und Firmen anfragen. Anfragen werden nach 180 Tagen gelöscht.</p>
      ${list.length ? `<ul class="admlist">${list.map(r => { const d = r.data; return `<li class="stack inforeq ${r.status}">
        <div class="rowspread"><b>${esc(d.praxis)}</b><span class="badge ${r.status === "neu" ? "" : "muted"}">${STAT[r.status]}</span></div>
        <span class="small">${esc(r.created)} · ${esc(d.fachrichtung || "")}${d.fachrichtung ? " · " : ""}${esc(d.ansprechpartner)} · <a href="mailto:${esc(d.email)}">${esc(d.email)}</a>${d.telefon ? " · " + esc(d.telefon) : ""}</span>
        ${d.adresse ? `<span class="small">${esc(d.adresse)}</span>` : ""}${d.url ? `<span class="small">${esc(d.url)}</span>` : ""}
        ${d.nachricht ? `<p>${nl(d.nachricht)}</p>` : ""}
        <div class="chiprow">${r.status === "neu" ? `<select id="ir-grp-${r.id}" aria-label="Rubrik"><option value="arzt">Ärzte</option><option value="therapie">Therapie</option><option value="partner">Partner & Sponsoren</option></select>
          <button class="btn small" data-act="irAdopt" data-v="${r.id}">Als Entwurf übernehmen</button><button class="linkbtn" data-act="irStatus" data-v="${r.id}" data-s="abgelehnt">Ablehnen</button>`
          : `<button class="linkbtn" data-act="irStatus" data-v="${r.id}" data-s="neu">Wieder öffnen</button>`}
          ${I.confirm === "r" + r.id ? `<button class="btn small danger-btn" data-act="irDel" data-v="${r.id}">Wirklich löschen?</button>` : `<button class="linkbtn" data-act="ifAsk" data-v="r${r.id}">Löschen</button>`}</div></li>`; }).join("")}</ul>`
        : `<p class="small">Noch keine Anfragen.</p>`}</section>`;
  }
  LZ.views.infoAdmin = () => {
    const head = `<section>${LZ.area("Admin-Zone")}<h1>Info & Partner</h1><p class="lede">Was Eltern und Trainer unter „Info“ sehen: Vereinsinfos, Ärzte, Therapie, Partner. Kinder sehen das nicht.</p></section>`;
    if (!LZ.coachMode() || !(LZ.Store.coach || {}).isAdmin) return `${head}<p class="small">Nur für Cheftrainer und Vereinsadmins mit geöffneter Mannschaft.</p>`;
    const d = I.d; if (!d) return `${head}<p class="small">Lade …</p>`;
    if (I.edit) return `${head}${form()}`;
    const row = (x, i, list) => `<li class="rowspread"><span>${x.kind === "text" ? esc(x.data.title) : `<b>${esc(x.data.name)}</b> <span class="small">${esc(x.data.specialty || "")}</span>`}
        ${x.ad ? ` <span class="badge muted">Anzeige</span>` : ""}${x.draft ? ` <span class="badge">Entwurf</span>` : ""}</span>
      <span class="chiprow">${i ? `<button class="linkbtn" data-act="ifMove" data-v="${x.id}" data-d="-1" title="nach oben">▲</button>` : ""}${i < list.length - 1 ? `<button class="linkbtn" data-act="ifMove" data-v="${x.id}" data-d="1" title="nach unten">▼</button>` : ""}
        <button class="linkbtn" data-act="ifEdit" data-v="${x.id}">Bearbeiten</button>
        ${I.confirm === "i" + x.id ? `<button class="btn small danger-btn" data-act="ifDel" data-v="${x.id}">Wirklich löschen?</button>` : `<button class="linkbtn" data-act="ifAsk" data-v="i${x.id}">Löschen</button>`}</span></li>`;
    return `${head}${okP()}${errP()}
      <div class="chiprow"><button class="btn" data-act="ifNew" data-v="partner">+ Arzt, Therapie oder Partner</button><button class="btn ghost" data-act="ifNew" data-v="text">+ Vereinsinfo</button>
        <a class="btn ghost" href="./" target="_blank" rel="noopener">So sehen es Eltern ↗</a></div>
      ${GROUPS.map(([g, l]) => { const list = d.items.filter(x => x.grp === g); return `<section class="card stack"><h2>${l}</h2>${list.length ? `<ul class="admlist">${list.map(row).join("")}</ul>` : `<p class="small">Noch nichts eingetragen.</p>`}</section>`; }).join("")}
      ${requests()}`;
  };
  const readForm = () => { const e = I.edit;
    if (e.kind === "text") e.data = { title: val("if-title"), body: (document.getElementById("if-body") || {}).value || "" };
    else { e.grp = val("if-grp") || e.grp; e.ad = !!(document.getElementById("if-ad") || {}).checked;
      e.data = { name: val("if-name"), specialty: val("if-spec"), text: (document.getElementById("if-text") || {}).value || "", address: (document.getElementById("if-addr") || {}).value || "",
                 phone: val("if-phone"), email: val("if-mail"), url: val("if-url") }; }
    e.draft = !!(document.getElementById("if-draft") || {}).checked; };
  async function send(file, body, after) {
    if (I.busy) return; I.busy = true; I.err = ""; I.msg = ""; LZ.render();
    const r = await LZ.Store.send(file, body);
    I.busy = false;
    if (!r || !r.ok) { I.err = (r && r.error) || "Das hat nicht geklappt."; LZ.render(); return; }
    if (r.items) I.d = r; if (r.requests) I.req = r.requests; I.confirm = ""; if (after) after(r); LZ.render();
  }
  LZ.actions.ifNew = (b, v) => { I.edit = blank(v, v === "text" ? "verein" : "arzt"); I.err = ""; LZ.render(); LZ.top(); };
  LZ.actions.ifEdit = (b, v) => { const x = I.d.items.find(y => y.id === +v); I.edit = JSON.parse(JSON.stringify(x)); I.err = ""; LZ.render(); LZ.top(); };
  LZ.actions.ifCancel = () => { I.edit = null; I.err = ""; LZ.render(); };
  LZ.actions.ifSave = () => { readForm(); const e = I.edit;
    send("info.php", { action: "save", id: e.id || undefined, kind: e.kind, grp: e.grp, data: e.data, ad: e.ad, draft: e.draft }, () => { I.edit = null; I.msg = "Gespeichert."; }); };
  LZ.actions.ifAsk = (b, v) => { I.confirm = v; LZ.render(); };
  LZ.actions.ifDel = (b, v) => send("info.php", { action: "delete", id: +v });
  LZ.actions.ifMove = b => send("info.php", { action: "move", id: +b.dataset.v, dir: +b.dataset.d });
  LZ.actions.irStatus = b => send("partner.php", { action: "status", id: +b.dataset.v, status: b.dataset.s });
  LZ.actions.irDel = (b, v) => send("partner.php", { action: "delete", id: +v });
  LZ.actions.irAdopt = (b, v) => send("partner.php", { action: "adopt", id: +v, grp: val("ir-grp-" + v) || "arzt" },
    async r => { await load(); const x = I.d.items.find(y => y.id === r.infoId); if (x) I.edit = JSON.parse(JSON.stringify(x)); I.msg = ""; LZ.render(); LZ.top(); });

  /* ---------- Öffentlich: Partner werden ---------- */
  LZ.views.partner = () => {
    const P = I.pub || (I.pub = { sent: false, err: "" });
    const clubs = ((LZ.legal && LZ.legal.get()) || { clubs: [] }).clubs || [];
    const back = `<button class="back" data-act="${(LZ.Store.gate && LZ.Store.gate()) ? "legalBack" : "home"}">‹ Zurück</button>`;
    const head = `${back}<section><p class="eyebrow">Für Praxen und Firmen</p><h1>Partner werden</h1>
      <p class="lede">Eltern unserer Nachwuchsspieler suchen immer wieder Orthopäden, Sportmediziner, Physiotherapeuten und andere Partner in der Nähe. Sie möchten im Info-Bereich für Eltern erscheinen? Schreiben Sie uns – der Verein meldet sich.</p></section>`;
    if (P.sent) return `${head}<section class="card stack"><p class="okmsg">Danke! Ihre Anfrage ist beim Verein angekommen. Wir melden uns per E-Mail.</p></section>`;
    const f = (id, label, type = "text", req = false, ph = "", max = 100) => `<div class="fld"><label for="pw-${id}">${label}${req ? " *" : ""}</label><input id="pw-${id}" type="${type}" maxlength="${max}" placeholder="${esc(ph)}" value="${esc(P[id] || "")}"></div>`;
    return `${head}<section class="card stack">
      <div class="fld"><label for="pw-club">Verein *</label><select id="pw-club">${clubs.length > 1 ? `<option value="">Bitte wählen</option>` : ""}${clubs.map(c => `<option value="${c.id}" ${+P.club === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      ${f("praxis", "Praxis / Firma", "text", true)}${f("fachrichtung", "Fachrichtung / Angebot", "text", false, "z. B. Orthopädie, Physiotherapie", 80)}
      ${f("ansprechpartner", "Ansprechpartner", "text", true, "", 80)}
      <div class="grid2">${f("email", "E-Mail", "email", true, "", 120)}${f("telefon", "Telefon", "tel", false, "", 30)}</div>
      ${f("adresse", "Anschrift", "text", false, "Straße, PLZ Ort", 200)}${f("url", "Webseite", "url", false, "https://", 200)}
      <div class="fld"><label for="pw-nachricht">Nachricht</label><textarea id="pw-nachricht" rows="4" maxlength="1000" placeholder="z. B. Sprechstunde für junge Sportler, Sponsoring-Idee …">${esc(P.nachricht || "")}</textarea></div>
      <div class="hp" aria-hidden="true"><label for="pw-website">Bitte leer lassen</label><input id="pw-website" tabindex="-1" autocomplete="off"></div>
      <label class="check"><input type="checkbox" id="pw-privacy" ${P.privacy ? "checked" : ""}> Ich bin einverstanden, dass der Verein meine Angaben speichert, um mich wegen der Anfrage zu kontaktieren (Löschung spätestens nach 180 Tagen). *</label>
      ${P.err ? `<p class="err" role="alert" style="text-align:left">${esc(P.err)}</p>` : ""}
      <button class="btn wide" data-act="pwSend" ${I.busy ? "disabled" : ""}>Anfrage senden</button>
      <p class="small">Ärztinnen und Ärzte: Wir veröffentlichen nur sachliche Angaben (Fachrichtung, Leistungen, Kontakt). Mehr in der <button class="linkbtn" data-act="legal" data-v="datenschutz">Datenschutzerklärung</button>.</p></section>`;
  };
  LZ.actions.pwSend = async () => {
    const P = I.pub; ["club", "praxis", "fachrichtung", "ansprechpartner", "email", "telefon", "adresse", "url"].forEach(k => P[k] = val("pw-" + k));
    P.nachricht = (document.getElementById("pw-nachricht") || {}).value || ""; P.privacy = !!(document.getElementById("pw-privacy") || {}).checked;
    const body = { action: "request", club: +P.club, praxis: P.praxis, fachrichtung: P.fachrichtung, ansprechpartner: P.ansprechpartner, email: P.email,
      telefon: P.telefon, adresse: P.adresse, url: P.url, nachricht: P.nachricht, privacy: P.privacy, website: val("pw-website") };
    I.busy = true; P.err = ""; LZ.render();
    const r = await LZ.Store.send("partner.php", body);
    I.busy = false;
    if (!r || !r.ok) { P.err = (r && r.error) || "Senden hat nicht geklappt."; LZ.render(); return; }
    I.pub = { sent: true }; LZ.render(); LZ.top();
  };
})();
