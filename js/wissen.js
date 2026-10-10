/*
 * Lernzone – Trainer-Wissen (ab 0.27.0, nur Trainer, Weg B)
 * Stufen: Grundlagen U8–U11 · Aufbau U12–U16 · Leistung U17+ · Alle
 *   Seiten (kind page): eigene Zusammenfassungen, Text mit „## Abschnitt“ und „- Punkt“
 *   Bibliothek (kind link): Verweise auf Material (z. B. Google Drive des Trainers), Filter nach Bereich, Spielphase, Suche
 * Gilt für den ganzen Verein. Daten: api/wissen.php. Fremdmaterial wird nicht kopiert, nur verlinkt.
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const STAGES = [["grundlagen", "Grundlagen", "U8–U11"], ["aufbau", "Aufbau", "U12–U16"], ["leistung", "Leistung", "U17+"], ["alle", "Alle", "Altersklassen"]];
  const CATS = ["Taktik", "Technik", "Positionstraining", "Individualtraining", "Torwart", "Athletik", "Ernährung", "Spielformen", "Methodik", "Ordner"];
  const W = { data: null, stage: "aufbau", cat: "", phase: "", q: "", page: null, edit: null, err: "", busy: false, confirm: false };
  let REF = null;
  try { const s = localStorage.getItem("lz-wissen-stage"); if (STAGES.some(x => x[0] === s)) W.stage = s; } catch (e) { }
  const St = () => LZ.Store;
  const val = id => ((document.getElementById(id) || {}).value || "");
  const stageName = k => { const s = STAGES.find(x => x[0] === k); return s ? (k === "alle" ? "Alle Altersklassen" : `${s[1]} ${s[2]}`) : ""; };
  const phaseName = k => { if (!REF || !k) return k || ""; for (const g of REF.groups) for (const ph of g.phases) if (ph.key === k) return `${ph.key} ${ph.title}`; return k; };
  const safeUrl = u => /^https:\/\//.test(u || "") ? u : "#";
  const errBox = () => W.err ? `<p class="err" role="alert" style="text-align:left">${esc(W.err)}</p>` : "";

  async function load() {
    if (!REF) { try { REF = await (await fetch("data/schwerpunkte.json", { credentials: "same-origin" })).json(); } catch (e) { REF = { groups: [] }; } }
    const r = await St().get("wissen.php");
    if (r && r.ok) { W.data = r; W.err = ""; } else W.err = (r && r.error) || "Laden hat nicht geklappt.";
    LZ.render();
  }
  LZ.on("enter", v => { if (v === "wissen") load(); });

  /* ---------- Text einer Seite ---------- */
  function bodyHtml(t) {
    const out = []; let sec = null, list = null;
    const close = () => { if (list) { sec.push(`<ul>${list.join("")}</ul>`); list = null; } };
    const flush = () => { close(); if (sec) out.push(`<section class="card stack wsec">${sec.join("")}</section>`); sec = null; };
    for (const raw of (t || "").split("\n")) {
      const l = raw.trim(); if (!l) continue;
      if (l.startsWith("## ")) { flush(); sec = [`<h2>${esc(l.slice(3))}</h2>`]; continue; }
      if (!sec) sec = [];
      if (/^[-•] /.test(l)) { (list = list || []).push(`<li>${esc(l.slice(2))}</li>`); continue; }
      close(); sec.push(`<p>${esc(l)}</p>`);
    }
    flush();
    return out.join("");
  }

  /* ---------- Übersicht ---------- */
  function linksFor() {
    const d = W.data, q = W.q.trim().toLowerCase();
    return d.links.filter(k => (W.stage === "alle" || k.stage === W.stage || k.stage === "alle")
      && (!W.cat || k.category === W.cat) && (!W.phase || k.phase.startsWith(W.phase))
      && (!q || [k.title, k.category, k.source, phaseName(k.phase)].join(" ").toLowerCase().includes(q)));
  }
  function linkRow(k) {
    return `<li class="wlink"><a href="${esc(safeUrl(k.url))}" target="_blank" rel="noopener noreferrer">${esc(k.title)}</a>
      <span class="small">${[k.phase ? esc(phaseName(k.phase)) : "", k.source ? esc(k.source) : "", W.stage === "alle" || k.stage === "alle" ? esc(stageName(k.stage)) : ""].filter(Boolean).join(" · ")}</span>
      <button class="linkbtn small" data-act="wiEdit" data-v="${k.id}" aria-label="${esc(k.title)} bearbeiten">ändern</button></li>`;
  }
  function library() {
    const list = linksFor(), cats = [...new Set(W.data.links.map(k => k.category).filter(Boolean))];
    const order = c => { const i = CATS.indexOf(c); return i < 0 ? 99 : i; };
    cats.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
    const groups = (W.cat ? [W.cat] : cats.concat([""])).map(c => [c, list.filter(k => k.category === c)]).filter(g => g[1].length);
    const open = !!(W.cat || W.phase || W.q.trim()) || groups.length === 1;
    const phOpts = REF ? REF.groups.map(g => `<optgroup label="${esc(g.key + " · " + g.title)}"><option value="${g.key}" ${W.phase === g.key ? "selected" : ""}>${g.key} – ganz</option>${g.phases.map(ph => `<option value="${ph.key}" ${W.phase === ph.key ? "selected" : ""}>${ph.key} ${esc(ph.title)}</option>`).join("")}</optgroup>`).join("") : "";
    return `<section class="card stack"><div class="rowspread"><h2>Bibliothek</h2><button class="btn ghost small" data-act="wiNew" data-v="link">+ Material</button></div>
      <div class="wfilter">
        <div class="fld"><label for="wi-cat">Bereich</label><select id="wi-cat"><option value="">Alle Bereiche</option>${cats.map(c => `<option ${c === W.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="fld"><label for="wi-phase">Spielphase</label><select id="wi-phase"><option value="">Alle Phasen</option>${phOpts}</select></div>
      </div>
      <div class="fld"><label for="wi-q">Suchen</label><input id="wi-q" value="${esc(W.q)}" placeholder="z. B. Pressing" autocomplete="off"></div>
      <p class="small">${list.length} Einträge. Die Dateien liegen im Google Drive – öffnen klappt nur mit Freigabe des Ordners.</p>
      ${groups.map(([c, l]) => `<details class="wgroup" ${open ? "open" : ""}><summary><b>${esc(c || "Sonstiges")}</b> <span class="small">${l.length}</span></summary><ul class="wlist">${l.map(linkRow).join("")}</ul></details>`).join("")
        || `<p class="small">Nichts gefunden.</p>`}
    </section>`;
  }
  LZ.views.wissen = () => {
    const head = `${LZ.coachNav("wissen")}<section>${LZ.area("Trainer-Bereich")}<h1>Trainer-Wissen</h1>
      <p class="lede">Was in welcher Altersstufe wichtig ist – und wo das Material dazu liegt.</p></section>
      <nav class="seg wstages">${STAGES.map(([k, l, a]) => `<button aria-pressed="${W.stage === k}" data-act="wiStage" data-v="${k}">${l}<span class="wage">${a}</span></button>`).join("")}</nav>${errBox()}`;
    if (!W.data) return head + (W.err ? "" : `<p class="small">Lade …</p>`);
    const pages = W.data.pages.filter(p => p.stage === W.stage);
    return `${head}
      <section class="card stack"><div class="rowspread"><h2>${esc(stageName(W.stage))}</h2><button class="btn ghost small" data-act="wiNew" data-v="page">+ Seite</button></div>
        ${pages.map(p => `<button class="wpage" data-act="wiPage" data-v="${p.id}"><b>${esc(p.title)}</b>${p.draft ? ` <span class="badge muted">Entwurf</span>` : ""}
          <span class="small">${esc((p.body.match(/^## .+$/gm) || []).map(h => h.slice(3)).join(" · "))}</span></button>`).join("")
          || `<p class="small">Für diese Stufe gibt es noch keine Seite.</p>`}
      </section>${library()}`;
  };
  LZ.actions.wiStage = (b, v) => { W.stage = v; W.cat = ""; W.phase = ""; try { localStorage.setItem("lz-wissen-stage", v); } catch (e) { } LZ.render(); };
  LZ.inputs.push(e => {
    const id = e.target.id;
    if (id === "wi-cat" && e.type === "change") { W.cat = e.target.value; LZ.render(); }
    if (id === "wi-phase" && e.type === "change") { W.phase = e.target.value; LZ.render(); }
    if (id === "wi-q" && e.type === "input") { W.q = e.target.value; const pos = e.target.selectionStart; LZ.render(); const el = document.getElementById("wi-q"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
  });

  /* ---------- Seite ansehen ---------- */
  LZ.actions.wiPage = (b, v) => { W.page = W.data.pages.find(p => p.id === +v) || null; LZ.go("wissenSeite"); LZ.top(); };
  LZ.views.wissenSeite = () => {
    const p = W.page; if (!p) return `<button class="back" data-act="wiBack">‹ Trainer-Wissen</button>`;
    return `<button class="back noprint" data-act="wiBack">‹ Trainer-Wissen</button>
      <section><p class="eyebrow">${esc(stageName(p.stage))}</p><div class="rowspread"><h1>${esc(p.title)}</h1>${p.draft ? `<span class="badge muted">Entwurf</span>` : ""}</div>
        ${p.source ? `<p class="small">Quelle: ${esc(p.source)}</p>` : ""}</section>
      ${bodyHtml(p.body)}
      <p class="small">${p.updated ? `Zuletzt geändert ${esc(p.updated)}${p.by ? " von " + esc(p.by) : ""}` : ""}</p>
      <div class="chiprow noprint"><button class="btn ghost" data-act="wiEdit" data-v="${p.id}">Bearbeiten</button><button class="btn ghost" data-act="wiPrint">Drucken</button></div>`;
  };
  LZ.actions.wiBack = () => LZ.go("wissen");
  LZ.actions.wiPrint = () => window.print();

  /* ---------- Bearbeiten ---------- */
  LZ.actions.wiNew = (b, v) => {
    W.edit = { id: 0, kind: v === "page" ? "page" : "link", stage: W.stage, category: v === "page" ? "" : (W.cat || ""), phase: W.phase.length === 2 ? W.phase : "", title: "", body: "", url: "", source: "", draft: false };
    W.err = ""; W.confirm = false; LZ.go("wissenEdit"); LZ.top();
  };
  LZ.actions.wiEdit = (b, v) => {
    const k = W.data && W.data.pages.concat(W.data.links).find(x => x.id === +v); if (!k) return;
    W.edit = JSON.parse(JSON.stringify(k)); W.err = ""; W.confirm = false; LZ.go("wissenEdit"); LZ.top();
  };
  LZ.views.wissenEdit = () => {
    const e = W.edit; if (!e) return `<button class="back" data-act="wiBack">‹ Trainer-Wissen</button>`;
    const page = e.kind === "page";
    const phOpts = REF ? REF.groups.map(g => `<optgroup label="${esc(g.key + " · " + g.title)}">${g.phases.map(ph => `<option value="${ph.key}" ${e.phase === ph.key ? "selected" : ""}>${ph.key} ${esc(ph.title)}</option>`).join("")}</optgroup>`).join("") : "";
    return `<button class="back" data-act="wiCancel">‹ Abbrechen</button>
      <section><p class="eyebrow">Trainer-Wissen</p><h1>${e.id ? (page ? "Seite bearbeiten" : "Material bearbeiten") : (page ? "Neue Seite" : "Neues Material")}</h1></section>
      ${errBox()}
      <section class="card stack">
        <div class="fld"><label for="we-title">Titel</label><input id="we-title" maxlength="120" value="${esc(e.title)}"></div>
        <div class="fld"><label for="we-stage">Altersstufe</label><select id="we-stage">${STAGES.map(([k]) => `<option value="${k}" ${k === e.stage ? "selected" : ""}>${esc(stageName(k))}</option>`).join("")}</select></div>
        ${page ? "" : `<div class="fld"><label for="we-url">Adresse (https://…)</label><input id="we-url" type="url" maxlength="500" value="${esc(e.url)}" placeholder="https://drive.google.com/…"></div>
        <div class="fld"><label for="we-cat">Bereich</label><input id="we-cat" list="we-cats" maxlength="40" value="${esc(e.category)}"><datalist id="we-cats">${CATS.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
        <div class="fld"><label for="we-phase">Spielphase (optional)</label><select id="we-phase"><option value="">–</option>${phOpts}</select></div>`}
        <div class="fld"><label for="we-source">Quelle <span class="small">(z. B. Coaches' Voice Academy, DFB)</span></label><input id="we-source" maxlength="120" value="${esc(e.source)}"></div>
        ${page ? `<div class="fld"><label for="we-body">Text <span class="small">(„## Überschrift“ für Abschnitte, „- “ für Punkte; nur eigene Worte, nichts abschreiben)</span></label><textarea id="we-body" rows="18">${esc(e.body)}</textarea></div>` : ""}
        <label class="check"><input type="checkbox" id="we-draft" ${e.draft ? "checked" : ""}> Entwurf (noch zu prüfen)</label>
      </section>
      <div class="chiprow"><button class="btn" data-act="wiSave" ${W.busy ? "disabled" : ""}>Speichern</button><button class="btn ghost" data-act="wiCancel">Abbrechen</button></div>
      ${e.id && W.data && W.data.canDelete ? `<section class="card stack"><h2>Löschen</h2>${W.confirm
        ? `<p>Wirklich löschen?</p><div class="chiprow"><button class="btn danger-btn" data-act="wiDelete" data-v="1">Ja, löschen</button><button class="btn ghost" data-act="wiDelete" data-v="0">Nein</button></div>`
        : `<button class="btn ghost" data-act="wiDelete">Eintrag löschen</button>`}</section>` : ""}`;
  };
  const backTo = () => { if (W.edit && W.edit.kind === "page" && W.page && W.page.id === W.edit.id) LZ.go("wissenSeite"); else LZ.go("wissen"); };
  LZ.actions.wiCancel = () => { backTo(); W.edit = null; };
  LZ.actions.wiSave = async () => {
    const e = W.edit, page = e.kind === "page";
    const body = { action: "save", id: e.id || undefined, kind: e.kind, stage: val("we-stage"), title: val("we-title").trim(), source: val("we-source").trim(),
      draft: !!(document.getElementById("we-draft") || {}).checked };
    if (page) { body.body = val("we-body"); body.category = e.category; body.phase = e.phase; }
    else { body.url = val("we-url").trim(); body.category = val("we-cat").trim(); body.phase = val("we-phase"); }
    Object.assign(e, body);
    W.busy = true; LZ.render();
    const r = await St().send("wissen.php", body);
    W.busy = false;
    if (!r || !r.ok) { W.err = (r && r.error) || "Speichern hat nicht geklappt."; LZ.render(); return; }
    W.err = ""; await load();
    if (page) { W.page = W.data.pages.find(p => p.id === r.id) || null; W.edit = null; LZ.go(W.page ? "wissenSeite" : "wissen"); }
    else { W.edit = null; LZ.go("wissen"); }
  };
  LZ.actions.wiDelete = async (b, v) => {
    if (v === undefined) { W.confirm = true; LZ.render(); return; }
    if (v === "0") { W.confirm = false; LZ.render(); return; }
    const r = await St().send("wissen.php", { action: "delete", id: W.edit.id });
    if (!r || !r.ok) { W.err = (r && r.error) || "Löschen hat nicht geklappt."; LZ.render(); return; }
    W.edit = null; W.page = null; await load(); LZ.go("wissen");
  };
})();
