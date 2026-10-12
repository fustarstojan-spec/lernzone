/*
 * Lernzone – Gesprächsrunden mit Zeitfenstern (ab 0.38.0), z. B. Entwicklungsgespräche
 * Trainer: Runde anlegen (Titel, „mit Kind“ oder „mit Eltern und Kind“, Ort, Tage mit Von–Bis, Länge, eingeladene Kinder),
 *          Belegung sehen, Fenster selbst vergeben, Fenster ergänzen oder löschen.
 * Kind / Eltern: Karte mit dem eigenen Termin; gebucht wird von der Seite, die das Gespräch führt (mit Kind → Kind, mit Eltern → Eltern).
 * Andere Kinder erscheinen nie – fremde Fenster nur als „belegt“ (der Server liefert gar keine Nummern).
 * Daten: api/talks.php
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const G = { d: null, busy: false, err: "", msg: "", step: "list", round: null, f: null, pick: null, confirm: "", add: null, inv: null };
  const isCoach = () => LZ.coachMode && LZ.coachMode();
  const fmt = iso => new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  const endOf = s => { const [h, m] = s.time.split(":").map(Number), t = h * 60 + m + s.minutes; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const span = s => `${fmt(s.date)} · ${s.time}–${endOf(s)} Uhr`;
  const today = () => new Date().toLocaleDateString("sv-SE");
  const errP = () => G.err ? `<p class="err" role="alert" style="text-align:left">${esc(G.err)}</p>` : "";
  const okP = () => G.msg ? `<p class="okmsg" role="status">${esc(G.msg)}</p>` : "";
  const byDay = slots => slots.reduce((m, s) => ((m[s.date] = m[s.date] || []).push(s), m), {});

  async function load() {
    const r = await LZ.Store.get("talks.php");
    if (r && r.ok) { G.d = r; G.err = ""; } else G.d = { rounds: [], failed: true };
    LZ.render();
  }
  LZ.on("enter", v => {
    if (!LZ.Store || LZ.Store.mode !== "api") return;
    if (v === "gespraeche" && isCoach()) { G.step = "list"; G.err = ""; G.msg = ""; load(); }
    else if (["home", "me"].includes(v) && (LZ.S.user || (LZ.parentMode && LZ.parentMode()))) load();
  });
  LZ.on("ready", () => { if (LZ.Store && LZ.Store.mode === "api" && (LZ.S.user || (LZ.parentMode && LZ.parentMode()))) load(); });

  /* ---------- Kind und Eltern: Karte ---------- */
  LZ.talksCard = () => {
    const d = G.d; if (!d || d.coach || !(d.rounds || []).length) return "";
    const parent = LZ.parentMode && LZ.parentMode();
    return d.rounds.map(r => {
      const withWhom = r.mode === "eltern" ? (parent ? "mit Ihnen und Ihrem Kind" : "mit deinen Eltern und dir") : (parent ? "mit Ihrem Kind" : "mit dir");
      const who = r.mode === "eltern" ? (parent ? "Sie" : "deine Eltern") : (parent ? "Ihr Kind" : "du");
      const free = r.slots.filter(s => s.free), picking = G.pick === r.id || (!r.mine && r.canBook);
      let body;
      if (r.mine) body = `<p class="kbig">${esc(span(r.mine))}</p>
        ${r.canBook && !r.mine.locked && G.pick !== r.id ? `<div class="chiprow"><button class="btn ghost small" data-act="tkPick" data-v="${r.id}">Anderen Termin wählen</button>${G.confirm === "c" + r.id
          ? `<button class="btn small danger-btn" data-act="tkCancel" data-v="${r.id}">Wirklich absagen?</button><button class="linkbtn" data-act="tkAsk" data-v="">Nein</button>`
          : `<button class="linkbtn" data-act="tkAsk" data-v="c${r.id}">Absagen</button>`}</div>` : ""}
        ${r.mine.locked ? `<p class="small">Änderungen jetzt bitte direkt beim Trainer.</p>` : ""}`;
      else if (!r.canBook) body = `<p>Noch kein Termin. ${parent ? "Den Termin wählt Ihr Kind in seiner Lernzone." : "Den Termin wählen deine Eltern in ihrem Zugang – oder dein Trainer trägt ihn ein."}</p>`;
      else body = free.length ? `<p class="small">Bitte ein Zeitfenster wählen:</p>` : `<p>Gerade ist kein Zeitfenster frei. Bitte beim Trainer melden.</p>`;
      const picker = r.canBook && picking && free.length && !(r.mine && r.mine.locked) ? Object.entries(byDay(r.slots)).map(([day, list]) => `<div class="tkday"><b>${esc(fmt(day))}</b><div class="chiprow">${list.map(s =>
        `<button class="btn ghost small-btn${s.free ? "" : " taken"}" data-act="tkBook" data-v="${s.id}" data-r="${r.id}" ${s.free && !G.busy ? "" : "disabled"} title="${s.free ? "frei" : "belegt"}">${s.time}</button>`).join("")}</div></div>`).join("")
        + (r.mine ? `<button class="linkbtn" data-act="tkPick" data-v="">Abbrechen</button>` : "") : "";
      return `<section class="card stack talkcard"><p class="eyebrow">Gespräch ${esc(withWhom)}</p><h2>${esc(r.title)}</h2>
        ${body}${picker}
        ${r.location ? `<p class="small">${LZ.mapLink ? LZ.mapLink(r.location) : esc(r.location)}</p>` : ""}${r.note ? `<p class="small">${esc(r.note)}</p>` : ""}
        ${G.err && G.pick === r.id ? errP() : ""}
        <p class="small">${r.canBook ? `Wählen ${parent ? "können Sie" : "kannst du"}` : `Wählen ${who === "du" ? "kannst du" : who === "Sie" ? "können Sie" : "kann " + who}`} bis ${d.hours} Stunden vorher.</p></section>`;
    }).join("");
  };
  LZ.on("homeTop", () => (LZ.S.user ? LZ.talksCard() : ""));
  LZ.on("meTop", () => LZ.talksCard());
  LZ.actions.tkPick = (b, v) => { G.pick = v ? +v : null; G.err = ""; LZ.render(); };
  LZ.actions.tkAsk = (b, v) => { G.confirm = v; LZ.render(); };
  async function send(body, after) {
    if (G.busy) return; G.busy = true; G.err = ""; LZ.render();
    const r = await LZ.Store.send("talks.php", body);
    G.busy = false;
    if (!r || !r.ok) { G.err = (r && r.error) || "Das hat nicht geklappt."; if (body.action === "book") load(); else LZ.render(); return; }
    G.d = r; G.confirm = ""; if (after) after(r); LZ.render();
  }
  LZ.actions.tkBook = (b, v) => { G.pick = +b.dataset.r; send({ action: "book", slot: +v }, () => { G.pick = null; }); };
  LZ.actions.tkCancel = (b, v) => send({ action: "cancel", round: +v });

  /* ---------- Trainer ---------- */
  const players = () => (LZ.C.players || []).map(p => p.nr);
  const newForm = () => ({ title: "Entwicklungsgespräche", mode: "eltern", location: "", note: "", minutes: 20, days: [{ date: "", from: "17:00", to: "19:00" }], nrs: players() });
  const chips = (sel, act) => `<div class="tkchips">${players().map(n => `<button class="tkchip" aria-pressed="${sel.includes(n)}" data-act="${act}" data-v="${n}">${n}</button>`).join("")}</div>
    <div class="chiprow"><button class="linkbtn" data-act="${act}" data-v="all">Alle</button><button class="linkbtn" data-act="${act}" data-v="none">Keine</button></div>`;
  const dayRows = (days, pre) => days.map((d, i) => `<div class="tkrow"><input type="date" id="${pre}-d${i}" min="${today()}" value="${esc(d.date)}" aria-label="Tag">
      <input type="time" id="${pre}-f${i}" value="${esc(d.from)}" aria-label="von"><span>–</span><input type="time" id="${pre}-t${i}" value="${esc(d.to)}" aria-label="bis">
      ${days.length > 1 ? `<button class="linkbtn" data-act="tkDayRm" data-v="${pre}:${i}">entfernen</button>` : ""}</div>`).join("")
    + `<button class="linkbtn" data-act="tkDayAdd" data-v="${pre}">+ weiterer Tag</button>`;
  const minSel = (id, v) => `<div class="fld"><label for="${id}">Länge je Gespräch</label><select id="${id}">${[10, 15, 20, 25, 30, 45, 60].map(m => `<option value="${m}" ${m === v ? "selected" : ""}>${m} Min.</option>`).join("")}</select></div>`;
  const modeLabel = m => m === "kind" ? "mit Kind – das Kind wählt" : "mit Eltern und Kind – die Eltern wählen";
  const readDays = (pre, days) => days.map((d, i) => ({ date: (document.getElementById(`${pre}-d${i}`) || {}).value || d.date,
    from: (document.getElementById(`${pre}-f${i}`) || {}).value || d.from, to: (document.getElementById(`${pre}-t${i}`) || {}).value || d.to }));
  const head = (t, lede) => `<section>${LZ.area("Gespräche")}<h1>${t}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</section>`;

  LZ.views.gespraeche = () => {
    if (!isCoach()) return `${head("Gespräche")}<p class="small">Nur für Trainer.</p>`;
    const d = G.d; if (!d || !d.coach) return `${head("Gespräche")}<p class="small">Lade …</p>`;
    if (G.step === "new") { const f = G.f;
      return `<button class="back" data-act="tkList">‹ Gespräche</button>${head("Neue Gesprächsrunde")}
      <section class="card stack">
        <div class="fld"><label for="tk-title">Titel</label><input id="tk-title" maxlength="80" value="${esc(f.title)}"></div>
        <div class="fld"><span class="fldlabel">Wer ist dabei?</span><div class="seg">${["eltern", "kind"].map(m => `<button aria-pressed="${f.mode === m}" data-act="tkMode" data-v="${m}">${m === "kind" ? "Mit Kind" : "Mit Eltern und Kind"}</button>`).join("")}</div>
          <span class="small">${f.mode === "kind" ? "Das Kind wählt sein Zeitfenster selbst; die Eltern sehen den Termin." : "Die Eltern wählen das Zeitfenster in ihrem Zugang; das Kind sieht den Termin. Ohne Elternzugang trägst du den Termin selbst ein."}</span></div>
        <div class="fld"><label for="tk-loc">Ort</label><input id="tk-loc" maxlength="120" value="${esc(f.location)}" placeholder="z. B. Vereinsheim, Besprechungsraum"></div>
        <div class="fld"><label for="tk-note">Hinweis (optional)</label><input id="tk-note" maxlength="300" value="${esc(f.note)}" placeholder="z. B. Bitte 5 Minuten vorher da sein"></div>
        ${minSel("tk-min", f.minutes)}
        <div class="fld"><span class="fldlabel">Tage und Uhrzeiten</span>${dayRows(f.days, "tk")}<span class="small">Die Zeitfenster werden lückenlos hintereinander erzeugt.</span></div>
        <div class="fld"><span class="fldlabel">Eingeladen (${f.nrs.length})</span>${chips(f.nrs, "tkInv")}</div>
        ${errP()}<button class="btn wide" data-act="tkCreate" ${G.busy ? "disabled" : ""}>Runde anlegen</button></section>`; }
    const r = G.step === "round" && d.rounds.find(x => x.id === G.round);
    if (r) {
      const booked = r.slots.filter(s => s.nr).length, inv = G.inv || r.invited;
      return `<button class="back" data-act="tkList">‹ Gespräche</button>${head(esc(r.title), `${esc(modeLabel(r.mode))}${r.location ? " · " + esc(r.location) : ""}`)}
      ${errP()}${okP()}
      <section class="card stack"><div class="rowspread"><h2>Zeitfenster</h2><span class="small">${booked} von ${r.slots.length} vergeben · ${r.invited.length} eingeladen</span></div>
        ${Object.entries(byDay(r.slots)).map(([day, list]) => `<div class="tkday"><b>${esc(fmt(day))}</b><ul class="tkslots">${list.map(s => `<li class="${s.nr ? "on" : ""}"><span>${s.time}–${endOf(s)}</span>
          <select id="tka-${s.id}" aria-label="Zeitfenster ${s.time} vergeben"><option value="0">frei</option>${r.invited.map(n => `<option value="${n}" ${s.nr === n ? "selected" : ""}>Nr. ${n}${r.open.includes(n) || s.nr === n ? "" : " (hat Termin)"}</option>`).join("")}</select>
          <span class="small">${s.by === "eltern" ? "von Eltern" : s.by === "kind" ? "vom Kind" : s.by === "trainer" ? "vom Trainer" : ""}</span>
          <button class="linkbtn" data-act="tkDel" data-v="${s.id}" title="Zeitfenster löschen">löschen</button></li>`).join("")}</ul></div>`).join("") || `<p class="small">Keine Zeitfenster.</p>`}
        ${r.open.length ? `<p><b>Noch ohne Termin:</b> ${r.open.map(n => "Nr. " + n).join(", ")}</p>` : `<p class="okmsg">Alle eingeladenen Kinder haben einen Termin.</p>`}</section>
      <section class="card stack"><h2>Zeitfenster ergänzen</h2>${G.add ? `${minSel("tkx-min", G.add.minutes)}${dayRows(G.add.days, "tkx")}
        <div class="chiprow"><button class="btn" data-act="tkAddSave" ${G.busy ? "disabled" : ""}>Hinzufügen</button><button class="btn ghost" data-act="tkAddOpen" data-v="0">Abbrechen</button></div>`
        : `<button class="btn ghost" data-act="tkAddOpen" data-v="1">+ Tag oder Uhrzeit ergänzen</button>`}</section>
      <section class="card stack"><h2>Eingeladen (${inv.length})</h2>${chips(inv, "tkRInv")}
        ${G.inv ? `<div class="chiprow"><button class="btn" data-act="tkInvSave">Speichern</button><button class="btn ghost" data-act="tkInvReset">Verwerfen</button></div><p class="small">Wer ausgeladen wird, verliert seinen Termin.</p>` : ""}</section>
      ${G.confirm === "del" ? `<section class="card stack danger"><p><b>Runde wirklich löschen?</b> Alle Zeitfenster und Buchungen verschwinden.</p>
        <div class="row"><button class="btn danger-btn" data-act="tkRoundDel">Ja, löschen</button><button class="btn ghost" data-act="tkAsk" data-v="">Abbrechen</button></div></section>`
        : `<button class="btn ghost wide danger-text" data-act="tkAsk" data-v="del">Runde löschen</button>`}`;
    }
    return `${head("Gespräche", "Entwicklungsgespräche und andere Einzelgespräche: Zeitfenster anbieten, Kinder oder Eltern wählen selbst.")}
      ${errP()}<button class="btn" data-act="tkNew">+ Neue Gesprächsrunde</button>
      ${d.rounds.map(r => { const booked = r.slots.filter(s => s.nr).length, last = r.slots.length ? r.slots[r.slots.length - 1].date : "";
        return `<button class="card stack tkround" data-act="tkOpen" data-v="${r.id}"><p class="eyebrow">${esc(modeLabel(r.mode))}${last && last < today() ? " · vorbei" : ""}</p><h2>${esc(r.title)}</h2>
          <span class="small">${r.slots.length ? `${esc(fmt(r.slots[0].date))}${last !== r.slots[0].date ? " bis " + esc(fmt(last)) : ""} · ` : ""}${booked} von ${r.invited.length} Kindern haben einen Termin</span></button>`; }).join("")
        || `<p class="small">Noch keine Gesprächsrunde.</p>`}`;
  };

  const keepForm = () => { const f = G.f; if (!f) return; const v = id => (document.getElementById(id) || {}).value;
    f.title = v("tk-title") ?? f.title; f.location = v("tk-loc") ?? f.location; f.note = v("tk-note") ?? f.note; f.minutes = +(v("tk-min") || f.minutes); f.days = readDays("tk", f.days); };
  const keepAdd = () => { if (!G.add) return; G.add.minutes = +((document.getElementById("tkx-min") || {}).value || G.add.minutes); G.add.days = readDays("tkx", G.add.days); };
  LZ.actions.tkList = () => { G.step = "list"; G.err = ""; G.msg = ""; LZ.render(); LZ.top(); };
  LZ.actions.tkNew = () => { G.f = newForm(); G.step = "new"; G.err = ""; LZ.render(); LZ.top(); };
  LZ.actions.tkOpen = (b, v) => { G.round = +v; G.step = "round"; G.err = ""; G.msg = ""; G.add = null; G.inv = null; G.confirm = ""; LZ.render(); LZ.top(); };
  LZ.actions.tkMode = (b, v) => { keepForm(); G.f.mode = v; LZ.render(); };
  LZ.actions.tkInv = (b, v) => { keepForm(); const f = G.f; f.nrs = v === "all" ? players() : v === "none" ? [] : f.nrs.includes(+v) ? f.nrs.filter(n => n !== +v) : f.nrs.concat(+v).sort((a, c) => a - c); LZ.render(); };
  LZ.actions.tkRInv = (b, v) => { const r = G.d.rounds.find(x => x.id === G.round), cur = G.inv || r.invited.slice();
    G.inv = v === "all" ? players() : v === "none" ? [] : cur.includes(+v) ? cur.filter(n => n !== +v) : cur.concat(+v).sort((a, c) => a - c); LZ.render(); };
  LZ.actions.tkInvReset = () => { G.inv = null; LZ.render(); };
  LZ.actions.tkInvSave = () => send({ action: "invite", round: G.round, nrs: G.inv }, () => { G.inv = null; G.msg = "Einladungen gespeichert."; });
  LZ.actions.tkDayAdd = (b, pre) => { if (pre === "tk") { keepForm(); const l = G.f.days[G.f.days.length - 1]; G.f.days.push({ date: "", from: l.from, to: l.to }); } else { keepAdd(); const l = G.add.days[G.add.days.length - 1]; G.add.days.push({ date: "", from: l.from, to: l.to }); } LZ.render(); };
  LZ.actions.tkDayRm = (b, v) => { const [pre, i] = v.split(":"); if (pre === "tk") { keepForm(); G.f.days.splice(+i, 1); } else { keepAdd(); G.add.days.splice(+i, 1); } LZ.render(); };
  LZ.actions.tkCreate = () => { keepForm(); const f = G.f;
    send({ action: "create", title: f.title, mode: f.mode, location: f.location, note: f.note, minutes: f.minutes, days: f.days, nrs: f.nrs },
      r => { G.step = "round"; G.round = r.rounds[0] && r.rounds[0].id; G.f = null; G.msg = "Runde angelegt. Kinder bzw. Eltern sehen die Zeitfenster jetzt in ihrer Lernzone."; LZ.top(); }); };
  LZ.actions.tkAddOpen = (b, v) => { G.add = v === "1" ? { minutes: ((G.d.rounds.find(x => x.id === G.round) || {}).slots || [{}])[0].minutes || 20, days: [{ date: "", from: "17:00", to: "19:00" }] } : null; LZ.render(); };
  LZ.actions.tkAddSave = () => { keepAdd(); send({ action: "addslots", round: G.round, minutes: G.add.minutes, days: G.add.days }, () => { G.add = null; G.msg = "Zeitfenster ergänzt."; }); };
  LZ.actions.tkDel = (b, v) => send({ action: "delslot", slot: +v });
  LZ.actions.tkRoundDel = () => send({ action: "delete", round: G.round }, () => { G.step = "list"; G.msg = ""; });
  LZ.inputs.push(e => {
    const m = e.target.id && e.target.id.match(/^tka-(\d+)$/);
    if (m && e.type === "change") { send({ action: "assign", slot: +m[1], nr: +e.target.value }); return true; }
  });
})();
