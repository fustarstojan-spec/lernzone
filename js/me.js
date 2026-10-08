/*
 * Lernzone – Spieler-Funktionen mit Server (nur Weg B / PHP)
 * Mein Bereich: Trainingsbeteiligung, Befindens-Barometer vor/nach dem Training, eigenes Profil
 * Daten: api/my.php (lesen), api/mood.php und api/profile.php (speichern)
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const K = { data: null, forNr: null, err: "", edit: {}, M: {}, P: null, msg: "", busy: false };

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
    const r = await LZ.Store.get("my.php");
    if (r.ok) { K.data = r; K.forNr = nr; K.err = ""; } else K.err = r.error || "Konnte deine Daten nicht laden.";
    if (LZ.S.view === "me") LZ.render();
  }
  LZ.on("enter", v => { if (v === "me") load(); });
  LZ.on("ready", () => { if (LZ.S.view === "me") load(); });

  /* ---------- Bausteine für Mein Bereich ---------- */
  function attendanceCard(a) {
    if (!a.total) return `<section class="card stack"><h2>Trainingsbeteiligung</h2><p class="small">Noch keine Trainings eingetragen.</p></section>`;
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
    return d.today.map(t => `<section class="card stack"><div class="rowspread"><h2>Wie geht's dir?</h2><span class="small">${isToday(t.date) ? "Training heute" : "Training gestern"}${t.time ? " · " + esc(t.time) : ""}</span></div>
      ${t.note ? `<p class="small">${esc(t.note)}</p>` : ""}
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
    return attendanceCard(K.data.attendance) + moodCard(K.data) + profileCard(K.data);
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
