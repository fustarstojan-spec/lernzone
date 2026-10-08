/*
 * Lernzone – Spielfeld-Grafik (SVG, Maße in Metern: 68 × 105, Angriff nach oben)
 * LZPitch.setup(zones, team, gkNrs) einmal aufrufen, dann LZPitch.field({...}).
 */
(function () {
  let LX, TY, GK = [], GKC = "#2E78FF";
  let n = 0;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function setup(zones, team, gkNrs) {
    LX = zones.laneX; TY = zones.thirdY;
    GK = gkNrs || team.goalkeepers || []; GKC = team.colors.goalkeeper;
  }

  /* o: { own:[[pos,x,y]], me:[pos], opp:[[x,y]], ball:[x,y], arrows:[{f,t,k:"pass"|"run"}],
          hl:[{l,t,c}], tap:bool, zones:bool, label,
          board: { items:[{id, t:"own"|"opp"|"ball", x, y, lab, nr, me, sel}], lines:[{id, k:"pass"|"run"|"line", f:[x,y], t:[x,y]}] }  (Taktiktafel, ab 0.14.0) } */
  function field(o = {}) {
    const id = "f" + (++n);
    const vb = o.view ? o.view.join(" ") : "-3 -5 74 115";        // o.view = [x, y, Breite, Höhe] – Ausschnitt
    let s = `<svg class="pitch" viewBox="${vb}" role="img" aria-label="${esc(o.label || "Spielfeld")}">
  <defs><marker id="${id}p" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 10 5 0 10z" class="ah"/></marker>
  <marker id="${id}r" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 10 5 0 10z" class="ahr"/></marker></defs>
  <rect x="-3" y="-5" width="74" height="115" class="out"/>`;
    for (let i = 0; i < 7; i++) s += `<rect x="0" y="${i * 15}" width="68" height="15" class="${i % 2 ? "g2" : "g1"}"/>`;
    (o.hl || []).forEach(h => { s += `<rect x="${LX[h.l]}" y="${TY[h.t]}" width="${(LX[h.l + 1] - LX[h.l]).toFixed(2)}" height="35" class="zhl ${h.c || ""}"/>`; });
    if (o.zones !== false) {
      LX.slice(1, 5).forEach(x => s += `<line x1="${x}" y1="0" x2="${x}" y2="105" class="lane"/>`);
      [TY[1], TY[2]].forEach(y => s += `<line x1="0" y1="${y}" x2="68" y2="${y}" class="third"/>`);
    }
    s += `<g class="mk"><rect x="0" y="0" width="68" height="105"/><line x1="0" y1="52.5" x2="68" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/><circle cx="34" cy="52.5" r=".45" class="dot"/>
  <rect x="13.84" y="0" width="40.32" height="16.5"/><rect x="24.84" y="0" width="18.32" height="5.5"/><circle cx="34" cy="11" r=".45" class="dot"/><path d="M26.69 16.5A9.15 9.15 0 0 0 41.31 16.5"/>
  <rect x="13.84" y="88.5" width="40.32" height="16.5"/><rect x="24.84" y="99.5" width="18.32" height="5.5"/><circle cx="34" cy="94" r=".45" class="dot"/><path d="M26.69 88.5A9.15 9.15 0 0 1 41.31 88.5"/>
  <rect x="30.34" y="-1.6" width="7.32" height="1.6" class="goal"/><rect x="30.34" y="105" width="7.32" height="1.6" class="goal"/></g>
  <text x="34" y="-3.4" class="dir">▲ Angriffsrichtung</text>`;
    (o.arrows || []).forEach(a => {
      const [x1, y1] = a.f, [x2, y2] = a.t, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, sh = a.k === "pass" ? 1.2 : 0.4;
      const ex = x2 - dx / L * sh, ey = y2 - dy / L * sh, sx = x1 + dx / L * 2.8, sy = y1 + dy / L * 2.8;
      s += `<line x1="${sx.toFixed(2)}" y1="${sy.toFixed(2)}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}" class="${a.k}" marker-end="url(#${id}${a.k === "pass" ? "p" : "r"})"/>`;
    });
    (o.opp || []).forEach(([x, y]) => s += `<g class="opp"><circle cx="${x}" cy="${y}" r="2.4"/></g>`);
    // own: [Positionskürzel, x, y]; TW blau; o.me = Kürzel des angemeldeten Spielers → gelber Ring
    const me = o.me || [];
    (o.own || []).forEach(([lab, x, y]) => {
      const gk = lab === "TW" || GK.includes(lab);
      s += `<g class="own${me.includes(lab) ? " me" : ""}"><circle cx="${x}" cy="${y}" r="2.6"${gk ? ` style="fill:${GKC}"` : ""}/><text x="${x}" y="${y + .15}"${String(lab).length > 1 ? ' style="font-size:2.3px"' : ""}>${esc(lab)}</text></g>`;
    });
    if (o.ball) s += `<circle cx="${o.ball[0]}" cy="${o.ball[1]}" r="1.1" class="ballc"/>`;
    if (o.board) s += board(o.board, id);
    if (o.tap) for (let t = 0; t < 3; t++) for (let l = 0; l < 5; l++)
      s += `<rect x="${LX[l]}" y="${TY[t]}" width="${(LX[l + 1] - LX[l]).toFixed(2)}" height="35" class="ztap" data-act="zone" data-l="${l}" data-t="${t}"><title>Zone antippen</title></rect>`;
    return s + "</svg>";
  }

  /* Taktiktafel: Linien und verschiebbare Figuren (Gruppen mit data-tok / data-line, Position per transform) */
  function board(b, id) {
    let s = `<g class="blines">`;
    (b.lines || []).forEach(l => {
      const [x1, y1] = l.f, [x2, y2] = l.t, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, sh = l.k === "line" ? 0 : l.k === "pass" ? 1.2 : 0.4;
      const ex = x2 - dx / L * sh, ey = y2 - dy / L * sh;
      const mk = l.k === "line" ? "" : ` marker-end="url(#${id}${l.k === "pass" ? "p" : "r"})"`;
      s += `<g data-line="${esc(l.id)}"><line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" class="hit"/>
        <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${ex.toFixed(2)}" y2="${ey.toFixed(2)}" class="${l.k}"${mk}/></g>`;
    });
    s += `</g><g class="btoks">`;
    (b.items || []).forEach(it => {
      const tr = `transform="translate(${(+it.x).toFixed(2)} ${(+it.y).toFixed(2)})"`;
      if (it.t === "ball") { s += `<g class="tok bball" data-tok="${esc(it.id)}" ${tr}><circle r="2.2" class="hit"/><circle r="1.2" class="ballc"/></g>`; return; }
      const gk = it.t === "own" && (it.lab === "TW" || (it.nr && GK.includes(it.nr)));
      const main = it.nr ? String(it.nr) : (it.lab || "");
      s += `<g class="tok ${it.t}${it.me ? " me" : ""}${it.sel ? " sel" : ""}${it.ghost ? " ghost" : ""}" data-tok="${esc(it.id)}" ${tr}>
        <circle r="3.4" class="hit"/><circle r="2.6"${gk ? ` style="fill:${GKC}"` : ""}/>
        <text y=".15"${main.length > 1 ? ' style="font-size:2.3px"' : ""}>${esc(main)}</text>
        ${it.nr && it.lab ? `<text y="4.6" class="sub">${esc(it.lab)}</text>` : ""}</g>`;
    });
    return s + `</g>`;
  }

  window.LZPitch = { setup, field };
})();
