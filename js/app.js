/*
 * Lernzone – Oberfläche
 * Liest Inhalte über LZStore.loadContent() und speichert nur über LZStore.
 * Keine Daten und keine PINs in dieser Datei.
 */
(function () {
  let Store = null;
  const field = o => window.LZPitch.field(o);
  let C = null;                       // Inhalte aus data/*.json
  let PH = {};
  const S = { view: "home", arg: null, tab: "grundlagen", user: null, loginNr: null, pin: "", err: "", busy: false };
  // Spieler anlegen: step "auth" | "setup" | "setup2" | "form" | "done"
  const A = { step: "auth", cpin: "", first: "", err: "", type: "feld", nr: "", pin: "", created: null };
  let Q = null, Z = null;
  const ZROUNDS = 10;
  const APP_VERSION = "0.5.0";   // bei jeder Änderung erhöhen und in CHANGELOG.md eintragen
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
    return `<svg viewBox="0 0 64 60" aria-hidden="true"><path d="${SHIRT_PATH}" fill="${fill}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><text x="32" y="${label === "+" ? 39 : 41}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="700" font-size="${fs}">${esc(label)}</text></svg>`;
  }
  const pad = act => `<div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button data-act="${act}" data-d="${d}">${d}</button>`).join("")}<span></span><button data-act="${act}" data-d="0">0</button><button data-act="${act}" data-d="del" aria-label="Löschen">⌫</button></div>`;
  const dots = (n, len) => `<div class="pins" aria-label="${n} von ${len} Ziffern">${Array.from({ length: len }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>`;
  const legend = () => `<div class="legend"><span><i class="dotk" style="background:${C.team.colors.shirt}"></i>Wir</span><span><i class="dotk" style="background:#e9eef3;border:1px solid #23303b"></i>Gegner</span><span>━ Pass</span><span>╍ Laufweg</span></div>`;
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
    return `<section><p class="eyebrow">${S.user ? `Angemeldet als Nr. ${S.user.nr}` : "Spielphasenmodell"}</p>
    <h1>${S.user ? "Weiter geht's" : "Lernen, wie wir spielen"}</h1>
    <p class="lede">Das Spiel hat vier Phasen, die sich immer wieder abwechseln. Dazu kommen die Standards, wenn das Spiel ruht. Für jede Phase gibt es Grundlagen, Lernmaterial und ein Quiz.</p></section>
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
  <p class="draft">Entwurf: Texte, Situationen und Fragen sind Vorschläge und werden durch die Inhalte des Trainerteams ersetzt.</p>
  <p class="small" style="text-align:center">Version ${APP_VERSION}</p>`;
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
      body = `<div class="stack">${field({ ...ph.sit, label: ph.sit.cap })}${legend()}<p class="caption">${esc(ph.sit.cap)}</p></div>
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
    <button class="btn wide" data-act="qstart">Nochmal</button><button class="btn ghost wide" data-act="tab" data-v="material">Zum Lernmaterial</button></div>`;
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

  /* ---------- Anmeldung ---------- */
  function loginView() {
    if (S.loginNr === null) return `<button class="back" data-act="home">‹ Übersicht</button>
  <section><p class="eyebrow">Mein Bereich</p><h1>Wähle deine Nummer</h1><p class="lede">Danach gibst du deine 4-stellige PIN ein. Die bekommst du von deinem Trainer.</p></section>
  ${coachBar()}
  <div class="nrgrid">${C.players.map(p => `<button class="nr" data-act="pickNr" data-v="${p.nr}" aria-label="Nummer ${p.nr}">${shirt(p.nr)}<span>${p.plan === "tw" ? "Tor" : "&nbsp;"}</span></button>`).join("")}
  ${Store.canManage ? `<button class="nr add" data-act="addStart" aria-label="Neuen Spieler anlegen">${shirt("+", "add")}<span>Neu</span></button>` : ""}</div>
  ${Store.canManage && !Store.coach.active ? `<p style="text-align:center"><button class="linkbtn" data-act="kaderStart">Trainer: Kader verwalten</button></p>` : ""}`;
    return `<button class="back" data-act="unpick">‹ Andere Nummer</button>
  <section style="display:grid;justify-items:center;gap:8px;text-align:center"><div style="width:72px">${shirt(S.loginNr)}</div><h1>PIN eingeben</h1></section>
  ${dots(S.pin.length, 4)}
  <p class="err" role="alert">${esc(S.err)}</p>
  ${pad("pin")}`;
  }

  /* ---------- Trainer-Bereich (nur mit PHP): Kader verwalten, Spieler anlegen, PIN ändern ---------- */
  // A.step: "auth" | "setup" | "setup2" | "kader" | "form" | "done" | "edit" | "pindone"
  // A.from: "grid" (über das + in der Nummernwahl) | "kader"
  const coachBar = () => Store.coach.active ? `<div class="coachbar"><span>Als Trainer angemeldet</span><span class="coachbar-links">${A.step !== "kader" ? `<button class="linkbtn" data-act="kaderOpen">Kader verwalten</button>` : ""}<button class="linkbtn" data-act="coachOut">Abmelden</button></span></div>` : "";
  function coachView() {
    const toGrid = `<button class="back" data-act="addBack">‹ Zur Nummernwahl</button>`;
    const toKader = `<button class="back" data-act="kaderOpen">‹ Zum Kader</button>`;
    const back = A.from === "kader" ? toKader : toGrid;
    const head = (t, sub) => `<section style="display:grid;justify-items:center;gap:8px;text-align:center"><div style="width:72px">${shirt("+", "add")}</div><h1>${t}</h1>${sub ? `<p class="lede">${sub}</p>` : ""}</section>`;
    const pinField = (id, label) => `<div class="fld"><label for="${id}">${label}</label>
      <div class="row"><input id="${id}" type="text" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="z. B. 4821" value="${esc(A.pin)}">
      <button class="btn ghost" data-act="addRandom">Zufällig</button></div></div>`;
    const pinCard = (nr, title) => `<div class="card stack" style="text-align:center"><p class="eyebrow">${title}</p><p class="pinshow">${esc(A.pin)}</p>
      <p class="small">Notiere die PIN jetzt und gib sie dem Spieler. Sie wird verschlüsselt gespeichert und hier nicht noch einmal angezeigt.</p></div>`;

    if (A.step === "auth") {
      if (!Store.coach.hasPin && !Store.coach.canSetup) return `${toGrid}${head("Trainer-PIN fehlt", "Auf diesem Server ist noch keine Trainer-PIN eingerichtet. Richte sie mit <code>php tools/set_coach_pin.php</code> ein.")}`;
      return `${toGrid}${head("Trainer-PIN", "Diesen Bereich kann nur der Trainer öffnen.")}${dots(A.cpin.length, 6)}<p class="err" role="alert">${esc(A.err)}</p>${pad("cpin")}`;
    }
    if (A.step === "setup" || A.step === "setup2") {
      return `${toGrid}${head(A.step === "setup" ? "Trainer-PIN festlegen" : "Trainer-PIN wiederholen", A.step === "setup" ? "Lege einmalig eine 6-stellige Trainer-PIN fest. Damit schützt du den Kader." : "Gib dieselbe PIN noch einmal ein.")}${dots(A.cpin.length, 6)}<p class="err" role="alert">${esc(A.err)}</p>${pad("cpin")}`;
    }
    if (A.step === "kader") {
      return `${toGrid}
      <section><p class="eyebrow">Trainer</p><h1>Kader verwalten</h1><p class="lede">Tippe auf ein Trikot, um die PIN zu ändern. Mit dem grauen Trikot legst du einen neuen Spieler an.</p></section>
      ${coachBar()}
      <div class="nrgrid">${C.players.map(p => `<button class="nr" data-act="editNr" data-v="${p.nr}" aria-label="PIN von Nummer ${p.nr} ändern">${shirt(p.nr)}<span>${p.plan === "tw" ? "Tor" : "&nbsp;"}</span></button>`).join("")}
      <button class="nr add" data-act="addFromKader" aria-label="Neuen Spieler anlegen">${shirt("+", "add")}<span>Neu</span></button></div>`;
    }
    if (A.step === "edit") {
      const p = C.players.find(x => x.nr === A.editNr);
      return `${toKader}
      <section style="display:grid;justify-items:center;gap:8px;text-align:center"><div style="width:84px">${shirt(p.nr)}</div>
      <p class="eyebrow">${p.plan === "tw" ? "Torwart" : "Feldspieler"}</p><h1>Nr. ${p.nr}</h1></section>
      ${coachBar()}
      ${pinField("edit-pin", "Neue PIN (4 Ziffern)")}
      <p class="err" role="alert" style="text-align:left">${esc(A.err)}</p>
      <button class="btn wide" data-act="pinSave" ${S.busy ? "disabled" : ""}>PIN speichern</button>
      <p class="small">Die alte PIN gilt danach nicht mehr.</p>`;
    }
    if (A.step === "pindone") {
      return `<section style="display:grid;justify-items:center;gap:10px;text-align:center"><div style="width:96px">${shirt(A.editNr)}</div>
      <p class="eyebrow">PIN geändert</p><h1>Nr. ${A.editNr}</h1></section>
      ${pinCard(A.editNr, `Neue PIN für Nr. ${A.editNr}`)}
      <button class="btn wide" data-act="kaderOpen">Zum Kader</button>`;
    }
    if (A.step === "done") {
      const p = A.created;
      return `<section style="display:grid;justify-items:center;gap:10px;text-align:center"><div style="width:96px">${shirt(p.nr)}</div>
      <p class="eyebrow">${p.plan === "tw" ? "Torwart" : "Feldspieler"} angelegt</p><h1>Nr. ${p.nr}</h1></section>
      ${pinCard(p.nr, `PIN für Nr. ${p.nr}`)}
      <button class="btn wide" data-act="addAgain">Weiteren Spieler anlegen</button>
      <button class="btn ghost wide" data-act="kaderOpen">Zum Kader</button>`;
    }
    // Formular: neuer Spieler
    const typeBtn = (t, label) => `<button class="typebtn" data-act="addType" data-v="${t}" aria-pressed="${A.type === t}">${shirt(A.nr && /^\d{1,2}$/.test(A.nr) ? A.nr : (t === "tw" ? "TW" : "?"), t)}<span>${label}</span></button>`;
    return `${back}
    <section><p class="eyebrow">Kader</p><h1>Neuer Spieler</h1></section>
    ${coachBar()}
    <div class="stack"><p class="fldlabel">Trikot</p><div class="typepick">${typeBtn("tw", "Torwart")}${typeBtn("feld", "Feldspieler")}</div></div>
    <div class="fld"><label for="add-nr">Trikotnummer</label>
      <input id="add-nr" type="text" inputmode="numeric" maxlength="2" autocomplete="off" placeholder="z. B. 23" value="${esc(A.nr)}"></div>
    ${pinField("add-pin", "PIN für den Spieler (4 Ziffern)")}
    <p class="err" role="alert" style="text-align:left">${esc(A.err)}</p>
    <button class="btn wide" data-act="addSave" ${S.busy ? "disabled" : ""}>Spieler anlegen</button>`;
  }
  // Einstieg: target = "form" (neuer Spieler) oder "kader"; from = woher man kam
  function coachStart(target, from) {
    Object.assign(A, { cpin: "", first: "", err: "", type: "feld", nr: "", pin: "", created: null, editNr: null, next: target, from });
    A.step = Store.coach.active ? target : (Store.coach.hasPin ? "auth" : (Store.coach.canSetup ? "setup" : "auth"));
    S.view = "add"; render(); window.scrollTo(0, 0);
  }
  function setStep(step, extra) { Object.assign(A, { err: "", pin: "" }, extra || {}); A.step = step; S.view = "add"; render(); window.scrollTo(0, 0); }
  async function coachPinComplete() {
    const pin = A.cpin; A.cpin = "";
    if (A.step === "setup") { A.first = pin; A.step = "setup2"; render(); return; }
    S.busy = true;
    let r;
    if (A.step === "setup2") {
      if (pin !== A.first) { S.busy = false; A.step = "setup"; A.first = ""; A.err = "Die PINs stimmen nicht überein. Bitte neu festlegen."; render(); return; }
      r = await Store.coachSetup(pin);
    } else r = await Store.coachLogin(pin);
    S.busy = false;
    if (r.ok) { A.step = A.next || "kader"; A.err = ""; } else A.err = r.error || "Das hat nicht geklappt.";
    render();
  }
  function coachLost(r) {               // Server meldet: Trainer nicht (mehr) angemeldet
    if (/Trainer/.test(r.error || "")) { Store.coach.active = false; A.next = A.step === "edit" ? "kader" : A.step; A.step = "auth"; }
  }
  async function addSave() {
    const nr = A.nr.trim(), pin = A.pin.trim();
    if (!/^\d{1,2}$/.test(nr) || +nr < 1) { A.err = "Bitte eine Trikotnummer von 1 bis 99 eingeben."; render(); return; }
    if (C.players.some(p => p.nr === +nr)) { A.err = `Die Nummer ${+nr} ist schon vergeben.`; render(); return; }
    if (!/^\d{4}$/.test(pin)) { A.err = "Die PIN muss genau 4 Ziffern haben."; render(); return; }
    S.busy = true; A.err = ""; render();
    const r = await Store.addPlayer({ nr: +nr, type: A.type, pin });
    S.busy = false;
    if (!r.ok) { A.err = r.error || "Speichern hat nicht geklappt."; coachLost(r); render(); return; }
    C.players.push(r.player); C.players.sort((a, b) => a.nr - b.nr);
    window.LZPitch.setup(C.zones, C.team, gkNrs());
    A.created = r.player; A.pin = pin; A.step = "done"; render(); window.scrollTo(0, 0);
  }
  async function pinSave() {
    const pin = A.pin.trim();
    if (!/^\d{4}$/.test(pin)) { A.err = "Die PIN muss genau 4 Ziffern haben."; render(); return; }
    S.busy = true; A.err = ""; render();
    const r = await Store.setPin(A.editNr, pin);
    S.busy = false;
    if (!r.ok) { A.err = r.error || "Speichern hat nicht geklappt."; coachLost(r); render(); return; }
    A.step = "pindone"; render(); window.scrollTo(0, 0);
  }

  /* ---------- Mein Bereich ---------- */
  function meView() {
    if (!S.user) return loginView();
    const pl = S.user, plan = C.plans[pl.plan], p = prog(), wk = weekKey(), done = p.tasks[wk] || {};
    const nDone = plan.week.filter((_, i) => done[i]).length;
    const mods = [["zonen", "Spielfeld & Zonen"], ...C.phases.map(x => [x.id, x.title])];
    return `<section class="me-head">${shirt(pl.nr)}<div><p class="eyebrow">Mein Bereich</p><h1>Nr. ${pl.nr}</h1><p class="small">${esc(pl.pos)} · ${esc(C.team.name)}</p></div></section>
  <section class="stack"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2>Diese Woche</h2><span class="small" style="font-variant-numeric:tabular-nums">${nDone}/${plan.week.length} erledigt</span></div>
  ${plan.week.map(([d, t], i) => `<label class="task ${done[i] ? "done" : ""}"><input type="checkbox" class="taskbox" id="task-${i}" data-i="${i}" ${done[i] ? "checked" : ""}><span class="day">${esc(d)}</span><span class="txt">${esc(t)}</span></label>`).join("")}</section>
  <section class="stack"><h2>Meine Ziele</h2>${plan.goals.map(g => `<div class="goal"><b>${esc(g.t)}</b><span class="small">Zeitraum: ${esc(g.when)}</span></div>`).join("")}</section>
  <section class="card stack"><h2>Lernfortschritt</h2>${mods.map(([id, t]) => { const q = p.quiz[id]; const pc = q ? Math.round(q.best / q.of * 100) : 0; return `<div class="prow"><b>${esc(t)}</b><span>${q ? `${q.best}/${q.of}` : "–"}</span><span class="meter"><b style="width:${pc}%"></b></span></div>`; }).join("")}</section>
  <button class="btn ghost" data-act="logout">Abmelden</button>
  <p class="draft">${Store.mode === "local" ? "Entwurf: Plan und Ziele sind Beispiele. Häkchen und Fortschritt werden nur auf diesem Gerät gespeichert." : "Dein Fortschritt wird in deinem Konto gespeichert."}</p>`;
  }

  /* ---------- Render & Events ---------- */
  function render() {
    document.getElementById("shirtBtn").innerHTML = shirt(S.user ? S.user.nr : "?");
    app.innerHTML = S.view === "phase" ? phaseView() : S.view === "zonen" ? zonenView() : S.view === "me" ? meView() : S.view === "add" ? coachView() : home();
  }
  function go(v, arg) {
    S.view = v; S.arg = arg;
    if (v === "phase") { S.tab = "grundlagen"; Q = null; }
    if (v === "zonen") newZ("entdecken");
    if (v === "me") { S.loginNr = null; S.pin = ""; S.err = ""; }
    render(); window.scrollTo(0, 0);
  }
  async function tryLogin() {
    S.busy = true;
    const r = await Store.login(S.loginNr, S.pin);
    S.busy = false; S.pin = "";
    if (r.ok) { S.user = r.user; S.loginNr = null; } else S.err = r.error;
    render();
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b || !C) return;
    const a = b.dataset.act, v = b.dataset.v;
    if (a === "home") go("home");
    else if (a === "me") go("me");
    else if (a === "zonen") go("zonen");
    else if (a === "phase") go("phase", v);
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
    else if (a === "addStart") coachStart("form", "grid");
    else if (a === "kaderStart") coachStart("kader", "grid");
    else if (a === "kaderOpen") { if (Store.coach.active) setStep("kader", { from: "kader" }); else coachStart("kader", "grid"); }
    else if (a === "addFromKader" || a === "addAgain") { setStep("form", { from: "kader", type: "feld", nr: "", created: null }); }
    else if (a === "editNr") setStep("edit", { editNr: +v });
    else if (a === "pinSave") { if (!S.busy) pinSave(); }
    else if (a === "addBack") { S.view = "me"; S.loginNr = null; S.pin = ""; S.err = ""; render(); window.scrollTo(0, 0); }
    else if (a === "addType") { A.type = v; render(); }
    else if (a === "addRandom") { A.pin = String(rand(10000)).padStart(4, "0"); render(); }
    else if (a === "addSave") { if (!S.busy) addSave(); }
    else if (a === "cpin") {
      if (S.busy) return;
      if (b.dataset.d === "del") { A.cpin = A.cpin.slice(0, -1); A.err = ""; render(); return; }
      if (A.cpin.length >= 6) return;
      A.cpin += b.dataset.d; A.err = ""; render();
      if (A.cpin.length === 6) coachPinComplete();
    }
    else if (a === "coachOut") { Store.coachLogout().then(() => { if (S.view === "add") { S.view = "me"; S.loginNr = null; } render(); }); }
    else if (a === "logout") { Store.logout().then(() => { S.user = null; go("home"); }); }
  });
  document.addEventListener("input", e => {
    if (e.target.id === "add-nr") {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 2); A.nr = e.target.value;
      document.querySelectorAll(".typebtn").forEach(btn => { const t = btn.querySelector("text"); if (t) t.textContent = A.nr || (btn.dataset.v === "tw" ? "TW" : "?"); });
    }
    if (e.target.id === "add-pin" || e.target.id === "edit-pin") { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); A.pin = e.target.value; }
  });
  document.addEventListener("change", e => {
    if (!e.target.classList.contains("taskbox")) return;
    const p = prog(), wk = weekKey(); p.tasks[wk] = p.tasks[wk] || {};
    p.tasks[wk][e.target.dataset.i] = e.target.checked; Store.saveProgress(p); render();
  });

  /* ---------- Start ---------- */
  (async function boot() {
    try {
      Store = await window.LZStoreReady;
      C = await Store.loadContent();
      PH = Object.fromEntries(C.phases.map(p => [p.id, p]));
      window.LZPitch.setup(C.zones, C.team, gkNrs());
      const s = await Store.init();
      S.user = s.user;
      render();
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="card stack"><h2>Inhalte konnten nicht geladen werden</h2><p>Lade die Seite neu. Wenn du sie direkt als Datei geöffnet hast: Die App braucht einen Webserver (siehe README).</p></div>`;
    }
  })();
})();
