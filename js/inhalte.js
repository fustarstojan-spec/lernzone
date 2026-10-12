/*
 * Lernzone – Inhalte bearbeiten (ab 0.35.0, Trainer, Weg B)
 * Pro Phase (bzw. Modul): Phasentexte (Ziel, Einleitung, Merksatz), Prinzipien (Schlagwort, Erklärung, Kommando, Unterphase,
 * Schwerpunkt A1–D2, Aufgabe je Position, Bild aus einer Taktiktafel) und eigene Quizfragen. Gilt für den ganzen Verein.
 * Entwürfe sehen nur Trainer. Daten: api/content.php; Anzeige in den Phasen: js/app.js (principleCard, applyContent).
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const POS = ["TW", "RV", "IV", "LV", "6", "8", "RA", "LA", "ST"];
  const E = { edit: null, err: "", msg: "", busy: false, boards: null, confirm: false, ref: null };
  const St = () => LZ.Store;
  const val = id => ((document.getElementById(id) || {}).value || "");
  const targets = () => (LZ.C.phases || []).map(p => [p.id, `${p.nr} · ${p.title}`]).concat((LZ.C.modules || []).map(m => [m.id, m.title]));
  const cur = () => LZ.S.arg && targets().some(t => t[0] === LZ.S.arg) ? LZ.S.arg : (LZ.C.phases[0] || {}).id;
  const items = (kind, t) => LZ.contentItems().filter(i => i.kind === kind && i.target === t);
  const isModule = t => (LZ.C.modules || []).some(m => m.id === t);
  async function loadRef() { if (E.ref) return; try { E.ref = await (await fetch("data/schwerpunkte.json", { credentials: "same-origin" })).json(); } catch (e) { E.ref = { groups: [] }; } LZ.render(); }

  /* ---------- Übersicht je Phase ---------- */
  LZ.views.inhalte = () => {
    if (!LZ.coachMode()) return `<p class="small">Nur für Trainer.</p>`;
    const t = cur(), ph = (LZ.C.phases || []).concat(LZ.C.modules || []).find(p => p.id === t) || {}, base = ph._base || ph;
    const text = items("text", t)[0], td = text ? text.data : {};
    const prin = items("principle", t), quiz = items("quiz", t);
    const row = (it, label) => `<li class="crow"><span>${label}${it.draft ? ` <span class="badge muted">Entwurf</span>` : ""}</span>
      <span class="crow-btns"><button class="linkbtn" data-act="ctMove" data-v="${it.id}" data-d="-1" aria-label="nach oben">↑</button><button class="linkbtn" data-act="ctMove" data-v="${it.id}" data-d="1" aria-label="nach unten">↓</button>
      <button class="linkbtn" data-act="ctEdit" data-v="${it.id}">bearbeiten</button></span></li>`;
    return `<section>${LZ.area("Lernzone")}<h1>Inhalte bearbeiten</h1>
      <p class="lede">Prinzipien, Texte und Quizfragen für die Lernzone – gelten für alle Mannschaften des Vereins. Entwürfe sehen nur Trainer.</p></section>
      <div class="fld"><label for="ct-target">Phase / Modul</label><select id="ct-target">${targets().map(([k, l]) => `<option value="${k}" ${k === t ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
      ${E.msg ? `<p class="okmsg">${esc(E.msg)}</p>` : ""}
      ${isModule(t) ? "" : `<section class="card stack"><div class="rowspread"><h2>Prinzipien</h2><button class="btn ghost small" data-act="ctNew" data-v="principle">+ Prinzip</button></div>
        ${prin.length ? `<ul class="clist">${prin.map(it => row(it, `<b>${esc(it.data.title || "")}</b>${it.data.sub ? ` <span class="small">${esc(it.data.sub)}</span>` : ""}`)).join("")}</ul>`
          : `<p class="small">Noch keine eigenen Prinzipien – die Kinder sehen die Standardprinzipien (${(ph.prin || []).length}). Sobald ein Prinzip veröffentlicht ist, ersetzen eure Prinzipien die Standardliste.</p>`}</section>
      <section class="card stack"><div class="rowspread"><h2>Texte</h2><button class="btn ghost small" data-act="ctEditText">bearbeiten</button></div>
        <p class="small"><b>Ziel:</b> ${esc(td.ziel || base.ziel || "")}${td.ziel ? "" : " <i>(Standard)</i>"}</p>
        <p class="small"><b>Einleitung:</b> ${esc(td.intro || base.intro || "")}${td.intro ? "" : " <i>(Standard)</i>"}</p>
        <p class="small"><b>Merksatz:</b> ${esc(td.merk || base.merk || "")}${td.merk ? "" : " <i>(Standard)</i>"}</p></section>`}
      <section class="card stack"><div class="rowspread"><h2>Quizfragen</h2><button class="btn ghost small" data-act="ctNew" data-v="quiz">+ Frage</button></div>
        <p class="small">${(base.quiz || []).length} Standardfragen ${td.keepQuiz === false ? "<b>ausgeblendet</b>" : "werden mitverwendet"} · <button class="linkbtn" data-act="ctKeepQuiz">${td.keepQuiz === false ? "wieder mitverwenden" : "ausblenden"}</button></p>
        ${quiz.length ? `<ul class="clist">${quiz.map(it => row(it, esc(it.data.q || ""))).join("")}</ul>` : `<p class="small">Noch keine eigenen Fragen.</p>`}</section>
      <p><button class="linkbtn" data-act="${isModule(t) ? "modul" : "phase"}" data-v="${t}">› So sieht es in der Lernzone aus</button></p>`;
  };
  LZ.inputs.push(e => {
    const id = e.target.id;
    if (id === "ct-target" && e.type === "change") { LZ.S.arg = e.target.value; E.msg = ""; LZ.render(); }
    if (id === "pe-board" && e.type === "change" && e.target.value) takeBoard(+e.target.value);
  });
  LZ.actions.ctMove = async (b, v) => {
    const r = await St().send("content.php", { action: "move", id: +v, dir: +b.dataset.d });
    if (r && r.ok) await LZ.reloadContent();
  };
  LZ.actions.ctKeepQuiz = async () => {
    const t = cur(), text = items("text", t)[0], d = Object.assign({}, text ? text.data : {}); d.keepQuiz = d.keepQuiz === false;
    const r = await St().send("content.php", { action: "save", kind: "text", target: t, id: text ? text.id : undefined, data: d });
    if (r && r.ok) await LZ.reloadContent();
  };

  /* ---------- Bearbeiten ---------- */
  const blank = kind => kind === "principle" ? { title: "", text: "", cmd: "", sub: "", focus: "", pos: {}, sketch: null }
    : kind === "quiz" ? { q: "", options: ["", "", "", ""], correct: 0, why: "" } : { ziel: "", intro: "", merk: "", keepQuiz: true };
  function openEdit(it) { E.edit = it; E.err = ""; E.confirm = false; E.boards = null; LZ.go("inhaltEdit", it.target); LZ.top(); if (it.kind === "principle") { loadRef(); loadBoards(); } }
  LZ.actions.ctNew = (b, v) => openEdit({ id: 0, kind: v, target: cur(), draft: true, data: blank(v) });
  LZ.actions.ctEdit = (b, v) => { const it = LZ.contentItems().find(x => x.id === +v); if (it) openEdit(JSON.parse(JSON.stringify(it))); };
  LZ.actions.ctEditText = () => { const t = cur(), x = items("text", t)[0]; openEdit(x ? JSON.parse(JSON.stringify(x)) : { id: 0, kind: "text", target: t, draft: false, data: blank("text") }); };
  async function loadBoards() { const r = await St().get("boards.php"); E.boards = r && r.ok ? r.boards.filter(b => b.kind === "board") : []; LZ.render(); }
  async function takeBoard(id) {
    const r = await St().get("boards.php?id=" + id);
    if (!r || !r.ok) return;
    readForm(); const d = r.board.data || {};
    E.edit.data.sketch = { items: (d.items || []).map(i => { const o = Object.assign({}, i); delete o.nr; return o; }), lines: d.lines || [] };   // keine Trikotnummern übernehmen
    LZ.render();
  }
  function focusOpts(sel) {
    if (!E.ref) return "";
    return E.ref.groups.map(g => `<optgroup label="${esc(g.key + " · " + g.title)}">${g.phases.map(ph => `<option value="${ph.key}" ${ph.key === sel ? "selected" : ""}>${ph.key} ${esc(ph.title)}</option>`).join("")}</optgroup>`).join("");
  }
  function readForm() {
    const e = E.edit, d = e.data;
    if (e.kind === "principle") {
      Object.assign(d, { title: val("pe-title"), text: val("pe-text"), cmd: val("pe-cmd"), sub: val("pe-sub"), focus: val("pe-focus") });
      d.pos = {}; POS.forEach(p => { const v = val("pe-pos-" + p).trim(); if (v) d.pos[p] = v; });
    } else if (e.kind === "quiz") {
      d.q = val("qe-q"); d.options = [0, 1, 2, 3].map(i => val("qe-o" + i)); d.why = val("qe-why");
      const c = document.querySelector("input[name=qe-c]:checked"); d.correct = c ? +c.value : d.correct;
    } else Object.assign(d, { ziel: val("te-ziel"), intro: val("te-intro"), merk: val("te-merk") });
    const dr = document.getElementById("ce-draft"); if (dr) e.draft = dr.checked;
  }
  LZ.views.inhaltEdit = () => {
    const e = E.edit; if (!e) return `<button class="back" data-act="ctBack">‹ Inhalte</button>`;
    const d = e.data, ph = (LZ.C.phases || []).concat(LZ.C.modules || []).find(p => p.id === e.target) || {}, base = ph._base || ph;
    const ta = (id, label, v, rows = 3, ph2 = "") => `<div class="fld"><label for="${id}">${label}</label><textarea id="${id}" rows="${rows}" placeholder="${esc(ph2)}">${esc(v || "")}</textarea></div>`;
    const inp = (id, label, v, ph2 = "", max = 80) => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" maxlength="${max}" value="${esc(v || "")}" placeholder="${esc(ph2)}"></div>`;
    let form = "";
    if (e.kind === "principle") form = `
      ${inp("pe-title", "Schlagwort", d.title, "z. B. Der Nächste ist der Erste")}
      ${ta("pe-text", "Was heißt das? (kurz, in Kindersprache)", d.text, 3)}
      ${inp("pe-cmd", "Kommando (was wir im Spiel rufen, optional)", d.cmd, "z. B. Jagen!", 60)}
      <div class="grid2"><div class="fld"><label for="pe-sub">Unterphase (optional)</label><select id="pe-sub"><option value="">–</option>${(ph.unter || []).map(([a]) => `<option ${a === d.sub ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></div>
        <div class="fld"><label for="pe-focus">Schwerpunkt (optional)</label><select id="pe-focus"><option value="">–</option>${focusOpts(d.focus)}</select></div></div>
      <fieldset class="fld"><legend class="fldlabel">Aufgabe je Position (leer lassen, wenn es für die Position nichts Besonderes gibt)</legend>
        <div class="posgrid">${POS.map(p => `<label class="posrow"><b class="ptag">${p}</b><input id="pe-pos-${p}" maxlength="300" value="${esc((d.pos || {})[p] || "")}"></label>`).join("")}</div></fieldset>
      <div class="fld"><label for="pe-board">Bild aus einer Taktiktafel übernehmen</label><select id="pe-board"><option value="">${E.boards === null ? "Lade …" : E.boards.length ? "– Taktiktafel wählen –" : "Noch keine Taktiktafeln gespeichert"}</option>${(E.boards || []).map(b => `<option value="${b.id}">${esc(b.title)}</option>`).join("")}</select>
        <span class="small">Erst unter „Taktik“ eine Tafel zeichnen und speichern, dann hier auswählen. Positionen mit Kürzel beschriften – die Position des Kindes bekommt den gelben Ring.</span></div>
      ${d.sketch && (d.sketch.items || []).length ? `<div class="psketch">${window.LZPitch.field({ zones: true, board: d.sketch, label: "Vorschau" })}</div><button class="linkbtn" data-act="ctNoSketch">Bild entfernen</button>` : ""}`;
    else if (e.kind === "quiz") form = `
      ${ta("qe-q", "Frage", d.q, 2)}
      <fieldset class="fld"><legend class="fldlabel">Antworten (2–4) – die richtige anklicken</legend>
        ${[0, 1, 2, 3].map(i => `<label class="qopt"><input type="radio" name="qe-c" value="${i}" ${d.correct === i ? "checked" : ""}><input id="qe-o${i}" maxlength="200" value="${esc(d.options[i] || "")}" placeholder="Antwort ${i + 1}${i > 1 ? " (optional)" : ""}"></label>`).join("")}</fieldset>
      ${ta("qe-why", "Erklärung (wird nach der Antwort gezeigt)", d.why, 2)}`;
    else form = `
      ${ta("te-ziel", "Unser Ziel", d.ziel, 2, base.ziel)}${ta("te-intro", "Einleitung", d.intro, 3, base.intro)}${ta("te-merk", "Merksatz", d.merk, 2, base.merk)}
      <p class="small">Leere Felder = Standardtext (grau angezeigt).</p>`;
    return `<button class="back" data-act="ctBack">‹ Inhalte</button>
      <section><p class="eyebrow">${esc(ph.title || "")}</p><h1>${e.kind === "principle" ? (e.id ? "Prinzip bearbeiten" : "Neues Prinzip") : e.kind === "quiz" ? (e.id ? "Frage bearbeiten" : "Neue Frage") : "Texte"}</h1></section>
      <section class="card stack">${form}
        ${e.kind === "text" ? "" : `<label class="check"><input type="checkbox" id="ce-draft" ${e.draft ? "checked" : ""}> Entwurf (Kinder sehen es noch nicht)</label>`}</section>
      ${E.err ? `<p class="err" role="alert" style="text-align:left">${esc(E.err)}</p>` : ""}
      <div class="row"><button class="btn" data-act="ctSave" ${E.busy ? "disabled" : ""}>Speichern</button><button class="btn ghost" data-act="ctBack">Abbrechen</button></div>
      ${e.id && e.kind !== "text" ? (E.confirm ? `<section class="card stack danger"><p><b>Wirklich löschen?</b></p><div class="row"><button class="btn danger-btn" data-act="ctDel">Ja, löschen</button><button class="btn ghost" data-act="ctDelNo">Nein</button></div></section>`
        : `<button class="linkbtn danger-text" data-act="ctDelAsk">Löschen</button>`) : ""}`;
  };
  LZ.actions.ctBack = () => { const t = E.edit ? E.edit.target : LZ.S.arg; E.edit = null; LZ.go("inhalte", t); };
  LZ.actions.ctNoSketch = () => { readForm(); E.edit.data.sketch = null; LZ.render(); };
  LZ.actions.ctSave = async () => {
    readForm(); const e = E.edit;
    E.busy = true; E.err = ""; LZ.render();
    const r = await St().send("content.php", { action: "save", id: e.id || undefined, kind: e.kind, target: e.target, draft: e.draft, data: e.data });
    E.busy = false;
    if (!r || !r.ok) { E.err = (r && r.error) || "Speichern hat nicht geklappt."; LZ.render(); return; }
    E.msg = "Gespeichert."; const t = e.target; E.edit = null; await LZ.reloadContent(); LZ.go("inhalte", t);
  };
  LZ.actions.ctDelAsk = () => { readForm(); E.confirm = true; LZ.render(); };
  LZ.actions.ctDelNo = () => { E.confirm = false; LZ.render(); };
  LZ.actions.ctDel = async () => {
    const r = await St().send("content.php", { action: "delete", id: E.edit.id });
    if (!r || !r.ok) { E.err = (r && r.error) || "Löschen hat nicht geklappt."; E.confirm = false; LZ.render(); return; }
    E.msg = "Gelöscht."; const t = E.edit.target; E.edit = null; await LZ.reloadContent(); LZ.go("inhalte", t);
  };
})();
