/*
 * Lernzone – Oberfläche
 * Liest Inhalte über LZStore.loadContent() und speichert nur über LZStore.
 * Keine Daten und keine PINs in dieser Datei.
 *
 * Erweiterungen (js/me.js, js/coach.js) melden sich über window.LZ an:
 *   LZ.views[name]   = () => html        eigene Ansicht, aufrufen mit LZ.go(name)
 *   LZ.actions[act]  = (button, value)   Klick auf ein Element mit data-act="act"
 *   LZ.inputs.push(event => …)           Eingaben in Formularfeldern (input/change)
 *   LZ.hooks[name]   = [fn, …]           "enter" (Ansicht geöffnet), "homeTop" (HTML auf der Startseite), "meTop"/"meBottom" (HTML in Mein Bereich), "ready"
 *   Weg B: Store.gate() nennt die Anmeldeseite (LZ.views.login / setpw / setup aus js/auth.js), solange niemand angemeldet ist.
 */
(function () {
  let Store = null;
  const field = o => window.LZPitch.field(o);
  let C = null;                       // Inhalte aus data/*.json
  let PH = {};
  const S = { view: "home", arg: null, tab: "grundlagen", user: null, loginNr: null, pin: "", err: "", busy: false };
  let Q = null, Z = null;
  const ZROUNDS = 10;
  const APP_VERSION = "0.24.0";   // bei jeder Änderung erhöhen und in CHANGELOG.md eintragen
  const app = document.getElementById("app");

  /* ---------- Hilfen ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const zoneName = (l, t) => `${cap(C.zones.lanes[l])} im ${C.zones.thirds[t].d}`;
  const prog = () => Store.getProgress();
  function weekKey(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return t.getUTCFullYear() + "-W" + Math.ceil(((t - y) / 864e5 + 1) / 7);
  }
  function saveBest(mod, score, of) {
    const p = prog(), prev = p.quiz[mod];
    p.quiz[mod] = { best: Math.max(score, prev ? prev.best : 0), of, last: score };
    Store.saveProgress(p);
  }
  const SHIRT_PATH = "M21 4 9 9.5 2 23l10 5 2.5-5.5V57h35V22.5L52 28l10-5-7-13.5L43 4c-2 5-6 8-11 8s-9-3-11-8Z";
  const ADD_GREY = "#8d8a8b";
  const gkNrs = () => [...new Set([...C.team.goalkeepers, ...C.players.filter(p => p.plan === "tw").map(p => p.nr)])];
  const isGK = nr => { const p = C.players.find(x => x.nr === +nr); return p ? p.plan === "tw" : C.team.goalkeepers.includes(+nr); };
  // kind: undefined = nach Kader, "tw" = blau, "feld" = rot, "add" = grau mit +
  function shirt(label, kind) {
    const fs = String(label).length > 2 ? 13 : label === "+" ? 30 : 22;
    const fill = kind === "add" ? ADD_GREY : kind === "tw" ? C.team.colors.goalkeeper : kind === "feld" ? C.team.colors.shirt
               : isGK(label) ? C.team.colors.goalkeeper : C.team.colors.shirt;
    return `<svg viewBox="0 0 64 60" aria-hidden="true"><path d="${SHIRT_PATH}" fill="${fill}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><text x="32" y="39" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="700" font-size="${fs}">${esc(label)}</text></svg>`;
  }
  const posName = id => { const p = (C.team.positions || []).find(x => x.id === id); return p ? p.name : ""; };
  const posLabel = id => id ? `${esc(id)} · ${esc(posName(id))}` : "noch offen";
  const posSelect = (id, val, label) => `<div class="fld"><label for="${id}">${label}</label>
    <select id="${id}"><option value="">– noch offen –</option>${(C.team.positions || []).map(p => `<option value="${esc(p.id)}" ${p.id === val ? "selected" : ""}>${esc(p.id)} · ${esc(p.name)}</option>`).join("")}</select></div>`;
  const myPositions = () => S.user ? [S.user.posOff, S.user.posDef].filter(Boolean) : [];
  const pad = act => `<div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button data-act="${act}" data-d="${d}">${d}</button>`).join("")}<span></span><button data-act="${act}" data-d="0">0</button><button data-act="${act}" data-d="del" aria-label="Löschen">⌫</button></div>`;
  const dots = (n, len) => `<div class="pins" aria-label="${n} von ${len} Ziffern">${Array.from({ length: len }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>`;
  const legend = (withMe) => `<div class="legend"><span><i class="dotk" style="background:${C.team.colors.shirt}"></i>Wir</span>${withMe ? `<span><i class="dotk me"></i>Du</span>` : ""}<span><i class="dotk" style="background:#e9eef3;border:1px solid #23303b"></i>Gegner</span><span>━ Pass</span><span>╍ Laufweg</span></div>`;
  const ballLabel = b => b === "own" ? "Wir haben den Ball" : b === "set" ? "Ruhender Ball" : "Gegner hat den Ball";

  /* ---------- Startseite ---------- */
  function home() {
    const p = prog();
    const pc = id => { const q = p.quiz[id]; return q ? Math.round(q.best / q.of * 100) : 0; };
    const card = ph => `<button class="phase" data-act="phase" data-v="${ph.id}">
    <span class="ball ${ph.ball}">${ballLabel(ph.ball)}</span>
    <span class="eyebrow">Phase ${ph.nr}</span><span class="t">${esc(ph.title)}</span>
    <span class="small">${p.quiz[ph.id] ? `Bestes Quiz: ${p.quiz[ph.id].best}/${p.quiz[ph.id].of}` : "Quiz noch offen"}</span>
    <span class="meter"><b style="width:${pc(ph.id)}%"></b></span></button>`;
    return `${LZ.coachMode() && LZ.coachNav ? LZ.coachNav("lernzone") : ""}<section><p class="eyebrow">${S.user ? `Angemeldet als Nr. ${S.user.nr}` : "Spielphasenmodell"}</p>
    <h1>${S.user ? "Weiter geht's" : "Lernen, wie wir spielen"}</h1>
    <p class="lede">Das Spiel hat vier Phasen, die sich immer wieder abwechseln. Dazu kommen die Standards, wenn das Spiel ruht. Für jede Phase gibt es Grundlagen, Lernmaterial und ein Quiz.</p></section>
  ${(LZ.hooks.homeTop || []).map(f => f()).join("")}
  <button class="card mod0" data-act="zonen"><span class="mini"><i></i></span>
    <span><span class="eyebrow">Modul 0 · Basis</span><h2>Spielfeld &amp; Zonen</h2><span class="small">${p.quiz.zonen ? `Bester Durchgang: ${p.quiz.zonen.best}/${p.quiz.zonen.of}` : "5 Spuren, 3 Drittel – unsere gemeinsame Sprache"}</span></span>
    <span aria-hidden="true" style="font-size:1.4rem;color:var(--muted)">›</span></button>
  <div class="cycle">${card(PH.bb)}${card(PH.ud)}${card(PH.uo)}${card(PH.gb)}
    <span class="hub" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/></svg></span></div>
  <p class="small" style="text-align:center">Im Uhrzeigersinn: Ballbesitz → Ballverlust → Gegner hat den Ball → Ballgewinn → …</p>
  ${PH.st ? `<button class="phase phase-set" data-act="phase" data-v="st">
    <span class="ball set">${ballLabel("set")} · Spielunterbrechung</span>
    <span class="eyebrow">Phase ${PH.st.nr}</span><span class="t">${esc(PH.st.title)}</span>
    <span class="small">${p.quiz.st ? `Bestes Quiz: ${p.quiz.st.best}/${p.quiz.st.of}` : "Ecke, Freistoß, Einwurf, Strafstoß – Quiz noch offen"}</span>
    <span class="meter"><b style="width:${pc("st")}%"></b></span></button>` : ""}
  ${(C.modules || []).map(m => `<button class="card mod0 modcard" data-act="modul" data-v="${m.id}"><span class="mini m2v1"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="12" cy="30" r="5" fill="${C.team.colors.shirt}"/><circle cx="29" cy="30" r="5" fill="${C.team.colors.shirt}"/><circle cx="20" cy="15" r="5" fill="#e9eef3" stroke="#23303b"/><path d="M14 27 L27 12" stroke="#fff" stroke-width="2"/></svg></span>
    <span><span class="eyebrow">${esc(m.label)}</span><h2>${esc(m.title)}</h2><span class="small">${p.quiz[m.id] ? `Bestes Quiz: ${p.quiz[m.id].best}/${p.quiz[m.id].of}` : esc(m.short)}</span></span>
    <span aria-hidden="true" style="font-size:1.4rem;color:var(--muted)">›</span></button>`).join("")}
  <p class="draft">Entwurf: Texte, Situationen und Fragen sind Vorschläge und werden durch die Inhalte des Trainerteams ersetzt.</p>
  <p class="small" style="text-align:center">Version ${APP_VERSION}</p>`;
  }

  /* ---------- Modul (z. B. 2v1): Grundlagen · Situationen · Übungen · Quiz ---------- */
  function modulView() {
    const m = PH[S.arg]; if (!m) return home();
    const tabs = [["grundlagen", "Grundlagen"], ["situationen", "Situationen"], ["uebungen", "Übungen"], ["quiz", "Quiz"]];
    const list = a => `<ul class="prin">${a.map(t => `<li><span>${esc(t)}</span></li>`).join("")}</ul>`;
    let body = "";
    if (S.tab === "grundlagen") body = `<div class="goal-box"><p class="eyebrow">Unser Ziel</p><p>${esc(m.ziel)}</p></div><p>${esc(m.intro)}</p>
      <p class="merk">${esc(m.merk)}</p>
      <h3>Darauf kommt es an</h3><ul class="prin">${m.prin.map(([t, x]) => `<li><b>${esc(t)}</b><span>${esc(x)}</span></li>`).join("")}</ul>`;
    else if (S.tab === "situationen") body = `<p class="small">Die vier Grundsituationen. Du bist die <b>1</b> mit dem Ball, die <b>2</b> ist dein Mitspieler, der helle Kreis ist der Verteidiger.</p>
      ${m.sits.map(s => `<section class="card stack sitcard"><h2>${esc(s.title)}</h2><p class="small">${esc(s.sub)}</p>
        <div class="sitpitch">${field({ own: s.own, opp: s.opp, ball: s.ball, arrows: s.arrows, zones: false, view: s.view, label: s.title })}</div>
        ${list(s.tips)}</section>`).join("")}
      <section class="card stack"><h2>Wenn du der Verteidiger bist</h2>${list(m.defense)}</section>
      ${legend(false)}`;
    else if (S.tab === "uebungen") body = `<p class="small">Diese Übungen machen wir gerade im Training.</p>
      ${m.drills.map(d => `<section class="card stack"><h2>${esc(d.title)}</h2><p>${esc(d.what)}</p>
        <h3>Aufbau</h3>${list(d.org)}<h3>Ablauf</h3>${list(d.ablauf)}<h3>Worauf du achtest</h3>${list(d.coach)}</section>`).join("")}`;
    else body = quizHTML(m);
    return `<button class="back" data-act="home">‹ Übersicht</button>
  <section><p class="eyebrow">${esc(m.label)}</p><h1>${esc(m.title)}</h1></section>
  <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-pressed="${S.tab === k}" data-act="tab" data-v="${k}">${l}</button>`).join("")}</div>
  ${body}`;
  }

  /* ---------- Spielphase ---------- */
  function phaseView() {
    const ph = PH[S.arg];
    const tabs = [["grundlagen", "Grundlagen"], ["material", "Lernmaterial"], ["quiz", "Quiz"]];
    let body = "";
    if (S.tab === "grundlagen") {
      body = `<div class="goal-box"><p class="eyebrow">Unser Ziel</p><p>${esc(ph.ziel)}</p></div>
    <p>${esc(ph.intro)}</p>
    <div class="card stack"><h3>Unterphasen</h3><dl class="sub">${ph.unter.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl></div>
    <p class="merk">${esc(ph.merk)}</p>`;
    } else if (S.tab === "material") {
      const me = myPositions().filter(m => ph.sit.own.some(o => o[0] === m));
      body = `<div class="stack">${field({ ...ph.sit, label: ph.sit.cap, me })}${legend(me.length > 0)}<p class="caption">${esc(ph.sit.cap)}</p>
      ${me.length ? `<p class="small">Gelber Ring: deine Position${me.length > 1 ? "en" : ""} (${me.map(esc).join(", ")}).</p>` : ""}</div>
    <h3>Unsere Prinzipien</h3><ul class="prin">${ph.prin.map(([t, x]) => `<li><b>${esc(t)}</b><span>${esc(x)}</span></li>`).join("")}</ul>`;
    } else body = quizHTML(ph);
    return `<button class="back" data-act="home">‹ Übersicht</button>
  <section><p class="eyebrow">Phase ${ph.nr} · ${ballLabel(ph.ball)}</p><h1>${esc(ph.title)}</h1></section>
  <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-pressed="${S.tab === k}" data-act="tab" data-v="${k}">${l}</button>`).join("")}</div>
  ${body}`;
  }

  function startQuiz(id) {
    const qs = shuffle(PH[id].quiz.map(item => {
      const idx = shuffle(item.options.map((_, i) => i));
      return { q: item.q, opts: idx.map(i => item.options[i]), c: idx.indexOf(item.correct), w: item.why };
    }));
    Q = { id, qs, i: 0, picked: null, score: 0 };
  }
  function quizHTML(ph) {
    const p = prog().quiz[ph.id];
    if (!Q || Q.id !== ph.id) return `<div class="card stack"><h2>Quiz: ${esc(ph.title)}</h2><p class="small">${ph.quiz.length} Fragen. Nach jeder Antwort siehst du die Erklärung.${p ? ` Dein bestes Ergebnis: ${p.best}/${p.of}.` : ""}</p><button class="btn wide" data-act="qstart">Quiz starten</button></div>`;
    if (Q.i >= Q.qs.length) {
      const n = Q.qs.length, msg = Q.score === n ? "Perfekt – alles richtig!" : Q.score >= n - 1 ? "Stark, fast alles richtig." : Q.score >= n / 2 ? "Gute Basis. Schau dir das Lernmaterial nochmal an." : "Lies die Grundlagen nochmal und versuch es erneut.";
      return `<div class="card stack" style="text-align:center"><p class="eyebrow">Ergebnis</p><p class="score">${Q.score}/${n}</p><p>${msg}</p>
    <button class="btn wide" data-act="qstart">Nochmal</button><button class="btn ghost wide" data-act="tab" data-v="${ph.kind === "modul" ? "situationen" : "material"}">Zum Lernmaterial</button></div>`;
    }
    const q = Q.qs[Q.i], done = Q.picked !== null;
    return `<div class="stack"><div class="qcount"><span>Frage ${Q.i + 1} von ${Q.qs.length}</span><span>${Q.score} richtig</span></div>
  <p class="qtext">${esc(q.q)}</p>
  ${q.opts.map((o, i) => `<button class="opt ${done && i === q.c ? "ok" : ""} ${done && i === Q.picked && i !== q.c ? "bad" : ""}" data-act="qpick" data-i="${i}" ${done ? "disabled" : ""}>${esc(o)}</button>`).join("")}
  ${done ? `<div class="fb ${Q.picked === q.c ? "ok" : "bad"}"><b>${Q.picked === q.c ? "Richtig!" : "Nicht ganz."}</b>${esc(q.w)}</div>
  <button class="btn wide" data-act="qnext">${Q.i + 1 < Q.qs.length ? "Nächste Frage" : "Ergebnis ansehen"}</button>` : ""}</div>`;
  }

  /* ---------- Spielfeld & Zonen ---------- */
  function newZ(mode) { Z = { mode, sel: null, i: 0, score: 0, target: null, opts: null, picked: null, done: false }; if (mode !== "entdecken") nextZ(); }
  function nextZ() {
    let t; do { t = [rand(5), rand(3)]; } while (Z.target && t[0] === Z.target[0] && t[1] === Z.target[1]);
    Z.target = t; Z.picked = null;
    if (Z.mode === "benennen") {
      const keys = new Set([t.join()]); while (keys.size < 4) keys.add([rand(5), rand(3)].join());
      Z.opts = shuffle([...keys].map(k => k.split(",").map(Number)));
    }
  }
  function zonenView() {
    const modes = [["entdecken", "Entdecken"], ["finden", "Finden"], ["benennen", "Benennen"]];
    let area = "";
    if (Z.mode === "entdecken") {
      area = `<p class="zlabel">${Z.sel ? zoneName(Z.sel[0], Z.sel[1]) : "Tippe auf eine Zone"}</p>
    ${field({ tap: true, hl: Z.sel ? [{ l: Z.sel[0], t: Z.sel[1] }] : [], label: "Spielfeld mit 15 Zonen" })}`;
    } else if (Z.done) {
      area = `<div class="card stack" style="text-align:center"><p class="eyebrow">Ergebnis</p><p class="score">${Z.score}/${ZROUNDS}</p>
    <p>${Z.score === ZROUNDS ? "Du kennst das Feld perfekt." : Z.score >= 7 ? "Sehr gut – fast alles sitzt." : "Üb im Modus „Entdecken“ und versuch es nochmal."}</p>
    <button class="btn wide" data-act="zmode" data-v="${Z.mode}">Nochmal</button></div>`;
    } else {
      const [tl, tt] = Z.target, done = Z.picked !== null;
      const head = `<div class="qcount"><span>Runde ${Z.i + 1} von ${ZROUNDS}</span><span>${Z.score} richtig</span></div>`;
      const next = `<button class="btn wide" data-act="znext">${Z.i + 1 < ZROUNDS ? "Weiter" : "Ergebnis ansehen"}</button>`;
      if (Z.mode === "finden") {
        const ok = done && Z.picked[0] === tl && Z.picked[1] === tt;
        const hl = done ? [{ l: tl, t: tt, c: "ok" }].concat(ok ? [] : [{ l: Z.picked[0], t: Z.picked[1], c: "bad" }]) : [];
        area = `${head}<p class="prompt">Tippe: ${zoneName(tl, tt)}</p>${field({ tap: !done, hl, label: "Spielfeld: Zone finden" })}
      ${done ? `<div class="fb ${ok ? "ok" : "bad"}"><b>${ok ? "Richtig!" : "Nicht ganz."}</b>${ok ? "" : `Du hast die ${zoneName(Z.picked[0], Z.picked[1]).replace(/^./, c => c.toLowerCase())} getippt. Grün ist richtig.`}</div>${next}` : ""}`;
      } else {
        area = `${head}<p class="prompt">Wie heißt die gelbe Zone?</p>${field({ hl: [{ l: tl, t: tt, c: "tgt" }], label: "Spielfeld mit markierter Zone" })}
      <div class="opts2">${Z.opts.map((o, i) => { const right = o[0] === tl && o[1] === tt; return `<button class="opt ${done && right ? "ok" : ""} ${done && i === Z.picked && !right ? "bad" : ""}" data-act="zpick" data-i="${i}" ${done ? "disabled" : ""}>${zoneName(o[0], o[1])}</button>`; }).join("")}</div>
      ${done ? next : ""}`;
      }
    }
    return `<button class="back" data-act="home">‹ Übersicht</button>
  <section><p class="eyebrow">Modul 0 · Basis</p><h1>Spielfeld &amp; Zonen</h1>
  <p class="lede">Wir teilen das Feld in <b>5 Spuren</b> (Außenspur, Halbspur, Zentrum, Halbspur, Außenspur) und <b>3 Drittel</b> (hinten, Mitte, vorne). Wir spielen immer nach oben: Links und rechts gelten aus unserer Blickrichtung.</p></section>
  <div class="seg">${modes.map(([k, l]) => `<button aria-pressed="${Z.mode === k}" data-act="zmode" data-v="${k}">${l}</button>`).join("")}</div>
  <div class="stack">${area}</div>`;
  }

  /* ---------- Anmeldung Weg A (nur ohne Server: Trikot + PIN); Weg B siehe js/auth.js ---------- */
  function loginView() {
    if (S.loginNr === null) return `<button class="back" data-act="home">‹ Übersicht</button>
  <section><p class="eyebrow">Mein Bereich</p><h1>Wähle deine Nummer</h1><p class="lede">Danach gibst du deine 4-stellige PIN ein. Die bekommst du von deinem Trainer.</p></section>
  <div class="nrgrid">${C.players.map(p => `<button class="nr" data-act="pickNr" data-v="${p.nr}" aria-label="Nummer ${p.nr}">${shirt(p.nr)}<span>${p.plan === "tw" ? "Tor" : "&nbsp;"}</span></button>`).join("")}</div>`;
    return `<button class="back" data-act="unpick">‹ Andere Nummer</button>
  <section style="display:grid;justify-items:center;gap:8px;text-align:center"><div style="width:72px">${shirt(S.loginNr)}</div><h1>PIN eingeben</h1></section>
  ${dots(S.pin.length, 4)}
  <p class="err" role="alert">${esc(S.err)}</p>
  ${pad("pin")}`;
  }

  /* ---------- Mein Bereich ---------- */
  function meView() {
    if (!S.user) return Store.mode === "api" ? "" : loginView();
    const pl = S.user, plan = C.plans[pl.plan], p = prog(), wk = weekKey(), done = p.tasks[wk] || {};
    const nDone = plan.week.filter((_, i) => done[i]).length;
    const mods = [["zonen", "Spielfeld & Zonen"], ...C.phases.map(x => [x.id, x.title]), ...(C.modules || []).map(x => [x.id, x.title])];
    return `<section class="me-head">${shirt(pl.nr)}<div><p class="eyebrow">Mein Bereich</p><h1>Nr. ${pl.nr}</h1><p class="small">${esc(C.team.name)}</p></div></section>
  <section class="poscards"><div class="poscard"><p class="eyebrow">Offensivere Position</p><p class="posid">${esc(pl.posOff || "–")}</p><p class="small">${pl.posOff ? esc(posName(pl.posOff)) : "legt dein Trainer fest"}</p></div>
  <div class="poscard"><p class="eyebrow">Defensivere Position</p><p class="posid">${esc(pl.posDef || "–")}</p><p class="small">${pl.posDef ? esc(posName(pl.posDef)) : "legt dein Trainer fest"}</p></div></section>
  ${(LZ.hooks.meTop || []).map(f => f(pl)).join("")}
  <section class="stack"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2>Diese Woche</h2><span class="small" style="font-variant-numeric:tabular-nums">${nDone}/${plan.week.length} erledigt</span></div>
  ${plan.week.map(([d, t], i) => `<label class="task ${done[i] ? "done" : ""}"><input type="checkbox" class="taskbox" id="task-${i}" data-i="${i}" ${done[i] ? "checked" : ""}><span class="day">${esc(d)}</span><span class="txt">${esc(t)}</span></label>`).join("")}</section>
  ${Store.mode === "api" ? "" : `<section class="stack"><h2>Meine Ziele</h2>${plan.goals.map(g => `<div class="goal"><b>${esc(g.t)}</b><span class="small">Zeitraum: ${esc(g.when)}</span></div>`).join("")}</section>`}
  <section class="card stack"><h2>Lernfortschritt</h2>${mods.map(([id, t]) => { const q = p.quiz[id]; const pc = q ? Math.round(q.best / q.of * 100) : 0; return `<div class="prow"><b>${esc(t)}</b><span>${q ? `${q.best}/${q.of}` : "–"}</span><span class="meter"><b style="width:${pc}%"></b></span></div>`; }).join("")}</section>
  ${(LZ.hooks.meBottom || []).map(f => f(pl)).join("")}
  <button class="btn ghost" data-act="logout">Abmelden</button>
  <p class="draft">${Store.mode === "local" ? "Entwurf: Plan und Ziele sind Beispiele. Häkchen und Fortschritt werden nur auf diesem Gerät gespeichert." : "Dein Fortschritt wird in deinem Konto gespeichert."}</p>`;
  }

  /* ---------- Render & Events ---------- */
  function render() {
    const gate = Store.gate ? Store.gate() : null;          // Weg B: erst anmelden
    document.getElementById("shirtBtn").innerHTML = gate ? "" : shirt(S.user ? S.user.nr : Store.coach.active ? "T" : LZ.adminOnly() ? "A" : "?");
    document.getElementById("shirtBtn").hidden = !!gate;
    const brand = document.querySelector(".brand span"); if (brand) brand.textContent = teamLabel();
    if (gate && LZ.views[gate] && !(LZ.legalPages || []).includes(S.view)) { app.innerHTML = LZ.views[gate](); return; }   // Impressum & Co. auch ohne Anmeldung
    // Trainer ohne Spieler-Anmeldung: eigene Startseite (js/dashboard.js), Lerninhalte unter „Lernzone“
    const coachHome = S.view === "home" && LZ.coachMode() && LZ.views.coachHome;
    const adminHome = ["home", "me"].includes(S.view) && LZ.adminOnly() && LZ.views.verwaltung;   // Vereins-/Superadmin ohne Mannschaft
    app.innerHTML = adminHome ? LZ.views.verwaltung() : coachHome ? LZ.views.coachHome()
      : LZ.views[S.view] ? LZ.views[S.view]()
      : S.view === "phase" ? phaseView() : S.view === "modul" ? modulView() : S.view === "zonen" ? zonenView() : S.view === "me" ? meView() : home();   // "lernzone" = home()
  }
  // Verein · Mannschaft (Weg B aus der Anmeldung, sonst aus data/team.json)
  function teamLabel() {
    const t = Store.coach && Store.coach.team;
    if (t) return `${t.club} · ${t.name}`;
    if (Store.mode === "api" && Store.coach && Store.coach.accountId) {             // Admin ohne Mannschaft
      const own = (Store.coach.clubs || []).filter(c => c.own);
      if (own.length === 1) return `${own[0].name} · Verwaltung`;
      if (Store.coach.platformAdmin) return "Plattform · Verwaltung";
    }
    const n = (C && C.team && C.team.name) || "";
    const m = n.match(/^(.*\S)\s+(U\d+\S*|[^\s]+)$/);
    return m ? `${m[1]} · ${m[2]}` : n;
  }
  const fire = (name, ...args) => (LZ.hooks[name] || []).forEach(f => f(...args));
  function go(v, arg) {
    S.view = v; S.arg = arg;
    if (v === "phase" || v === "modul") { S.tab = "grundlagen"; Q = null; }
    if (v === "zonen") newZ("entdecken");
    if (v === "me") { S.loginNr = null; S.pin = ""; S.err = ""; }
    render(); window.scrollTo(0, 0);
    fire("enter", v);
  }
  async function tryLogin() {
    S.busy = true;
    const r = await Store.login(S.loginNr, S.pin);
    S.busy = false; S.pin = "";
    if (r.ok) { S.user = r.user; S.loginNr = null; } else S.err = r.error;
    render();
    if (r.ok) fire("enter", "me");
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b || !C) return;
    const a = b.dataset.act, v = b.dataset.v;
    if (a === "home") go(LZ.coachMode() && ["phase", "zonen", "modul"].includes(S.view) ? "lernzone" : "home");   // Trainer: zurück in die Lernzone
    else if (a === "lernzone") go("lernzone");
    else if (a === "me") {
      if (Store.mode === "api" && !S.user && Store.coach.active && LZ.actions.kaderStart) LZ.actions.kaderStart();
      else go("me");
    }
    else if (a === "zonen") go("zonen");
    else if (a === "phase") go("phase", v);
    else if (a === "modul") go("modul", v);
    else if (a === "tab") { S.tab = v; if (v === "quiz" && Q && Q.i >= Q.qs.length) Q = null; render(); }
    else if (a === "qstart") { startQuiz(S.arg); render(); }
    else if (a === "qpick") { if (Q.picked !== null) return; Q.picked = +b.dataset.i; if (Q.picked === Q.qs[Q.i].c) Q.score++; render(); }
    else if (a === "qnext") { Q.i++; Q.picked = null; if (Q.i >= Q.qs.length) saveBest(Q.id, Q.score, Q.qs.length); render(); }
    else if (a === "zmode") { newZ(v); render(); }
    else if (a === "zone") {
      const l = +b.dataset.l, t = +b.dataset.t;
      if (Z.mode === "entdecken") Z.sel = [l, t];
      else if (Z.mode === "finden" && Z.picked === null) { Z.picked = [l, t]; if (l === Z.target[0] && t === Z.target[1]) Z.score++; }
      render();
    }
    else if (a === "zpick") { if (Z.picked !== null) return; Z.picked = +b.dataset.i; const o = Z.opts[Z.picked]; if (o[0] === Z.target[0] && o[1] === Z.target[1]) Z.score++; render(); }
    else if (a === "znext") { Z.i++; if (Z.i >= ZROUNDS) { Z.done = true; saveBest("zonen", Z.score, ZROUNDS); } else nextZ(); render(); }
    else if (a === "pickNr") { S.loginNr = +v; S.pin = ""; S.err = ""; render(); }
    else if (a === "unpick") { S.loginNr = null; S.pin = ""; S.err = ""; render(); }
    else if (a === "pin" && b.dataset.d === "del") { S.pin = S.pin.slice(0, -1); S.err = ""; render(); }
    else if (a === "pin") {
      if (S.pin.length >= 4 || S.busy) return;
      S.pin += b.dataset.d; S.err = ""; render();
      if (S.pin.length === 4) tryLogin();
    }
    else if (a === "coachOut") { Store.coachLogout().then(() => { if (LZ.views[S.view]) { S.view = "me"; S.loginNr = null; } render(); }); }
    else if (a === "logout") { Store.logout().then(() => { S.user = null; go("home"); }); }
    else if (LZ.actions[a]) LZ.actions[a](b, v, e);
  });
  document.addEventListener("input", e => LZ.inputs.forEach(f => f(e)));
  document.addEventListener("change", e => {
    LZ.inputs.forEach(f => f(e));
    if (!e.target.classList.contains("taskbox")) return;
    const p = prog(), wk = weekKey(); p.tasks[wk] = p.tasks[wk] || {};
    p.tasks[wk][e.target.dataset.i] = e.target.checked; Store.saveProgress(p); render();
  });

  /* ---------- Schnittstelle für Erweiterungen ---------- */
  const LZ = window.LZ = {
    S, views: {}, actions: {}, inputs: [], hooks: {}, teamLabel,
    get C() { return C; }, get Store() { return Store; },
    esc, rand, shirt, pad, dots, posName, posSelect, gkNrs, render, go, weekKey,
    on(name, fn) { (this.hooks[name] = this.hooks[name] || []).push(fn); },
    coachMode() { return !!(Store && Store.mode === "api" && !S.user && Store.coach && Store.coach.active); },
    // Superadmin oder Vereinsadmin (Weg B)
    isAdmin() { return !!(Store && Store.mode === "api" && !S.user && Store.coach && (Store.coach.platformAdmin || (Store.coach.clubs || []).length)); },
    adminOnly() { return this.isAdmin() && !Store.coach.active; },
    top() { window.scrollTo(0, 0); }
  };

  /* ---------- Start ---------- */
  (async function boot() {
    try {
      Store = await window.LZStoreReady;
      C = await Store.loadContent();
      C.modules = C.modules || [];
      PH = Object.fromEntries(C.phases.concat(C.modules).map(p => [p.id, p]));   // Module (z. B. 2v1) nutzen dasselbe Quiz
      window.LZPitch.setup(C.zones, C.team, gkNrs());
      const s = await Store.init();
      S.user = s.user;
      render();
      fire("ready");
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="card stack"><h2>Inhalte konnten nicht geladen werden</h2><p>Lade die Seite neu. Wenn du sie direkt als Datei geöffnet hast: Die App braucht einen Webserver (siehe README).</p></div>`;
    }
  })();
})();
