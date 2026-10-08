/*
 * Lernzone – Taktiktafel und Aufstellungen (nur Weg B / PHP)
 * Trainer (Reiter „Taktik“): freie Tafel mit eigenen Spielern, Gegnern, Ball, Pässen, Laufwegen und Linien;
 *   Aufstellung pro Spiel (Spieler aus dem Kader den Positionen zuordnen, Rest = Bank); speichern; für Spieler freigeben.
 * Spieler: freigegebene Tafeln ansehen (Startseite) – nur die eigene Nummer ist sichtbar, gelber Ring.
 * Daten: api/boards.php · Maße in Metern (68 × 105, Angriff nach oben)
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const TB = { list: null, games: [], cur: null, mode: "move", sel: null, dirty: false, msg: "", err: "", busy: false, view: null, shared: null };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- Grundordnungen (eigene Seite unten, Angriff nach oben) ---------- */
  const OWN_4141 = [["TW", 34, 100], ["LV", 9, 80], ["IV", 26, 86], ["IV", 42, 86], ["RV", 59, 80], ["6", 34, 74],
    ["LA", 9, 58], ["8", 24, 63], ["8", 44, 63], ["RA", 59, 58], ["ST", 34, 47]];
  const OPP = {
    "4-4-2": [[34, 5], [10, 22], [26, 19], [42, 19], [58, 22], [10, 36], [26, 34], [42, 34], [58, 36], [27, 46], [41, 46]],
    "4-3-3": [[34, 5], [10, 22], [26, 19], [42, 19], [58, 22], [22, 33], [34, 30], [46, 33], [12, 45], [34, 47], [56, 45]]
  };

  async function loadList() {
    const r = await LZ.Store.get("boards.php");
    if (r && r.ok) { TB.list = r.boards; TB.games = r.games || []; } else TB.err = (r && r.error) || "Konnte die Tafeln nicht laden.";
    if (LZ.S.view === "taktik") LZ.render();
  }
  LZ.on("enter", v => { if (v === "taktik" && LZ.coachMode()) { TB.cur = null; TB.msg = ""; loadList(); LZ.Store.refreshPlayers().then(() => LZ.render()); } });

  /* ---------- Liste ---------- */
  const gameText = g => g ? `${(LZ.calendar ? LZ.calendar.dayName(g.date) : g.date)}${g.time ? " · " + g.time : ""} · ${g.title}` : "";
  const thumb = d => `<span class="thumb">${window.LZPitch.field({ zones: false, board: d, label: "Vorschau" })}</span>`;
  function listView() {
    if (TB.pickGame) return `${LZ.coachNav("taktik")}<button class="back" data-act="tbBackList">‹ Taktik</button>
      <section><p class="eyebrow">Neue Aufstellung</p><h1>Für welches Spiel?</h1></section>
      <ul class="blist">${TB.games.map(g => `<li><button data-act="tbNewLineup" data-v="${g.id}"><span><b>${esc(g.title)}</b><span class="small">${esc(gameText(g))}</span></span>${LZ.calendar ? LZ.calendar.chip(g.kind) : ""}</button></li>`).join("")}
        <li><button data-act="tbNewLineup" data-v="0"><span><b>Ohne Spiel</b><span class="small">z. B. für ein Testspiel oder zum Ausprobieren</span></span></button></li></ul>`;
    const L = TB.list;
    return `${LZ.coachNav("taktik")}<section><p class="eyebrow">Trainer-Bereich</p><h1>Taktik</h1>
      <p class="lede">Taktiktafel und Aufstellungen. Freigegebene Tafeln sehen die Spieler auf ihrer Startseite.</p></section>
      <div class="row"><button class="btn" data-act="tbNew">Neue Taktiktafel</button><button class="btn ghost" data-act="tbPickGame">Neue Aufstellung</button></div>
      ${TB.err ? `<p class="err" style="text-align:left">${esc(TB.err)}</p>` : ""}
      ${L === null ? `<p class="small">Lade …</p>` : !L.length ? `<p class="small">Noch nichts gespeichert.</p>` :
        `<ul class="blist">${L.map(b => `<li><button data-act="tbOpen" data-v="${b.id}"><span><b>${esc(b.title)}</b>
          <span class="small">${b.kind === "lineup" ? "Aufstellung" : "Taktiktafel"}${b.game ? " · " + esc(gameText(b.game)) : ""}</span>
          <span class="small">${b.shared ? "für Spieler sichtbar" : "nur Trainer"}${b.by ? " · " + esc(b.by) : ""}</span></span><span aria-hidden="true">›</span></button></li>`).join("")}</ul>`}`;
  }
  LZ.actions.tbPickGame = () => { TB.pickGame = true; LZ.render(); };
  LZ.actions.tbBackList = () => { TB.pickGame = false; TB.cur = null; loadList(); LZ.render(); };
  LZ.actions.tbNew = () => edit({ id: null, title: "", kind: "board", trainingId: null, shared: false,
    data: { items: OWN_4141.map(([lab, x, y]) => ({ id: uid(), t: "own", x, y, lab })).concat(OPP["4-4-2"].map(([x, y], i) => ({ id: uid(), t: "opp", x, y, lab: String(i + 1) })), [{ id: uid(), t: "ball", x: 34, y: 52.5 }]), lines: [] } });
  LZ.actions.tbNewLineup = (b, v) => {
    const g = TB.games.find(x => x.id === +v);
    edit({ id: null, title: g ? "Aufstellung " + g.title : "Aufstellung", kind: "lineup", trainingId: g ? g.id : null, shared: false,
      data: { items: OWN_4141.map(([lab, x, y]) => ({ id: uid(), t: "own", x, y, lab })), lines: [] } });
    autoFill(); LZ.render();
  };
  LZ.actions.tbOpen = async (b, v) => {
    const r = await LZ.Store.get("boards.php?id=" + v);
    if (!r.ok) { TB.err = r.error; LZ.render(); return; }
    edit(r.board);
  };
  function edit(board) {
    TB.cur = clone(board); TB.cur.data.items = TB.cur.data.items || []; TB.cur.data.lines = TB.cur.data.lines || [];
    TB.mode = "move"; TB.sel = null; TB.dirty = !board.id; TB.msg = ""; TB.err = ""; TB.pickGame = false; TB.confirm = false;
    LZ.render(); LZ.top();
  }

  /* ---------- Editor ---------- */
  const MODES = [["move", "Bewegen"], ["pass", "Pass →"], ["run", "Laufweg ⇢"], ["line", "Linie"], ["del", "Löschen"]];
  function editorView() {
    const c = TB.cur, d = c.data;
    const items = d.items.map(it => Object.assign({}, it, { sel: it.id === TB.sel }));
    const used = new Set(d.items.filter(i => i.nr).map(i => i.nr));
    const players = LZ.C.players || [];
    const bench = players.filter(p => !used.has(p.nr));
    const selIt = d.items.find(i => i.id === TB.sel);
    return `${LZ.coachNav("taktik")}<button class="back" data-act="tbBackList">‹ Taktik</button>
      <section class="stack"><p class="eyebrow">${c.kind === "lineup" ? "Aufstellung" : "Taktiktafel"}${TB.dirty ? " · nicht gespeichert" : ""}</p>
        <div class="fld"><label for="tb-title">Titel</label><input id="tb-title" maxlength="60" value="${esc(c.title)}" placeholder="${c.kind === "lineup" ? "Aufstellung" : "z. B. Pressing gegen Aufbau mit Dreierkette"}"></div>
        ${c.kind === "lineup" ? `<div class="fld"><label for="tb-game">Spiel</label><select id="tb-game"><option value="">– ohne Spiel –</option>${TB.games.map(g => `<option value="${g.id}" ${g.id === c.trainingId ? "selected" : ""}>${esc(gameText(g))}</option>`).join("")}</select></div>` : ""}
      </section>
      <div class="tbar" role="group" aria-label="Werkzeug">${MODES.map(([k, l]) => `<button aria-pressed="${TB.mode === k}" data-act="tbMode" data-v="${k}">${l}</button>`).join("")}</div>
      <div class="tboard" id="tb-pitch">${window.LZPitch.field({ zones: true, board: { items, lines: d.lines }, label: "Taktiktafel" })}</div>
      <p class="small">${TB.mode === "move" ? "Figuren mit dem Finger oder der Maus verschieben. Antippen wählt eine Figur aus." : TB.mode === "del" ? "Figur oder Linie antippen, um sie zu entfernen." : "Auf dem Feld ziehen, um zu zeichnen."}</p>
      <div class="tbar">
        <button data-act="tbAdd" data-v="own">+ Eigener</button><button data-act="tbAdd" data-v="opp">+ Gegner</button><button data-act="tbAdd" data-v="ball">+ Ball</button>
        <button data-act="tbPreset" data-v="own">Wir 4-1-4-1</button><button data-act="tbPreset" data-v="4-4-2">Gegner 4-4-2</button><button data-act="tbPreset" data-v="4-3-3">Gegner 4-3-3</button>
        <button data-act="tbClear" data-v="lines">Linien weg</button><button data-act="tbClear" data-v="opp">Gegner weg</button>
      </div>
      ${selIt && selIt.t !== "ball" ? `<section class="card stack"><div class="rowspread"><h3>Ausgewählt: ${esc(selIt.nr ? "Nr. " + selIt.nr : selIt.lab || "Figur")}</h3><button class="linkbtn" data-act="tbSel" data-v="">fertig</button></div>
        <div class="fld"><label for="tb-lab">Beschriftung (Position)</label><input id="tb-lab" maxlength="4" value="${esc(selIt.lab || "")}"></div>
        ${selIt.t === "own" ? `<p class="small">Spieler zuordnen: Nummer antippen.${selIt.nr ? ` <button class="linkbtn" data-act="tbAssign" data-v="0">Nummer entfernen</button>` : ""}</p>` : ""}</section>` : ""}
      ${players.length ? `<section class="card stack"><div class="rowspread"><h3>${c.kind === "lineup" ? "Kader" : "Spieler zuordnen (optional)"}</h3>${c.kind === "lineup" ? `<button class="linkbtn" data-act="tbAuto">nach Positionen füllen</button>` : ""}</div>
        <p class="small">${selIt && selIt.t === "own" ? "Tippe eine Nummer an, um sie der ausgewählten Figur zu geben." : "Erst eine eigene Figur auf dem Feld antippen, dann hier die Nummer."}</p>
        <div class="squad">${players.map(p => `<button class="${used.has(p.nr) ? "used" : ""}" data-act="tbAssign" data-v="${p.nr}" title="${esc([p.posOff, p.posDef].filter(Boolean).join(" / "))}">${LZ.shirt(p.nr)}<span>${esc((p.name || "").split(" ")[0] || [p.posOff, p.posDef].filter(Boolean).join("/") || "")}</span></button>`).join("")}</div>
        ${c.kind === "lineup" ? `<p class="small"><b>Startelf:</b> ${used.size} · <b>Bank:</b> ${bench.map(p => p.nr).join(", ") || "–"}</p>` : ""}</section>` : ""}
      <label class="check"><input type="checkbox" id="tb-shared" ${c.shared ? "checked" : ""}> Für Spieler sichtbar (sie sehen Positionen und nur ihre eigene Nummer)</label>
      ${TB.err ? `<p class="err" style="text-align:left">${esc(TB.err)}</p>` : ""}${TB.msg ? `<p class="okmsg">${esc(TB.msg)}</p>` : ""}
      <div class="row"><button class="btn" data-act="tbSave" ${TB.busy ? "disabled" : ""}>Speichern</button>
        ${c.id ? `<button class="btn ghost" data-act="tbCopy">Als Kopie</button><button class="btn ghost" data-act="tbDelAsk">Löschen</button>` : ""}</div>
      ${TB.confirm ? `<section class="card stack danger"><p><b>Wirklich löschen?</b></p><div class="row"><button class="btn danger-btn" data-act="tbDel">Ja, löschen</button><button class="btn ghost" data-act="tbDelNo">Abbrechen</button></div></section>` : ""}`;
  }

  LZ.views.taktik = () => {
    if (!LZ.coachMode()) return `<p class="small">Nur für Trainer.</p>`;
    return TB.cur ? editorView() : listView();
  };

  const changed = () => { TB.dirty = true; TB.msg = ""; };
  LZ.actions.tbMode = (b, v) => { TB.mode = v; TB.sel = null; LZ.render(); };
  LZ.actions.tbSel = (b, v) => { TB.sel = v || null; LZ.render(); };
  LZ.actions.tbAdd = (b, v) => {
    const n = TB.cur.data.items.filter(i => i.t === v).length;
    if (v === "ball" && n) return;
    const it = { id: uid(), t: v, x: v === "opp" ? 34 + (n % 5) * 3 - 6 : 34, y: v === "opp" ? 30 : v === "ball" ? 52.5 : 70, lab: v === "opp" ? String(n + 1) : "" };
    TB.cur.data.items.push(it); TB.sel = v === "ball" ? null : it.id; TB.mode = "move"; changed(); LZ.render();
  };
  LZ.actions.tbPreset = (b, v) => {
    const d = TB.cur.data;
    if (v === "own") {
      const keep = d.items.filter(i => i.t === "own");
      d.items = d.items.filter(i => i.t !== "own").concat(OWN_4141.map(([lab, x, y], i) => ({ id: uid(), t: "own", x, y, lab, nr: keep[i] && keep[i].lab === lab ? keep[i].nr : undefined })));
    } else d.items = d.items.filter(i => i.t !== "opp").concat(OPP[v].map(([x, y], i) => ({ id: uid(), t: "opp", x, y, lab: String(i + 1) })));
    TB.sel = null; changed(); LZ.render();
  };
  LZ.actions.tbClear = (b, v) => { const d = TB.cur.data; if (v === "lines") d.lines = []; else d.items = d.items.filter(i => i.t !== v); TB.sel = null; changed(); LZ.render(); };
  LZ.actions.tbAssign = (b, v) => {
    const it = TB.cur.data.items.find(i => i.id === TB.sel);
    if (!it || it.t !== "own") { TB.err = "Erst eine eigene Figur auf dem Feld antippen."; LZ.render(); return; }
    const nr = +v; TB.err = "";
    TB.cur.data.items.forEach(i => { if (nr && i.nr === nr) delete i.nr; });   // Nummer nur einmal auf dem Feld
    if (nr) it.nr = nr; else delete it.nr;
    // nächste eigene Figur ohne Nummer auswählen – schnelles Durchtippen
    const next = TB.cur.data.items.find(i => i.t === "own" && !i.nr);
    TB.sel = nr && next ? next.id : TB.sel;
    changed(); LZ.render();
  };
  function autoFill() {
    const d = TB.cur.data, players = LZ.C.players || [], used = new Set(d.items.filter(i => i.nr).map(i => i.nr));
    const gk = LZ.gkNrs ? LZ.gkNrs() : [];
    for (const key of ["posOff", "posDef"]) d.items.filter(i => i.t === "own" && !i.nr).forEach(i => {
      const p = players.find(p => !used.has(p.nr) && (i.lab === "TW" ? gk.includes(p.nr) || p[key] === "TW" : p[key] === i.lab));
      if (p) { i.nr = p.nr; used.add(p.nr); }
    });
  }
  LZ.actions.tbAuto = () => { autoFill(); changed(); LZ.render(); };
  LZ.actions.tbSave = async () => {
    const c = TB.cur; TB.busy = true; TB.err = ""; LZ.render();
    const r = await LZ.Store.send("boards.php", { action: "save", id: c.id, title: c.title, kind: c.kind, trainingId: c.trainingId, shared: c.shared, data: c.data });
    TB.busy = false;
    if (!r.ok) { TB.err = r.error || "Speichern hat nicht geklappt."; LZ.render(); return; }
    c.id = r.id; TB.dirty = false; TB.msg = "Gespeichert."; LZ.render();
  };
  LZ.actions.tbCopy = () => { const c = clone(TB.cur); c.id = null; c.title = (c.title || "Tafel") + " (Kopie)"; c.shared = false; edit(c); };
  LZ.actions.tbDelAsk = () => { TB.confirm = true; LZ.render(); };
  LZ.actions.tbDelNo = () => { TB.confirm = false; LZ.render(); };
  LZ.actions.tbDel = async () => {
    const r = await LZ.Store.send("boards.php", { action: "delete", id: TB.cur.id });
    if (!r.ok) { TB.err = r.error; LZ.render(); return; }
    TB.cur = null; loadList(); LZ.render();
  };
  LZ.inputs.push(e => {
    if (!TB.cur || LZ.S.view !== "taktik") return;
    const id = e.target.id, d = TB.cur.data;
    if (id === "tb-title") { TB.cur.title = e.target.value; changed(); }
    else if (id === "tb-game" && e.type === "change") { TB.cur.trainingId = +e.target.value || null; changed(); }
    else if (id === "tb-shared" && e.type === "change") { TB.cur.shared = e.target.checked; changed(); }
    else if (id === "tb-lab") {
      const it = d.items.find(i => i.id === TB.sel); if (!it) return;
      it.lab = e.target.value.slice(0, 4); changed();
      const g = document.querySelector(`#tb-pitch [data-tok="${it.id}"]`);   // ohne Neuzeichnen, damit der Cursor bleibt
      if (g) { const ts = g.querySelectorAll("text"); if (it.nr) { if (ts[1]) ts[1].textContent = it.lab; } else if (ts[0]) ts[0].textContent = it.lab; }
    }
  });

  /* ---------- Ziehen und Zeichnen (Maus, Finger, Stift) ---------- */
  let P = null;
  const svgPt = (svg, e) => { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return [Math.max(-3, Math.min(71, p.x)), Math.max(-5, Math.min(110, p.y))]; };
  document.addEventListener("pointerdown", e => {
    const svg = e.target.closest("#tb-pitch svg"); if (!svg || !TB.cur) return;
    const tok = e.target.closest("[data-tok]"), line = e.target.closest("[data-line]"), d = TB.cur.data;
    const pt = svgPt(svg, e);
    if (TB.mode === "del") {
      if (tok) d.items = d.items.filter(i => i.id !== tok.dataset.tok);
      else if (line) d.lines = d.lines.filter(l => l.id !== line.dataset.line);
      else return;
      changed(); LZ.render(); return;
    }
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    if (TB.mode === "move") {
      if (!tok) { if (TB.sel) { TB.sel = null; LZ.render(); } return; }
      const it = d.items.find(i => i.id === tok.dataset.tok);
      P = { kind: "drag", it, el: tok, start: pt, off: [it.x - pt[0], it.y - pt[1]], moved: false };
    } else {
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("class", TB.mode); ln.setAttribute("x1", pt[0]); ln.setAttribute("y1", pt[1]); ln.setAttribute("x2", pt[0]); ln.setAttribute("y2", pt[1]);
      svg.appendChild(ln);
      // Start an einer Figur einrasten, damit Pässe sauber vom Spieler ausgehen
      const it = tok && d.items.find(i => i.id === tok.dataset.tok);
      P = { kind: "draw", f: it ? [it.x, it.y] : pt, el: ln };
      if (it) { ln.setAttribute("x1", it.x); ln.setAttribute("y1", it.y); }
    }
  });
  document.addEventListener("pointermove", e => {
    if (!P) return;
    const svg = document.querySelector("#tb-pitch svg"); if (!svg) { P = null; return; }
    const pt = svgPt(svg, e);
    if (P.kind === "drag") {
      if (!P.moved && Math.hypot(pt[0] - P.start[0], pt[1] - P.start[1]) < 0.8) return;
      P.moved = true; P.it.x = +(pt[0] + P.off[0]).toFixed(2); P.it.y = +(pt[1] + P.off[1]).toFixed(2);
      P.el.setAttribute("transform", `translate(${P.it.x} ${P.it.y})`);
    } else { P.el.setAttribute("x2", pt[0]); P.el.setAttribute("y2", pt[1]); P.t = pt; }
  });
  const end = () => {
    if (!P) return;
    const p = P; P = null;
    if (p.kind === "drag") {
      if (p.moved) changed(); else TB.sel = TB.sel === p.it.id ? null : p.it.id;
      LZ.render();
    } else {
      if (p.t && Math.hypot(p.t[0] - p.f[0], p.t[1] - p.f[1]) > 2) { TB.cur.data.lines.push({ id: uid(), k: TB.mode, f: p.f.map(v => +(+v).toFixed(2)), t: p.t.map(v => +v.toFixed(2)) }); changed(); }
      LZ.render();
    }
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);

  /* ---------- Spieler: freigegebene Tafeln ansehen ---------- */
  async function loadShared() {
    if (!LZ.S.user || LZ.Store.mode !== "api") return;
    const r = await LZ.Store.get("boards.php");
    if (r && r.ok) { TB.shared = r.boards; if (LZ.S.view === "home") LZ.render(); }
  }
  LZ.on("ready", () => {
    loadShared();
    LZ.on("homeTop", () => {
      if (!LZ.S.user || !TB.shared || !TB.shared.length) return "";
      return `<section class="card stack"><h2>Vom Trainer</h2><ul class="blist">${TB.shared.slice(0, 4).map(b => `<li><button data-act="tbShow" data-v="${b.id}"><span><b>${esc(b.title)}</b>
        <span class="small">${b.kind === "lineup" ? "Aufstellung" : "Taktiktafel"}${b.game ? " · " + esc(gameText(b.game)) : ""}</span></span><span aria-hidden="true">›</span></button></li>`).join("")}</ul></section>`;
    });
  });
  LZ.on("enter", v => { if (v === "home" && LZ.S.user) loadShared(); });
  LZ.actions.tbShow = async (b, v) => {
    TB.view = null; LZ.go("tafel");
    const r = await LZ.Store.get("boards.php?id=" + v);
    TB.view = r.ok ? r.board : { error: r.error || "Nicht gefunden." }; LZ.render();
  };
  LZ.views.tafel = () => {
    const b = TB.view;
    if (!b) return `<button class="back" data-act="home">‹ Übersicht</button><p class="small">Lade …</p>`;
    if (b.error) return `<button class="back" data-act="home">‹ Übersicht</button><p class="err">${esc(b.error)}</p>`;
    const mine = b.data.items.find(i => i.me);
    return `<button class="back" data-act="home">‹ Übersicht</button>
      <section><p class="eyebrow">${b.kind === "lineup" ? "Aufstellung" : "Taktiktafel"}${b.game ? " · " + esc(gameText(b.game)) : ""}</p><h1>${esc(b.title)}</h1>
      ${mine ? `<p class="lede">Du spielst hier: <b>${esc(mine.lab ? mine.lab + " · " + LZ.posName(mine.lab) : "siehe gelber Ring")}</b></p>` : b.kind === "lineup" ? `<p class="lede">Du bist diesmal nicht in der Startelf eingezeichnet – sprich mit deinem Trainer.</p>` : ""}</section>
      <div class="tboard">${window.LZPitch.field({ zones: true, board: b.data, label: b.title })}</div>
      <div class="legend"><span><i class="dotk" style="background:${LZ.C.team.colors.shirt}"></i>Wir</span><span><i class="dotk me"></i>Du</span><span><i class="dotk" style="background:#e9eef3;border:1px solid #23303b"></i>Gegner</span><span>━ Pass</span><span>╍ Laufweg</span></div>`;
  };
})();
