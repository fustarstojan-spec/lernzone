/*
 * Lernzone – Termine aus dem Google-Kalender (nur Weg B / PHP)
 * Startseite: „Nächster Termin“ mit Countdown + die nächsten Termine; Ansicht „termine“: alle Termine der nächsten 60 Tage
 * Daten: api/calendar.php (der Server liest den Kalender höchstens alle 15 Minuten neu)
 */
(function () {
  const LZ = window.LZ, esc = LZ.esc;
  const K = { data: null, all: null, at: 0, loading: false };

  const kinds = () => Object.fromEntries(((LZ.C.team.calendar || {}).types || []).map(t => [t.kind, t.label]));
  const kindLabel = k => kinds()[k] || (k === "training" ? "Training" : "Termin");
  const chip = k => `<span class="kchip k-${esc(k)}">${esc(kindLabel(k))}</span>`;
  const todayIso = () => new Date().toLocaleDateString("sv-SE");
  const dayDiff = iso => Math.round((new Date(iso + "T12:00:00") - new Date(todayIso() + "T12:00:00")) / 864e5);
  const dayName = iso => { const n = dayDiff(iso); return n === 0 ? "Heute" : n === 1 ? "Morgen" : new Date(iso + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }); };
  const timeText = e => e.time ? `${e.time}${e.endTime ? "–" + e.endTime : ""} Uhr` : "ganztägig";
  function countdown(e) {
    if (!e.time) return "";
    const ms = new Date(`${e.date}T${e.time}:00`) - new Date();
    if (ms <= 0) return "läuft gerade";
    const min = Math.round(ms / 6e4), h = Math.floor(min / 60), d = Math.floor(h / 24);
    if (d >= 2) return `in ${d} Tagen`;
    if (h >= 1) return `in ${h} Std.${h < 10 && min % 60 ? " " + (min % 60) + " Min." : ""}`;
    return `in ${min} Min.`;
  }
  const mapLink = loc => loc ? `<a class="maplink" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}" target="_blank" rel="noopener">${esc(loc)}</a>` : "";

  async function load(force) {
    const St = LZ.Store;
    if (!St || St.mode !== "api" || St.gate() || K.loading) return;
    if (!force && K.data && Date.now() - K.at < 60000) return;
    K.loading = true;
    const r = await St.get("calendar.php");
    K.loading = false;
    if (r && r.ok) { K.data = r; K.at = Date.now(); if (["home", "termine", "me"].includes(LZ.S.view)) LZ.render(); }
  }
  LZ.on("ready", () => load());
  LZ.on("enter", v => { if (v === "home" || v === "me") load(); });
  setInterval(() => { if (["home", "me"].includes(LZ.S.view) && !document.hidden) { K.at = 0; load(); } }, 5 * 60000);

  /* ---------- Startseite ---------- */
  LZ.on("homeTop", () => {
    const St = LZ.Store;
    if (LZ.coachMode()) return "";               // Trainer: Termine stehen auf der Trainer-Startseite
    if (!St || St.mode !== "api" || !K.data || !K.data.status.configured) return "";
    const n = K.data.next, rest = K.data.upcoming.slice(1, 5);
    if (!n) return `<section class="card nextcard"><p class="eyebrow">Nächster Termin</p><p class="small">In den nächsten zwei Wochen steht nichts im Kalender.</p></section>`;
    return `<section class="card nextcard">
      <div class="rowspread"><p class="eyebrow">Nächster Termin</p>${chip(n.kind)}</div>
      <p class="nexttitle">${esc(n.title)}</p>
      <p class="nextwhen"><b>${esc(dayName(n.date))}</b> · ${esc(timeText(n))}${countdown(n) ? ` <span class="count">${esc(countdown(n))}</span>` : ""}</p>
      ${n.location ? `<p class="small">${mapLink(n.location)}</p>` : ""}
      ${rest.length ? `<ul class="evlist">${rest.map(e => `<li><span class="evday">${esc(dayName(e.date))}</span><span class="evtime">${esc(e.time || "ganzt.")}</span><span class="evtitle">${esc(e.title)}</span>${chip(e.kind)}</li>`).join("")}</ul>` : ""}
      <button class="linkbtn" data-act="calAll">Alle Termine</button></section>`;
  });

  /* ---------- Mein Bereich: Nächster Termin + Wochenübersicht ---------- */
  K.week = 0; // 0 = diese Woche, 1 = nächste Woche
  const isoAdd = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
  const mondayOf = iso => { const d = new Date(iso + "T12:00:00"); return isoAdd(iso, -((d.getDay() + 6) % 7)); };
  LZ.actions.calWeek = el => { K.week = +el.dataset.w || 0; LZ.render(); };
  LZ.on("meTop", () => {
    const St = LZ.Store;
    if (!St || St.mode !== "api" || !K.data || !K.data.status.configured) return "";
    const n = K.data.next, t = todayIso(), mon = isoAdd(mondayOf(t), 7 * K.week);
    const f = x => new Date(x + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    const days = [...Array(7)].map((_, i) => isoAdd(mon, i));
    const rows = days.map(d => {
      const ev = K.data.upcoming.filter(e => e.date === d), past = d < t;
      const wd = new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short" });
      return `<li class="wkday${d === t ? " today" : ""}${past ? " past" : ""}"><span class="wkd"><b>${esc(wd)}</b><span>${esc(f(d))}</span></span>
        <span class="wkev">${past ? `<span class="small">–</span>` : ev.length ? ev.map(e => `<span class="wkitem">${chip(e.kind)}<span class="evtime">${esc(e.time || "ganzt.")}</span><span class="evtitle">${esc(e.title)}</span></span>`).join("") : `<span class="small">frei</span>`}</span></li>`;
    }).join("");
    return `<section class="card nextcard">
      ${n ? `<div class="rowspread"><p class="eyebrow">Nächster Termin</p>${chip(n.kind)}</div>
      <p class="nexttitle">${esc(n.title)}</p>
      <p class="nextwhen"><b>${esc(dayName(n.date))}</b> · ${esc(timeText(n))}${countdown(n) ? ` <span class="count">${esc(countdown(n))}</span>` : ""}</p>
      ${n.location ? `<p class="small">${mapLink(n.location)}</p>` : ""}` : `<p class="eyebrow">Nächster Termin</p><p class="small">In den nächsten zwei Wochen steht nichts im Kalender.</p>`}
      <div class="rowspread wkhead"><h3>Woche ${esc(f(days[0]))} – ${esc(f(days[6]))}</h3>
        <span class="seg wkseg"><button aria-pressed="${K.week === 0}" data-act="calWeek" data-w="0">Diese</button><button aria-pressed="${K.week === 1}" data-act="calWeek" data-w="1">Nächste</button></span></div>
      <ul class="wklist">${rows}</ul>
      <button class="linkbtn" data-act="calAll">Alle Termine</button></section>`;
  });
  LZ.hooks.meTop.unshift(LZ.hooks.meTop.pop()); // ganz oben in Mein Bereich

  /* ---------- Alle Termine ---------- */
  LZ.actions.calAll = async () => {
    K.all = null; LZ.go("termine");
    const r = await LZ.Store.get("calendar.php?days=60");
    if (r && r.ok) { K.all = r.upcoming; LZ.render(); }
  };
  LZ.views.termine = () => {
    const list = K.all;
    const weeks = {};
    (list || []).forEach(e => {
      const d = new Date(e.date + "T12:00:00"), mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = mon.toLocaleDateString("sv-SE");
      (weeks[key] = weeks[key] || []).push(e);
    });
    const wkLabel = k => { const a = new Date(k + "T12:00:00"), b = new Date(a); b.setDate(a.getDate() + 6);
      const f = x => x.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); return `Woche ${f(a)} – ${f(b)}`; };
    return `<button class="back" data-act="home">‹ Übersicht</button>
      <section><p class="eyebrow">Kalender</p><h1>Termine</h1><p class="lede">Die nächsten 60 Tage aus dem Mannschaftskalender.</p></section>
      ${list === null ? `<p class="small">Lade …</p>` : !list.length ? `<p class="small">Keine Termine.</p>` :
        Object.keys(weeks).map(k => `<section class="stack"><h3>${esc(wkLabel(k))}</h3>
          ${weeks[k].map(e => `<div class="evrow"><div class="evdate"><b>${esc(dayName(e.date))}</b><span>${esc(e.time || "ganzt.")}</span></div>
            <div class="evbody"><div class="rowspread"><span class="evtitle">${esc(e.title)}</span>${chip(e.kind)}</div>
            <span class="small">${esc(timeText(e))}${e.location ? " · " : ""}${mapLink(e.location)}</span></div></div>`).join("")}</section>`).join("")}`;
  };

  LZ.calendar = { chip, kindLabel, dayName, timeText, reload: () => load(true) };
})();
