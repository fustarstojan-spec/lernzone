/*
 * Lernzone – Trainingsplanung (ab 0.24.0, nur Trainer, Weg B)
 * Einheiten (pro Termin, Mannschaft) aus Übungen der Vereins-Bibliothek. Einheitlicher Aufbau:
 *   Einheit: Kopf (Datum, Titel, Trainingsart, Schwerpunkt, Fokus, Ziel, Spieler) · Blöcke Einstimmung · Übungsform · Spielform · Ausklang
 *            oder (ab 0.26.0) ein hochgeladenes PDF. Schwerpunkte aus data/schwerpunkte.json (Spielphasen-Referenz des Trainers).
 *   Teilnehmer: bei vergangenen Terminen die Anwesenden, sonst alle ohne Absage
 *   Übung:   Organisation · Ablauf · Coachingpunkte · Leichter · Schwerer · Belastung · Material · Skizze (leere Abschnitte entfallen)
 * Daten: api/training.php
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const BLOCKS = [["einstimmung", "Einstimmung"], ["uebung", "Übungsform"], ["spiel", "Spielform"], ["ausklang", "Ausklang"]];
  const PHASES = { 1: "Eigener Ballbesitz", 2: "Umschalten nach Ballverlust", 3: "Gegnerischer Ballbesitz", 4: "Umschalten nach Ballgewinn", 5: "Standards" };
  const SECTIONS = [["organisation", "Organisation"], ["ablauf", "Ablauf"], ["coaching", "Coachingpunkte"], ["easier", "Leichter"], ["harder", "Schwerer"], ["load", "Belastung"]];
  let REF = null;   // data/schwerpunkte.json
  async function loadRef() { if (REF) return; try { REF = await (await fetch("data/schwerpunkte.json", { credentials: "same-origin" })).json(); } catch (e) { REF = { types: [], groups: [] }; } LZ.render(); }
  const phaseOf = key => { if (!REF || !key) return null; const k = key.split(".")[0]; for (const g of REF.groups) for (const ph of g.phases) if (ph.key === k) return { g, ph }; return null; };
  const focusLabel = key => { const f = phaseOf(key); if (!f) return ""; const i = key.split(".")[1]; return `${f.ph.key} ${f.ph.title}${i !== undefined && f.ph.sub[+i] ? " › " + f.ph.sub[+i].title : ""}`; };
  const P = { tab: "einheiten", list: null, drills: null, q: "", sess: null, sdrills: {}, training: null, edit: null, drill: null, dedit: null, boards: null, err: "", busy: false, confirm: false, back: null };
  const St = () => LZ.Store;
  const val = id => ((document.getElementById(id) || {}).value || "");
  const cal = () => LZ.calendar || { dayName: d => d, timeText: e => e.time };
  const fmtDate = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const bullets = t => { const l = (t || "").split("\n").filter(Boolean); return l.length ? `<ul>${l.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""; };
  const errBox = () => P.err ? `<p class="err" role="alert" style="text-align:left">${esc(P.err)}</p>` : "";

  async function loadList() { const r = await St().get("training.php"); if (r && r.ok) P.list = r; else P.err = (r && r.error) || "Laden hat nicht geklappt."; LZ.render(); }
  async function loadDrills() { const r = await St().get("training.php?drills=1"); if (r && r.ok) P.drills = r.drills; LZ.render(); }
  async function loadSession(q) {
    const r = await St().get("training.php?" + q);
    if (!r || !r.ok) { P.err = (r && r.error) || "Laden hat nicht geklappt."; LZ.render(); return null; }
    P.sess = r.session; P.sdrills = r.drills || {}; P.training = r.training || null; P.parts = r.participants || null; LZ.render(); return r;
  }
  LZ.on("enter", v => {
    if (["training", "einheit", "einheitEdit"].includes(v)) loadRef();
    if (v === "training") { P.err = ""; loadList(); if (P.tab === "uebungen" || !P.drills) loadDrills(); }
    if (v === "einheitEdit" || v === "uebungEdit") { if (!P.drills) loadDrills(); }
  });

  /* ---------- Übung anzeigen ---------- */
  function drillMeta(d, min) {
    return [d.topic, d.phase ? `Phase ${d.phase}` : "", (min || d.minutes) ? `${min || d.minutes} Min.` : "", d.players].filter(Boolean).map(esc).join(" · ");
  }
  function drillHtml(d, min, note) {
    if (!d) return `<p class="small">${esc(note || "")}</p>`;
    return `<div class="drill">
      <div class="rowspread"><h3>${esc(d.title)}</h3>${d.draft ? `<span class="badge muted">Entwurf</span>` : ""}</div>
      <p class="small">${drillMeta(d, min)}</p>
      ${note ? `<p class="drillnote">${esc(note)}</p>` : ""}
      ${d.image ? `<a class="drillimg" href="${esc(d.image)}" target="_blank" rel="noopener"><img src="${esc(d.image)}" alt="Skizze: ${esc(d.title)}" loading="lazy"></a>` : ""}
      ${d.sketch && window.LZPitch ? `<div class="drillsketch">${window.LZPitch.field({ zones: true, board: d.sketch, label: d.title })}</div>` : ""}
      ${SECTIONS.map(([k, l]) => d[k] ? `<div class="dsec"><h4>${l}</h4>${bullets(d[k])}</div>` : "").join("")}
      ${d.material ? `<div class="dsec"><h4>Material</h4><p>${esc(d.material)}</p></div>` : ""}
    </div>`;
  }

  /* ---------- Übersicht ---------- */
  function sessionsTab() {
    const L = P.list;
    if (!L) return `<p class="small">Lade …</p>`;
    const today = new Date().toISOString().slice(0, 10);
    const up = L.trainings.filter(t => t.date >= today), past = L.trainings.filter(t => t.date < today).reverse();
    const row = t => {
      const s = t.session ? L.sessions.find(x => x.id === t.session) : null;
      return `<li class="trow2"><span><b>${esc(cal().dayName(t.date))}</b> <span class="small">${esc(cal().timeText(t))}</span></span>
        ${t.state === 1 ? `<span class="small">${t.present} da</span>` : t.state === 2 ? `<span class="small">fällt aus</span>` : ""}
        ${s ? `<button class="linkbtn" data-act="trSess" data-v="${s.id}">${s.kind === "pdf" ? "📄 " : ""}${esc(s.title)}${s.minutes ? ` · ${s.minutes} Min.` : ""}${s.trainType && s.trainType !== "Mannschaftstraining" ? ` <span class="badge muted">${esc(s.trainType)}</span>` : ""}</button>`
            : `<button class="btn ghost small" data-act="trNew" data-v="${t.id}">+ Plan</button>`}</li>`;
    };
    const free = L.sessions.filter(s => !s.trainingId);
    return `<section class="card stack"><h2>Nächste Trainings</h2><ul class="tlist">${up.map(row).join("") || `<li class="small">Keine Trainings in den nächsten 3 Wochen.</li>`}</ul></section>
      ${past.length ? `<section class="card stack"><h2>Letzte Trainings</h2><ul class="tlist">${past.map(row).join("")}</ul></section>` : ""}
      <section class="card stack"><div class="rowspread"><h2>Ohne Termin</h2><button class="btn ghost small" data-act="trNew" data-v="">+ Einheit</button></div>
        <ul class="tlist">${free.map(s => `<li class="trow2"><span>${esc(s.date ? fmtDate(s.date) : "ohne Datum")}</span><button class="linkbtn" data-act="trSess" data-v="${s.id}">${esc(s.title)}</button></li>`).join("") || `<li class="small">Vorlagen oder Einheiten ohne Kalendertermin.</li>`}</ul></section>`;
  }
  function drillsTab() {
    if (!P.drills) return `<p class="small">Lade …</p>`;
    const q = P.q.trim().toLowerCase();
    const list = P.drills.filter(d => !q || [d.title, d.topic, d.players].join(" ").toLowerCase().includes(q));
    return `<div class="fld"><label for="tr-q">Suchen (Name oder Thema)</label><input id="tr-q" value="${esc(P.q)}" placeholder="z. B. 2v1" autocomplete="off"></div>
      <button class="btn" data-act="trDrillNew">+ Neue Übung</button>
      ${BLOCKS.map(([k, l]) => { const g = list.filter(d => d.block === k); return g.length ? `<section class="card stack"><h2>${l}</h2><ul class="tlist">${g.map(d =>
        `<li class="trow2"><button class="linkbtn" data-act="trDrill" data-v="${d.id}">${esc(d.title)}</button><span class="small">${esc([d.topic, d.minutes ? d.minutes + " Min." : ""].filter(Boolean).join(" · "))}${d.draft ? ` <span class="badge muted">Entwurf</span>` : ""}</span></li>`).join("")}</ul></section>` : ""; }).join("")
      || `<p class="small">${q ? "Nichts gefunden." : "Noch keine Übungen."}</p>`}`;
  }
  LZ.views.training = () => `${LZ.coachNav("training")}<section>${LZ.area("Trainer-Bereich")}<h1>Training</h1></section>
    <nav class="seg"><button aria-pressed="${P.tab === "einheiten"}" data-act="trTab" data-v="einheiten">Einheiten</button><button aria-pressed="${P.tab === "uebungen"}" data-act="trTab" data-v="uebungen">Übungen</button></nav>
    ${errBox()}${P.tab === "einheiten" ? sessionsTab() : drillsTab()}`;
  LZ.actions.trTab = (b, v) => { P.tab = v; if (v === "uebungen" && !P.drills) loadDrills(); LZ.render(); };

  /* ---------- Einheit ansehen ---------- */
  LZ.views.einheit = () => {
    const s = P.sess;
    if (!s) return `<button class="back noprint" data-act="trBack">‹ Training</button>${errBox() || `<p class="small">Lade …</p>`}`;
    const t = P.training;
    return `<button class="back noprint" data-act="trBack">‹ Training</button>
      <section class="sesshead"><p class="eyebrow">${esc(fmtDate(s.date))}${t && t.time ? ` · ${esc(cal().timeText({ time: t.time, endTime: t.end_time }))}` : ""}</p><h1>${esc(s.title)}</h1>
        <p class="small">${[s.trainType ? esc(s.trainType) : "", s.focus ? `Fokus: ${esc(s.focus)}` : "", !s.focusKey && s.phase ? `Spielphase ${s.phase}: ${PHASES[s.phase]}` : "", s.minutes ? `ca. ${s.minutes} Min.` : "", esc(s.players)].filter(Boolean).join(" · ")}</p>
        ${s.focusKey ? `<p><b>Schwerpunkt:</b> ${esc(focusLabel(s.focusKey))}</p>${s.focusPoints.length ? `<div class="chiprow">${s.focusPoints.map(x => `<span class="fpoint">${esc(x)}</span>`).join("")}</div>` : ""}` : ""}
        ${s.goal ? `<p><b>Ziel:</b> ${esc(s.goal)}</p>` : ""}</section>
      <div class="chiprow noprint"><button class="btn" data-act="trSessEdit">Bearbeiten</button>${s.kind === "pdf" ? "" : `<button class="btn ghost" data-act="trPrint">Drucken</button>`}</div>
      ${s.kind === "pdf" ? `<section class="card stack"><h2>Trainingsplan (PDF)</h2>${s.pdf ? `<p>📄 ${esc(s.pdfName || "Trainingsplan.pdf")}</p>
        <div class="chiprow"><a class="btn" href="${esc(s.pdf)}" target="_blank" rel="noopener">PDF öffnen</a><a class="btn ghost" href="${esc(s.pdf)}&download=1">Herunterladen</a></div>` : `<p class="small">Noch kein PDF hochgeladen.</p>`}</section>` : ""}
      ${partsCard()}
      ${BLOCKS.map(([k, l], bi) => { const items = s.blocks[k] || []; if (!items.length) return "";
        const min = items.reduce((a, i) => a + (i.min || 0), 0);
        return `<section class="card stack sessblock"><h2>${bi + 1}. ${l}${min ? ` <span class="small">(${min} Min.)</span>` : ""}</h2>${items.map(i => drillHtml(i.drill ? P.sdrills[i.drill] : null, i.min, i.note)).join("")}</section>`; }).join("")}
      ${s.notes ? `<section class="card stack"><h2>Notizen</h2>${bullets(s.notes)}</section>` : ""}`;
  };
  function partsCard() {
    const p = P.parts; if (!p) return "";
    const who = x => `<li><span class="pnr">${x.nr}</span> ${esc(x.name || "")}${x.reason ? ` <span class="small">– ${esc(x.reason)}</span>` : ""}</li>`;
    const title = p.state === "recorded" ? `Teilgenommen (${p.present.length})` : p.state === "cancelled" ? "Training fällt aus" : `Erwartet (${p.present.length})`;
    return `<section class="card stack parts"><h2>${title}</h2>
      ${p.state === "expected" ? `<p class="small">Noch nicht erfasst – alle, die nicht abgesagt haben.</p>` : ""}
      ${p.present.length ? `<ul class="plist">${p.present.map(who).join("")}</ul>` : ""}
      ${p.absent.length ? `<h3>Abgesagt (${p.absent.length})</h3><ul class="plist">${p.absent.map(who).join("")}</ul>` : ""}</section>`;
  }
  LZ.actions.trSess = async (b, v) => { P.back = LZ.S.view === "home" ? "home" : "training"; P.sess = null; P.err = ""; LZ.go("einheit"); LZ.top(); await loadSession("session=" + v); };
  LZ.actions.trBack = () => LZ.go(P.back || "training");
  LZ.actions.trPrint = () => window.print();
  /* von der Übersicht: Plan zu einem Termin öffnen oder anlegen */
  LZ.actions.trOpenTraining = async (b, v) => {
    P.back = "home"; P.sess = null; P.err = "";
    LZ.go("einheit"); const r = await loadSession("training=" + v);
    if (r && !r.session) LZ.actions.trNew(null, v);
  };

  /* ---------- Einheit bearbeiten ---------- */
  const blank = () => Object.fromEntries(BLOCKS.map(([k]) => [k, []]));
  LZ.actions.trNew = async (b, v) => {
    const t = v ? ((P.list && P.list.trainings.find(x => x.id === +v)) || P.training) : null;
    P.edit = { id: null, kind: null, trainingId: v ? +v : null, date: t ? t.date : "", title: "", focus: "", phase: "", goal: "", players: "", notes: "", blocks: blank(),
               trainType: "Mannschaftstraining", focusKey: "", focusPoints: [], pdfData: null, pdfName: "" };
    P.err = ""; P.confirm = false; LZ.go("einheitEdit"); LZ.top();
  };
  LZ.actions.trSessEdit = () => { P.edit = JSON.parse(JSON.stringify(P.sess)); P.err = ""; P.confirm = false; LZ.go("einheitEdit"); LZ.top(); };
  function syncEdit() {
    const e = P.edit; if (!e || !document.getElementById("se-title")) return;
    ["title", "focus", "goal", "players", "notes", "date"].forEach(k => { const el = document.getElementById("se-" + k); if (el) e[k] = el.value; });
    const ty = document.getElementById("se-type"); if (ty) e.trainType = ty.value;
    const ph = document.getElementById("se-fphase"), su = document.getElementById("se-fsub");
    if (ph) e.focusKey = ph.value ? ph.value + (su && su.value !== "" ? "." + su.value : "") : "";
    const pts = document.querySelectorAll("input[data-fpoint]"); if (pts.length || ph) e.focusPoints = [...pts].filter(x => x.checked).map(x => x.dataset.fpoint);
    BLOCKS.forEach(([k]) => e.blocks[k].forEach((it, i) => {
      it.drill = +val(`se-${k}-${i}-d`) || null; it.min = +val(`se-${k}-${i}-m`) || 0; it.note = val(`se-${k}-${i}-n`);
    }));
  }
  const drillOptions = (block, sel) => {
    const all = P.drills || [], own = all.filter(d => d.block === block), other = all.filter(d => d.block !== block);
    const opt = d => `<option value="${d.id}" ${d.id === sel ? "selected" : ""}>${esc(d.title)}${d.minutes ? ` (${d.minutes} Min.)` : ""}</option>`;
    const missing = sel && !all.some(d => d.id === sel) ? `<option value="${sel}" selected>${esc((P.sdrills[sel] || {}).title || "Übung")}</option>` : "";
    return `<option value="">– nur Notiz –</option>${missing}${own.map(opt).join("")}${other.length ? `<optgroup label="Andere">${other.map(opt).join("")}</optgroup>` : ""}`;
  };
  /* Schwerpunkt: Phase → Unterphase → einzelne Schwerpunkte (aus der Spielphasen-Referenz) */
  function focusPicker(e) {
    if (!REF) return `<p class="small">Lade Schwerpunkte …</p>`;
    const [pk, si] = (e.focusKey || "").split("."), f = phaseOf(pk);
    return `<div class="fld"><label for="se-fphase">Schwerpunkt – Spielphase</label><select id="se-fphase"><option value="">– kein Schwerpunkt –</option>
        ${REF.groups.map(g => `<optgroup label="${esc(g.key + " · " + g.title)}">${g.phases.map(ph => `<option value="${ph.key}" ${ph.key === pk ? "selected" : ""}>${ph.key} ${esc(ph.title)}</option>`).join("")}</optgroup>`).join("")}</select></div>
      ${f ? `<div class="fld"><label for="se-fsub">Unterphase</label><select id="se-fsub"><option value="">– ganze Phase –</option>${f.ph.sub.map((x, i) => `<option value="${i}" ${String(i) === si ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select></div>` : ""}
      ${f && si !== undefined && si !== "" && f.ph.sub[+si] ? `<fieldset class="fpoints"><legend class="small">Schwerpunkte (mehrere möglich)</legend>${f.ph.sub[+si].points.map(x =>
        `<label class="check"><input type="checkbox" data-fpoint="${esc(x)}" ${e.focusPoints.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</fieldset>` : ""}`;
  }
  LZ.views.einheitEdit = () => {
    const e = P.edit; if (!e) return `<button class="back" data-act="trBack">‹ Training</button>`;
    const head = `<button class="back" data-act="trEditCancel">‹ Abbrechen</button>
      <section><p class="eyebrow">${e.trainingId ? esc(fmtDate(e.date)) : "Einheit"}</p><h1>${e.id ? "Einheit bearbeiten" : "Neue Einheit"}</h1></section>`;
    if (!e.kind) return `${head}<section class="card stack"><h2>Wie willst du die Einheit anlegen?</h2>
      <button class="choice" data-act="trKind" data-v="plan"><b>Aus Übungen zusammenstellen</b><span class="small">Übungen aus der Bibliothek in Einstimmung · Übungsform · Spielform · Ausklang</span></button>
      <button class="choice" data-act="trKind" data-v="pdf"><b>PDF hochladen</b><span class="small">Fertigen Trainingsplan als PDF anhängen (höchstens 15 MB)</span></button></section>`;
    const total = BLOCKS.reduce((a, [k]) => a + e.blocks[k].reduce((x, i) => x + (+i.min || 0), 0), 0);
    const types = (REF && REF.types) || ["Mannschaftstraining"];
    return `${head}
      <section class="card stack">
        <div class="fld"><label for="se-type">Trainingsart</label><select id="se-type">${types.map(t => `<option ${t === e.trainType ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="fld"><label for="se-title">Titel</label><input id="se-title" maxlength="80" value="${esc(e.title)}" placeholder="z. B. 2v1 – Koordination"></div>
        ${e.trainingId ? "" : `<div class="fld"><label for="se-date">Datum (optional)</label><input id="se-date" type="date" value="${esc(e.date)}"></div>`}
        <div class="fld"><label for="se-focus">Fokus des Monats</label><input id="se-focus" maxlength="60" value="${esc(e.focus)}" placeholder="z. B. 2v1"></div>
        ${focusPicker(e)}
        <div class="fld"><label for="se-goal">Ziel</label><input id="se-goal" maxlength="300" value="${esc(e.goal)}" placeholder="Was sollen die Spieler danach können?"></div>
        <div class="fld"><label for="se-players">Spieler</label><input id="se-players" maxlength="100" value="${esc(e.players)}" placeholder="z. B. 18 Spieler + 2 TW"></div>
      </section>
      ${e.kind === "pdf" ? `<section class="card stack"><h2>Trainingsplan (PDF)</h2>
        ${e.pdfData ? `<p>📄 ${esc(e.pdfName)} <span class="small">(neu, wird beim Speichern hochgeladen)</span></p>` : e.pdf ? `<p>📄 ${esc(e.pdfName || "Trainingsplan.pdf")}</p>` : ""}
        <div class="fld"><label for="se-pdf">${e.pdf || e.pdfData ? "Anderes PDF wählen" : "PDF auswählen"}</label><input id="se-pdf" type="file" accept="application/pdf,.pdf"></div>
        <p class="small">Bitte keine Gesundheitsangaben über Kinder in hochgeladene Pläne schreiben.</p></section>` : ""}
      ${e.kind === "pdf" ? "" : BLOCKS.map(([k, l], bi) => `<section class="card stack"><h2>${bi + 1}. ${l}</h2>
        ${e.blocks[k].map((it, i) => `<div class="sitem">
          <div class="fld"><label for="se-${k}-${i}-d">Übung</label><select id="se-${k}-${i}-d">${drillOptions(k, it.drill)}</select></div>
          <div class="sitem-row"><div class="fld"><label for="se-${k}-${i}-m">Min.</label><input id="se-${k}-${i}-m" type="number" min="0" max="120" inputmode="numeric" value="${it.min || ""}"></div>
            <div class="fld grow"><label for="se-${k}-${i}-n">Notiz</label><input id="se-${k}-${i}-n" maxlength="300" value="${esc(it.note)}" placeholder="${k === "ausklang" ? "z. B. Auslaufen, Feedback-Runde" : "optional"}"></div></div>
          <div class="chiprow"><button class="linkbtn" data-act="trItem" data-v="up" data-b="${k}" data-i="${i}" ${i ? "" : "disabled"}>↑</button><button class="linkbtn" data-act="trItem" data-v="down" data-b="${k}" data-i="${i}" ${i < e.blocks[k].length - 1 ? "" : "disabled"}>↓</button><button class="linkbtn" data-act="trItem" data-v="del" data-b="${k}" data-i="${i}">Entfernen</button></div>
        </div>`).join("")}
        <button class="linkbtn" data-act="trItem" data-v="add" data-b="${k}">+ ${k === "ausklang" ? "Eintrag" : "Übung"}</button></section>`).join("")}
      <section class="card stack"><div class="fld"><label for="se-notes">Notizen (eine pro Zeile)</label><textarea id="se-notes" rows="3">${esc(e.notes)}</textarea></div>
        ${e.kind === "pdf" ? "" : `<p class="small">Gesamt: ${total} Min.</p>`}${errBox()}
        <div class="chiprow"><button class="btn" data-act="trSessSave" ${P.busy ? "disabled" : ""}>Speichern</button>
        ${e.id ? (P.confirm ? `<button class="btn danger-btn" data-act="trSessDel">Wirklich löschen?</button><button class="linkbtn" data-act="trConfirm" data-v="0">Nein</button>` : `<button class="linkbtn" data-act="trConfirm" data-v="1">Löschen</button>`) : ""}</div></section>`;
  };
  LZ.actions.trKind = (b, v) => { P.edit.kind = v; LZ.render(); };
  LZ.inputs.push(e => {
    const id = e.target.id;
    if ((id === "se-fphase" || id === "se-fsub") && e.type === "change") {
      syncEdit(); if (id === "se-fphase") P.edit.focusKey = e.target.value; P.edit.focusPoints = []; LZ.render();
    }
    if (id === "se-pdf" && e.type === "change" && e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > 15 * 1024 * 1024) { P.err = "Das PDF ist zu groß (höchstens 15 MB)."; LZ.render(); return; }
      const rd = new FileReader();
      rd.onload = () => { syncEdit(); P.edit.pdfData = rd.result; P.edit.pdfName = f.name; if (!P.edit.title) P.edit.title = f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, 80); P.err = ""; LZ.render(); };
      rd.readAsDataURL(f);
    }
  });
  LZ.actions.trItem = b => {
    syncEdit();
    const list = P.edit.blocks[b.dataset.b], i = +b.dataset.i, v = b.dataset.v;
    if (v === "add") list.push({ drill: null, min: 0, note: "" });
    else if (v === "del") list.splice(i, 1);
    else { const j = v === "up" ? i - 1 : i + 1; if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; }
    LZ.render();
  };
  LZ.actions.trConfirm = (b, v) => { syncEdit(); P.confirm = v === "1"; LZ.render(); };
  LZ.actions.trEditCancel = () => { if (P.edit && P.edit.id) LZ.go("einheit"); else LZ.go(P.back || "training"); };
  LZ.actions.trSessSave = async () => {
    syncEdit(); if (P.busy) return;
    const e = P.edit; P.busy = true; P.err = ""; LZ.render();
    const body = Object.assign({ action: "session_save" }, e); delete body.pdfData; delete body.pdf;
    if (e.pdfData) body.pdf = e.pdfData;
    const r = await St().send("training.php", body);
    P.busy = false;
    if (!r || !r.ok) { P.err = (r && r.error) || "Speichern hat nicht geklappt."; LZ.render(); return; }
    P.list = null; LZ.go("einheit"); LZ.top(); await loadSession("session=" + r.id);
  };
  LZ.actions.trSessDel = async () => {
    const r = await St().send("training.php", { action: "session_delete", id: P.edit.id });
    if (r && r.ok) { P.edit = null; P.sess = null; LZ.go("training"); } else { P.err = (r && r.error) || "Löschen hat nicht geklappt."; LZ.render(); }
  };
  // Minuten aus der Übung übernehmen, wenn noch leer
  LZ.inputs.push(e => {
    const m = e.target.id && e.target.id.match(/^se-(\w+)-(\d+)-d$/);
    if (m && e.type === "change") { const d = (P.drills || []).find(x => x.id === +e.target.value), mi = document.getElementById(`se-${m[1]}-${m[2]}-m`); if (d && mi && !+mi.value && d.minutes) mi.value = d.minutes; }
    if (e.target.id === "tr-q") { P.q = e.target.value; const pos = e.target.selectionStart; LZ.render(); const el = document.getElementById("tr-q"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
  });

  /* ---------- Übung ansehen / bearbeiten ---------- */
  LZ.actions.trDrill = (b, v) => { P.drill = (P.drills || []).find(d => d.id === +v) || null; P.err = ""; LZ.go("uebung"); LZ.top(); };
  LZ.views.uebung = () => {
    const d = P.drill; if (!d) return `<button class="back" data-act="trBackDrills">‹ Übungen</button>`;
    return `<button class="back noprint" data-act="trBackDrills">‹ Übungen</button>
      <section><p class="eyebrow">${esc((BLOCKS.find(([k]) => k === d.block) || [, ""])[1])}${d.phase ? ` · Spielphase ${d.phase}` : ""}</p></section>
      <section class="card stack">${drillHtml(d)}</section>
      ${errBox()}<p class="small">${d.by ? `Zuletzt geändert von ${esc(d.by)}` : ""}${d.updated ? ` · ${esc(d.updated)}` : ""}</p>
      <div class="chiprow noprint"><button class="btn" data-act="trDrillEdit">Bearbeiten</button><button class="btn ghost" data-act="trPrint">Drucken</button></div>`;
  };
  LZ.actions.trBackDrills = () => { P.tab = "uebungen"; LZ.go("training"); };
  LZ.actions.trDrillNew = () => { P.dedit = { id: null, title: "", topic: "", phase: "1", block: "uebung", minutes: "", players: "", organisation: "", ablauf: "", coaching: "", easier: "", harder: "", load: "", material: "", sketch: null, draft: false }; P.err = ""; P.confirm = false; loadBoards(); LZ.go("uebungEdit"); LZ.top(); };
  LZ.actions.trDrillEdit = () => { P.dedit = JSON.parse(JSON.stringify(P.drill)); P.err = ""; P.confirm = false; loadBoards(); LZ.go("uebungEdit"); LZ.top(); };
  async function loadBoards() { const r = await St().get("boards.php"); P.boards = r && r.ok ? r.boards : []; LZ.render(); }
  const ta = (k, l, hint, rows = 4) => `<div class="fld"><label for="de-${k}">${l} <span class="small">${hint || "(ein Punkt pro Zeile)"}</span></label><textarea id="de-${k}" rows="${rows}">${esc(P.dedit[k] || "")}</textarea></div>`;
  function syncDrill() {
    const d = P.dedit; if (!d || !document.getElementById("de-title")) return;
    ["title", "topic", "phase", "block", "minutes", "players", "organisation", "ablauf", "coaching", "easier", "harder", "load", "material"].forEach(k => { const el = document.getElementById("de-" + k); if (el) d[k] = el.value; });
    const dr = document.getElementById("de-draft"); if (dr) d.draft = dr.checked;
    const bo = document.getElementById("de-board"); d.boardId = bo && bo.value ? +bo.value : null;
  }
  LZ.views.uebungEdit = () => {
    const d = P.dedit; if (!d) return `<button class="back" data-act="trBackDrills">‹ Übungen</button>`;
    return `<button class="back" data-act="trDrillCancel">‹ Abbrechen</button>
      <section><p class="eyebrow">Übungsbibliothek des Vereins</p><h1>${d.id ? "Übung bearbeiten" : "Neue Übung"}</h1></section>
      <section class="card stack">
        <div class="fld"><label for="de-title">Name</label><input id="de-title" maxlength="80" value="${esc(d.title)}" placeholder="z. B. 2v1 – Paar-Jagd"></div>
        <div class="sitem-row"><div class="fld grow"><label for="de-topic">Thema</label><input id="de-topic" maxlength="40" value="${esc(d.topic)}" placeholder="z. B. 2v1"></div>
          <div class="fld"><label for="de-minutes">Min.</label><input id="de-minutes" type="number" min="0" max="120" value="${esc(d.minutes || "")}"></div></div>
        <div class="fld"><label for="de-block">Block</label><select id="de-block">${BLOCKS.map(([k, l]) => `<option value="${k}" ${d.block === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="fld"><label for="de-phase">Spielphase</label><select id="de-phase"><option value="">–</option>${Object.entries(PHASES).map(([k, l]) => `<option value="${k}" ${d.phase === k ? "selected" : ""}>${k} · ${l}</option>`).join("")}</select></div>
        <div class="fld"><label for="de-players">Spieler</label><input id="de-players" maxlength="200" value="${esc(d.players)}" placeholder="z. B. 16–18 Spieler, 2 TW"></div>
        ${ta("organisation", "Organisation", "(Feld, Aufbau, Gruppen – ein Punkt pro Zeile)")}
        ${ta("ablauf", "Ablauf", "", 5)}
        ${ta("coaching", "Coachingpunkte", "(Was – Wie – Warum, ein Punkt pro Zeile)")}
        ${ta("easier", "Leichter", "", 2)}${ta("harder", "Schwerer", "", 2)}
        ${ta("load", "Belastung", "(Dauer, Durchgänge, Pausen)", 2)}
        <div class="fld"><label for="de-material">Material</label><input id="de-material" maxlength="300" value="${esc(d.material)}" placeholder="z. B. 4 Leitern, 8 Minihürden, 8 Hütchen"></div>
        <div class="fld"><label for="de-image">Bild der Übung <span class="small">(JPG, PNG oder WebP, höchstens 6 MB)</span></label>
          ${d.imageData ? `<img class="drillimg-prev" src="${d.imageData}" alt="Neues Bild">` : d.image && !d.imageClear ? `<img class="drillimg-prev" src="${esc(d.image)}" alt="Bild">` : ""}
          <input id="de-image" type="file" accept="image/jpeg,image/png,image/webp">
          ${(d.image && !d.imageClear) || d.imageData ? `<button class="linkbtn" data-act="trImgDel">Bild entfernen</button>` : ""}</div>
        <div class="fld"><label for="de-board">Skizze aus Taktiktafel übernehmen</label><select id="de-board"><option value="">${d.sketch ? "– Skizze behalten –" : "– keine –"}</option>${(P.boards || []).filter(b => b.kind === "board").map(b => `<option value="${b.id}">${esc(b.title || "Tafel")}</option>`).join("")}</select>
          <span class="small">Skizze zuerst unter „Taktik“ zeichnen und speichern.</span></div>
        ${d.sketch ? `<div class="drillsketch">${window.LZPitch.field({ zones: true, board: d.sketch, label: "Skizze" })}</div><button class="linkbtn" data-act="trSketchDel">Skizze entfernen</button>` : ""}
        <label class="check"><input type="checkbox" id="de-draft" ${d.draft ? "checked" : ""}> Entwurf (noch prüfen)</label>
        ${errBox()}
        <div class="chiprow"><button class="btn" data-act="trDrillSave" ${P.busy ? "disabled" : ""}>Speichern</button>
        ${d.id ? (P.confirm ? `<button class="btn danger-btn" data-act="trDrillDel">Wirklich löschen?</button><button class="linkbtn" data-act="trDConfirm" data-v="0">Nein</button>` : `<button class="linkbtn" data-act="trDConfirm" data-v="1">Löschen</button>`) : ""}</div>
      </section>`;
  };
  LZ.actions.trImgDel = () => { syncDrill(); P.dedit.imageData = null; P.dedit.imageClear = true; LZ.render(); };
  LZ.inputs.push(e => {
    if (e.target.id !== "de-image" || e.type !== "change" || !e.target.files || !e.target.files[0]) return;
    const f = e.target.files[0];
    if (f.size > 6 * 1024 * 1024) { P.err = "Das Bild ist zu groß (höchstens 6 MB)."; LZ.render(); return; }
    const rd = new FileReader();
    rd.onload = () => { syncDrill(); P.dedit.imageData = rd.result; P.dedit.imageClear = false; P.err = ""; LZ.render(); };
    rd.readAsDataURL(f);
  });
  LZ.actions.trDConfirm = (b, v) => { syncDrill(); P.confirm = v === "1"; LZ.render(); };
  LZ.actions.trSketchDel = () => { syncDrill(); P.dedit.sketch = null; P.dedit.clearSketch = true; LZ.render(); };
  LZ.actions.trDrillCancel = () => LZ.go(P.dedit && P.dedit.id ? "uebung" : "training");
  LZ.actions.trDrillSave = async () => {
    syncDrill(); if (P.busy) return;
    const d = P.dedit, body = Object.assign({ action: "drill_save" }, d);
    delete body.sketch; if (d.clearSketch) body.sketch = null;
    delete body.image; delete body.imageData; if (d.imageData) body.image = d.imageData; body.imageClear = !!d.imageClear && !d.imageData;
    P.busy = true; P.err = ""; LZ.render();
    const r = await St().send("training.php", body);
    P.busy = false;
    if (!r || !r.ok) { P.err = (r && r.error) || "Speichern hat nicht geklappt."; LZ.render(); return; }
    P.drill = r.drill; P.drills = null; loadDrills(); LZ.go("uebung"); LZ.top();
    if (r.warning) { P.err = r.warning; LZ.render(); }
  };
  LZ.actions.trDrillDel = async () => {
    const r = await St().send("training.php", { action: "drill_delete", id: P.dedit.id });
    if (r && r.ok) { P.drills = null; P.tab = "uebungen"; LZ.go("training"); } else { P.err = (r && r.error) || "Löschen hat nicht geklappt."; LZ.render(); }
  };
})();
