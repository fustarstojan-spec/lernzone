/*
 * Lernzone – Spieler-Funktionen mit Server (nur Weg B / PHP)
 * Mein Bereich: Trainingsbeteiligung, nächste Trainings mit Absage, Befindens-Barometer vor/nach dem Training, eigenes Profil
 * Startseite: nächste Trainings (absagen) + Trainingsbeteiligung
 * Daten: api/my.php (lesen), api/mood.php, api/profile.php und api/absence.php (speichern)
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const K = { data: null, forNr: null, err: "", edit: {}, M: {}, P: null, msg: "", busy: false, abs: null, absErr: "", at: 0 };

  const LAUNE = ["😞", "🙁", "😐", "🙂", "😄"];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const TAGE = [["mo", "Mo"], ["di", "Di"], ["mi", "Mi"], ["do", "Do"], ["fr", "Fr"]];
  const FUSS = { links: "links", rechts: "rechts", beide: "beidfüßig" };
  const TRIKOT = ["140", "152", "164", "176", "XS", "S", "M", "L", "XL"];

  const fmtDate = iso => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  };
  const isToday = iso => iso === new Date().toLocaleDateString("sv-SE");
  const active = () => LZ.Store && LZ.Store.canManage && LZ.S.user;

  async function load() {
    if (!active()) return;
    const nr = LZ.S.user.nr;
    if (K.forNr !== nr) { K.data = null; K.edit = {}; K.M = {}; }
    const [r, ie] = await Promise.all([LZ.Store.get("my.php"), LZ.Store.get("iep.php")]);
    K.iep = ie && ie.ok ? ie : null;
    if (r.ok) { K.data = r; K.forNr = nr; K.err = ""; K.at = Date.now(); } else K.err = r.error || "Konnte deine Daten nicht laden.";
    if (["me", "home"].includes(LZ.S.view)) LZ.render();
  }
  LZ.on("enter", v => { if (v === "me" || (v === "home" && Date.now() - K.at > 30000)) load(); });
  LZ.on("ready", () => {
    if (["me", "home"].includes(LZ.S.view)) load();
    // Startseite: nach „Nächster Termin“ (calendar.js) einreihen
    LZ.on("homeTop", () => {
      if (!active() || !K.data || K.forNr !== LZ.S.user.nr) return "";
      return trainingsCard(K.data, true) + attendanceCard(K.data.attendance, true);
    });
  });

  /* ---------- Bausteine für Mein Bereich ---------- */
  /* ---------- Meine Ziele (IEP) + Selbsteinschätzung nach dem Spiel ---------- */
  const AREAS = [["ind", "Mein persönliches Ziel"], ["tech", "Technik"], ["phys", "Körper & Fitness"], ["off", "Mit Ball (offensiv)"], ["def", "Gegen den Ball (defensiv)"]];
  const STARS = ["gar nicht", "wenig", "teils", "gut", "super"];
  function iepCard() {
    const ie = K.iep;
    if (!ie || !ie.iep) return `<section class="card stack"><h2>Meine Ziele</h2><p class="small">Deine Ziele legst du mit deinem Trainer im Gespräch fest. Danach stehen sie hier.</p></section>`;
    const g = ie.iep.goals || {}, p = ie.iep.plan || {}, rate = ie.rate;
    const plan = [["short", "Bald"], ["mid", "In ein paar Monaten"], ["long", "Bis Saisonende"]].filter(([k]) => p[k]);
    return `<section class="card stack"><div class="rowspread"><h2>Meine Ziele</h2>${ie.iep.season ? `<span class="small">${esc(ie.iep.season)}</span>` : ""}</div>
      ${rate && ie.consent ? `<div class="rateblock"><b>Nach dem Spiel: ${esc(rate.game.title)}</b><span class="small">Wie gut hast du deine Ziele umgesetzt? 1 = gar nicht · 5 = super</span>
        ${AREAS.filter(([k]) => (g[k] || []).length).map(([k, l]) => `<div class="raterow"><span>${l}</span><div class="scale scale-5">${[1, 2, 3, 4, 5].map(v =>
          `<button class="sbtn ${rate.values[k] === v ? "on" : ""}" data-act="iepRate" data-k="${k}" data-v="${v}" aria-pressed="${rate.values[k] === v}" title="${STARS[v - 1]}">${v}</button>`).join("")}</div></div>`).join("")}
        ${Object.keys(rate.values).length ? `<p class="okmsg">Gespeichert – dein Trainer sieht es.</p>` : ""}</div>` : ""}
      ${AREAS.filter(([k]) => (g[k] || []).length).map(([k, l]) => `<div class="goalarea"><b>${l}</b><ul>${g[k].map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
      ${plan.length ? `<div class="goalarea"><b>Mein Zeitplan</b><ul>${plan.map(([k, l]) => `<li><b>${l}:</b> ${esc(p[k])}</li>`).join("")}</ul></div>` : ""}
      <p class="small">Deine Ziele sehen nur du und deine Trainer.</p></section>`;
  }
  LZ.actions.iepRate = async b => {
    const rate = K.iep.rate, k = b.dataset.k, v = +b.dataset.v;
    rate.values[k] = v; LZ.render();
    const r = await LZ.Store.send("iep.php", { action: "rate", id: rate.game.id, area: k, value: v });
    if (r.ok) rate.values = r.values; else K.err = r.error || "Speichern hat nicht geklappt.";
    LZ.render();
  };

  /* Nächste Trainings mit „Absagen“ */
  const hm = s => s.slice(11, 16);
  function trainingsCard(d, home) {
    const list = (d.upcoming || []).slice(0, home ? 3 : 6), R = d.reasons || {};
    if (!list.length) return home ? "" : `<section class="card stack"><h2>Meine Trainings</h2><p class="small">In den nächsten zwei Wochen ist kein Training eingetragen.</p></section>`;
    const row = t => {
      const when = `${esc(fmtDate(t.date))}${t.time ? " · " + esc(t.time) : ""}`;
      const dl = `${fmtDate(t.deadline.slice(0, 10))} ${hm(t.deadline)}`;
      let right;
      if (t.cancelled) right = `<span class="abschip">Fällt aus</span>`;
      else if (K.abs === t.id) right = `<div class="reasons">${Object.entries(R).map(([k, l]) => `<button class="btn ghost small-btn" data-act="absSet" data-t="${t.id}" data-v="${k}">${esc(l)}</button>`).join("")}
          <button class="linkbtn" data-act="absCancel">Abbrechen</button></div>`;
      else if (t.absent) right = `<span class="abschip">Abgesagt · ${esc(R[t.absent] || t.absent)}</span>${t.canChange ? `<button class="linkbtn" data-act="absBack" data-t="${t.id}">Ich bin doch dabei</button>` : ""}`;
      else right = t.canChange ? `<button class="btn ghost small-btn" data-act="absOpen" data-t="${t.id}">Absagen</button>` : `<span class="small">Absagen nur noch beim Trainer</span>`;
      return `<li class="trrow${t.absent ? " off" : ""}"><div><b>${when}</b><span class="small">${esc(t.title)}${t.location ? " · " + (LZ.mapLink ? LZ.mapLink(t.location) : esc(t.location)) : ""}</span>
        ${!t.absent && !t.cancelled && t.canChange && K.abs !== t.id ? `<span class="small">absagen bis ${esc(dl)} Uhr</span>` : ""}</div><div class="trright">${right}</div></li>`;
    };
    return `<section class="card stack"><h2>Meine Trainings</h2>
      ${K.abs ? `<p class="small"><b>Warum kannst du nicht kommen?</b> Dein Trainer sieht nur den Grund.</p>` : ""}
      ${K.absErr ? `<p class="err" style="text-align:left">${esc(K.absErr)}</p>` : ""}
      <ul class="trlist">${list.map(row).join("")}</ul></section>`;
  }
  LZ.actions.absOpen = b => { K.abs = +b.dataset.t; K.absErr = ""; LZ.render(); };
  LZ.actions.absCancel = () => { K.abs = null; K.absErr = ""; LZ.render(); };
  async function absSend(body) {
    if (K.busy) return; K.busy = true;
    const r = await LZ.Store.send("absence.php", body);
    K.busy = false;
    if (!r.ok) { K.absErr = r.error || "Hat nicht geklappt."; LZ.render(); return; }
    K.abs = null; K.absErr = ""; K.data.upcoming = r.upcoming; LZ.render();
  }
  LZ.actions.absSet = b => absSend({ action: "set", id: +b.dataset.t, reason: b.dataset.v });
  LZ.actions.absBack = b => absSend({ action: "withdraw", id: +b.dataset.t });

  function attendanceCard(a, home) {
    if (!a.total) return home ? "" : `<section class="card stack"><h2>Trainingsbeteiligung</h2><p class="small">Noch keine Trainings eingetragen.</p></section>`;
    const pct = Math.round(a.attended / a.total * 100);
    return `<section class="card stack">
      <div class="rowspread"><h2>Trainingsbeteiligung</h2><span class="bignum">${pct}&nbsp;%</span></div>
      <div class="attline" role="img" aria-label="${a.attended} von ${a.total} Trainings besucht">${a.last.map(x => `<i class="${x.present ? "on" : ""}" title="${esc(fmtDate(x.date))}: ${x.present ? "da" : "nicht da"}"></i>`).join("")}</div>
      <p class="small">${a.attended} von ${a.total} Trainings · Punkte: die letzten ${a.last.length}, rechts das neueste</p></section>`;
  }

  const scale = (tid, phase, key, n, val, labels) => `<div class="scale scale-${n}" role="group" aria-label="${esc(key)}">${Array.from({ length: n }, (_, i) => i + 1).map(i =>
    `<button class="sbtn ${val === i ? "on" : ""}" data-act="mset" data-t="${tid}" data-p="${phase}" data-k="${key}" data-v="${i}" aria-pressed="${val === i}">${labels ? labels[i - 1] : i}</button>`).join("")}</div>`;

  function moodSummary(phase, d) {
    if (phase === "vor") return `${LAUNE[(d.laune || 3) - 1]} Laune ${d.laune} · Schlaf ${d.schlaf ?? "–"} · Energie ${d.energie ?? "–"}${d.nichtfit ? " · nicht fit" : ""}`;
    return `Belastung ${d.rpe} von 10`;
  }

  function moodBlock(t, phase) {
    const key = `${t.id}-${phase}`, saved = t[phase];
    const title = phase === "vor" ? "Vor dem Training" : "Nach dem Training";
    if (saved && !K.edit[key]) {
      return `<div class="moodblock done"><div class="rowspread"><b>${title}</b><button class="linkbtn" data-act="medit" data-t="${t.id}" data-p="${phase}">Ändern</button></div>
        <p>${esc(moodSummary(phase, saved))}</p>${saved.kommentar ? `<p class="small">„${esc(saved.kommentar)}“</p>` : ""}<p class="okmsg">Gesendet – danke!</p></div>`;
    }
    const m = K.M[key] = K.M[key] || Object.assign({}, saved || {});
    const body = phase === "vor" ? `
        <p class="qlabel">Wie fühlst du dich?</p>${scale(t.id, phase, "laune", 5, m.laune, LAUNE)}
        <p class="qlabel">Wie hast du geschlafen? <span class="small">1 = schlecht · 5 = super</span></p>${scale(t.id, phase, "schlaf", 5, m.schlaf)}
        <p class="qlabel">Wie viel Energie hast du? <span class="small">1 = leer · 5 = voll</span></p>${scale(t.id, phase, "energie", 5, m.energie)}
        <label class="check"><input type="checkbox" id="mnf-${t.id}" ${m.nichtfit ? "checked" : ""}> Ich fühle mich nicht fit – bitte sprich mich an</label>`
      : `
        <p class="qlabel">Wie anstrengend war das Training? <span class="small">1 = ganz locker · 10 = maximal</span></p>${scale(t.id, phase, "rpe", 10, m.rpe)}`;
    return `<div class="moodblock"><b>${title}</b>${body}
        <div class="fld"><label for="mk-${key}">Nachricht an den Trainer (freiwillig)</label><textarea id="mk-${key}" rows="2" maxlength="200">${esc(m.kommentar || "")}</textarea></div>
        ${K.edit[key + "-err"] ? `<p class="err" style="text-align:left">${esc(K.edit[key + "-err"])}</p>` : ""}
        <button class="btn wide" data-act="msend" data-t="${t.id}" data-p="${phase}" ${K.busy ? "disabled" : ""}>Senden</button></div>`;
  }

  function moodCard(d) {
    if (!d.consent) return `<section class="card stack"><h2>Wie geht's dir?</h2><p class="small">Das Befindens-Barometer schaltet dein Trainer frei, sobald die Einwilligung deiner Eltern da ist.</p></section>`;
    if (!d.today.length) return `<section class="card stack"><h2>Wie geht's dir?</h2><p class="small">Heute ist kein Training eingetragen. Vor und nach jedem Training kannst du hier deinem Trainer sagen, wie es dir geht.</p></section>`;
    return d.today.map(t => `<section class="card stack"><div class="rowspread"><h2>Wie geht's dir?</h2><span class="small">${isToday(t.date) ? "heute" : "gestern"}${t.time ? " · " + esc(t.time) : ""}</span></div>
      <p class="small"><b>${esc(t.title || "Training")}</b>${t.location ? " · " + (LZ.mapLink ? LZ.mapLink(t.location) : esc(t.location)) : ""}${t.note ? " · " + esc(t.note) : ""}</p>
      ${isToday(t.date) ? moodBlock(t, "vor") : ""}${moodBlock(t, "nach")}
      <p class="small">Wenn dich etwas belastet, sprich mit deinem Trainer oder deinen Eltern.</p></section>`).join("");
  }

  function profileCard(d) {
    if (!d.consent) return `<section class="card stack"><h2>Mein Profil</h2><p class="small">Dein Profil wird freigeschaltet, sobald die Einwilligung deiner Eltern da ist.</p></section>`;
    const p = d.profile || {};
    const name = [p.vorname, p.nachname].filter(Boolean).join(" ");
    const rows = [
      ["Geburtstag", p.geb_tag && p.geb_monat ? `${p.geb_tag}. ${MONATE[p.geb_monat - 1]}` : ""],
      ["Starker Fuß", FUSS[p.fuss] || ""],
      ["Wunschposition", p.wunsch ? `${p.wunsch} · ${LZ.posName(p.wunsch)}` : ""],
      ["Vorbild", p.vorbild || ""],
      ["Schulschluss", TAGE.filter(([k]) => p.schule && p.schule[k]).map(([k, l]) => `${l} ${p.schule[k]}`).join(" · ")],
      ["Größen", [p.trikot ? `Trikot ${p.trikot}` : "", p.schuh ? `Schuh ${p.schuh}` : ""].filter(Boolean).join(" · ")]
    ].filter(r => r[1]);
    return `<section class="card stack"><div class="rowspread"><h2>Mein Profil</h2><button class="linkbtn" data-act="profEdit">Bearbeiten</button></div>
      ${name ? `<p class="profname">${esc(name)}</p>` : `<p class="small">Noch leer. Tippe auf „Bearbeiten“ und erzähl deinem Trainer etwas über dich.</p>`}
      ${rows.length ? `<dl class="sub">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${p.ziel ? `<div class="goal"><b>Mein Ziel für die Saison</b><span>${esc(p.ziel)}</span></div>` : ""}
      <p class="small">Dein Profil sehen nur du und deine Trainer.</p></section>`;
  }

  LZ.on("meTop", () => {
    if (!active()) return "";
    if (K.err) return `<section class="card"><p class="err" style="text-align:left">${esc(K.err)}</p></section>`;
    if (!K.data || K.forNr !== LZ.S.user.nr) return `<section class="card"><p class="small">Lade deine Daten …</p></section>`;
    return attendanceCard(K.data.attendance) + trainingsCard(K.data) + iepCard() + moodCard(K.data) + profileCard(K.data);
  });

  /* ---------- Profil bearbeiten ---------- */
  LZ.views.profile = () => {
    const p = K.P;
    const opt = (vals, cur, labels) => vals.map((v, i) => `<option value="${esc(v)}" ${String(cur ?? "") === String(v) ? "selected" : ""}>${esc(labels ? labels[i] : v)}</option>`).join("");
    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    return `<button class="back" data-act="me">‹ Mein Bereich</button>
    <section><p class="eyebrow">Mein Profil</p><h1>Über mich</h1><p class="lede">Das sehen nur du und deine Trainer.</p></section>
    <div class="grid2">
      <div class="fld"><label for="prof-vorname">Vorname</label><input id="prof-vorname" maxlength="40" autocomplete="given-name" value="${esc(p.vorname || "")}"></div>
      <div class="fld"><label for="prof-nachname">Nachname</label><input id="prof-nachname" maxlength="40" autocomplete="family-name" value="${esc(p.nachname || "")}"></div>
    </div>
    <div class="fld"><label for="prof-geb_tag">Geburtstag</label><div class="row">
      <select id="prof-geb_tag" aria-label="Tag"><option value="">Tag</option>${opt(days, p.geb_tag)}</select>
      <select id="prof-geb_monat" aria-label="Monat"><option value="">Monat</option>${opt(MONATE.map((_, i) => i + 1), p.geb_monat, MONATE)}</select></div></div>
    <div class="fld"><span class="fldlabel">Schulschluss</span><div class="days">${TAGE.map(([k, l]) => `<label class="day-in"><span>${l}</span><input type="time" id="prof-schule-${k}" value="${esc((p.schule || {})[k] || "")}"></label>`).join("")}</div></div>
    <div class="grid2">
      <div class="fld"><label for="prof-fuss">Starker Fuß</label><select id="prof-fuss"><option value="">–</option>${opt(Object.keys(FUSS), p.fuss, Object.values(FUSS))}</select></div>
      <div class="fld"><label for="prof-wunsch">Wunschposition</label><select id="prof-wunsch"><option value="">–</option>${opt((LZ.C.team.positions || []).map(x => x.id), p.wunsch, (LZ.C.team.positions || []).map(x => `${x.id} · ${x.name}`))}</select></div>
    </div>
    <div class="fld"><label for="prof-vorbild">Mein Vorbild</label><input id="prof-vorbild" maxlength="60" placeholder="z. B. ein Spieler, den du gern schaust" value="${esc(p.vorbild || "")}"></div>
    <div class="fld"><label for="prof-ziel">Mein Ziel für die Saison</label><textarea id="prof-ziel" rows="3" maxlength="200" placeholder="z. B. Ich will mit links genauso sicher passen wie mit rechts.">${esc(p.ziel || "")}</textarea></div>
    <div class="grid2">
      <div class="fld"><label for="prof-trikot">Trikotgröße</label><select id="prof-trikot"><option value="">–</option>${opt(TRIKOT, p.trikot)}</select></div>
      <div class="fld"><label for="prof-schuh">Schuhgröße</label><select id="prof-schuh"><option value="">–</option>${opt(Array.from({ length: 23 }, (_, i) => i + 28), p.schuh)}</select></div>
    </div>
    ${K.msg ? `<p class="err" role="alert" style="text-align:left">${esc(K.msg)}</p>` : ""}
    <button class="btn wide" data-act="profSave" ${K.busy ? "disabled" : ""}>Speichern</button>`;
  };

  LZ.actions.profEdit = () => {
    const src = K.data && K.data.profile;
    const p = src && typeof src === "object" && !Array.isArray(src) ? JSON.parse(JSON.stringify(src)) : {};
    if (!p.schule || Array.isArray(p.schule)) p.schule = {};
    K.P = p; K.msg = ""; LZ.go("profile");
  };
  LZ.actions.profSave = async () => {
    if (K.busy) return;
    K.busy = true; K.msg = ""; LZ.render();
    const r = await LZ.Store.send("profile.php", { profile: K.P });
    K.busy = false;
    if (!r.ok) { K.msg = r.error || "Speichern hat nicht geklappt."; LZ.render(); return; }
    K.data.profile = r.profile; LZ.go("me");
  };

  /* ---------- Barometer ---------- */
  LZ.actions.mset = b => {
    const key = `${b.dataset.t}-${b.dataset.p}`;
    K.M[key] = K.M[key] || {}; K.M[key][b.dataset.k] = +b.dataset.v; K.edit[key + "-err"] = "";
    LZ.render();
  };
  LZ.actions.medit = b => { const key = `${b.dataset.t}-${b.dataset.p}`; K.edit[key] = true; LZ.render(); };
  LZ.actions.msend = async b => {
    if (K.busy) return;
    const tid = +b.dataset.t, phase = b.dataset.p, key = `${tid}-${phase}`;
    K.busy = true; LZ.render();
    const r = await LZ.Store.send("mood.php", { training: tid, phase, data: K.M[key] || {} });
    K.busy = false;
    if (!r.ok) { K.edit[key + "-err"] = r.error || "Senden hat nicht geklappt."; LZ.render(); return; }
    const t = K.data.today.find(x => x.id === tid); if (t) t[phase] = r.data;
    K.edit[key] = false; delete K.M[key]; LZ.render();
  };

  LZ.inputs.push(e => {
    const id = e.target.id || "";
    if (id.startsWith("prof-") && K.P) {
      const k = id.slice(5);
      if (k.startsWith("schule-")) K.P.schule[k.slice(7)] = e.target.value;
      else K.P[k] = ["geb_tag", "geb_monat", "schuh"].includes(k) ? (e.target.value ? +e.target.value : null) : e.target.value;
    }
    if (id.startsWith("mk-")) { const key = id.slice(3); K.M[key] = K.M[key] || {}; K.M[key].kommentar = e.target.value; }
    if (id.startsWith("mnf-") && e.type === "change") { const key = id.slice(4) + "-vor"; K.M[key] = K.M[key] || {}; K.M[key].nichtfit = e.target.checked; }
  });
})();
