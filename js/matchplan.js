/*
 * Lernzone – Matchplan (ab 0.32.0): berechnet aus Soll-Minuten und Position je Spieler, wann gewechselt wird.
 * Rein rechnerisch, ohne Oberfläche (die steht in js/spielzeiten.js); läuft auch in Node (Tests).
 *
 * plan({ duration, periods, grid, slots:[lab], players:[{nr, pos, target, starter}] })
 *   → { blocks:[{from, to, brk}], subs:[{minute, out, in, pos, brk}], starters:[nr], minutes:{nr}, groups:[{pos, slots, need, planned, players}], warnings:[text] }
 *
 * Vorgehen je Position (z. B. beide IV zusammen): Spielzeit in Abschnitte (Halbzeiten) und darin in Wechselfenster
 * (Raster, z. B. alle 10 Min.) teilen; dann für jedes Fenster festlegen, wer auf den Plätzen dieser Position steht.
 * Gesucht wird die Belegung mit möglichst kleiner Abweichung von den Soll-Minuten und möglichst wenigen Wechseln;
 * Wechsel in der Pause kosten fast nichts, Wechsel während des Spiels mehr. Startelf-Spieler beginnen, wenn es passt.
 */
(function (root) {
  const COST_SUB = 6, COST_SUB_BREAK = 1, BEAM = 4000;

  function blocksOf(duration, periods, grid) {
    const out = [];
    for (let k = 0; k < periods; k++) {
      const a = Math.round(duration * k / periods), b = Math.round(duration * (k + 1) / periods);
      for (let t = a; t < b; t += grid) out.push({ from: t, to: Math.min(b, t + grid), brk: t === a && k > 0 });
    }
    // sehr kurzes letztes Stück an das vorige anhängen (z. B. 35 Min. bei Raster 10 → 10/10/15 statt 10/10/10/5)
    for (let i = out.length - 1; i > 0; i--) {
      const x = out[i], prev = out[i - 1];
      if (!x.brk && x.to - x.from <= grid / 2 && prev.to === x.from) { prev.to = x.to; out.splice(i, 1); }
    }
    return out;
  }

  function combos(arr, k) {
    const res = [];
    (function rec(start, cur) {
      if (cur.length === k) { res.push(cur.slice()); return; }
      for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    return res;
  }

  /* Eine Position: c Plätze, Spieler ps = [{nr, target, starter}] → Belegung pro Fenster */
  function planGroup(ps, c, blocks) {
    const n = ps.length, sets = combos([...Array(n).keys()], c);
    const total = blocks.reduce((s, b) => s + (b.to - b.from), 0);
    const startIdx = ps.map((p, i) => p.starter ? i : -1).filter(i => i >= 0);
    let first = sets;
    if (startIdx.length === c) first = sets.filter(s => s.every(i => startIdx.includes(i)));
    else if (startIdx.length > 0 && startIdx.length < c) first = sets.filter(s => startIdx.every(i => s.includes(i)));
    else if (startIdx.length > c) first = sets.filter(s => s.every(i => startIdx.includes(i)));
    if (!first.length) first = sets;
    // Zustand: belegte Plätze + bisher gespielte Minuten; Kosten: Wechsel; Schätzung: unvermeidbare Abweichung
    const h = (played, rest) => {
      let over = 0, under = 0;
      played.forEach((m, i) => { const d = m - ps[i].target; if (d > 0) over += d; else under -= d; });
      return over + Math.max(0, under - c * rest);
    };
    let states = new Map();
    let rest = total;
    blocks.forEach((b, bi) => {
      const len = b.to - b.from; rest -= len;
      const next = new Map();
      const add = (set, played, cost, back) => {
        const key = set.join(",") + "|" + played.join(",");
        const f = cost + h(played, rest);
        const old = next.get(key);
        if (!old || old.cost > cost) next.set(key, { set, played, cost, f, back });
      };
      if (bi === 0) first.forEach(s => { const pl = ps.map((p, i) => s.includes(i) ? len : 0); add(s, pl, 0, null); });
      else states.forEach(st => sets.forEach(s => {
        const swaps = s.filter(i => !st.set.includes(i)).length;
        const pl = st.played.map((m, i) => s.includes(i) ? m + len : m);
        add(s, pl, st.cost + swaps * (b.brk ? COST_SUB_BREAK : COST_SUB), st);
      }));
      states = next;
      if (states.size > BEAM) states = new Map([...states.entries()].sort((a, b) => a[1].f - b[1].f).slice(0, BEAM));
    });
    let best = null;
    states.forEach(st => { const cost = st.cost + st.played.reduce((s, m, i) => s + Math.abs(m - ps[i].target), 0); if (!best || cost < best.total) best = { st, total: cost }; });
    const seq = []; for (let s = best.st; s; s = s.back) seq.unshift(s.set.map(i => ps[i].nr));
    return { seq, played: Object.fromEntries(ps.map((p, i) => [p.nr, best.st.played[i]])) };
  }

  function plan(o) {
    const duration = Math.max(1, o.duration | 0), periods = Math.max(1, o.periods | 0), grid = Math.max(1, o.grid | 0);
    const blocks = blocksOf(duration, periods, grid), warnings = [];
    const labs = [...new Set(o.slots)];
    const players = o.players.filter(p => p.pos);
    o.players.filter(p => !p.pos).forEach(p => warnings.push(`Nr. ${p.nr} hat keine Position und wird nicht eingeplant.`));
    players.filter(p => !labs.includes(p.pos)).forEach(p => warnings.push(`Nr. ${p.nr}: Position ${p.pos} gibt es in der Grundordnung nicht.`));
    const groups = [], seqBy = {}, minutes = {};
    for (const lab of labs) {
      const c = o.slots.filter(x => x === lab).length;
      const ps = players.filter(p => p.pos === lab).map(p => ({ nr: p.nr, target: Math.max(0, Math.min(duration, p.target | 0)), starter: !!p.starter }));
      const need = c * duration, planned = ps.reduce((s, p) => s + p.target, 0);
      const g = { pos: lab, slots: c, need, planned, players: ps.map(p => p.nr) };
      groups.push(g);
      if (ps.length < c) { warnings.push(`${lab}: ${c} ${c === 1 ? "Platz" : "Plätze"}, aber nur ${ps.length} Spieler – bitte Positionen anpassen.`); continue; }
      if (planned !== need) warnings.push(`${lab}: ${need} Min. zu vergeben, geplant sind ${planned} Min. – die Minuten werden so gut wie möglich verteilt.`);
      const r = planGroup(ps, c, blocks);
      seqBy[lab] = r.seq; Object.assign(minutes, r.played);
    }
    // Wechsel zusammenführen: pro Fenstergrenze und Position raus/rein paaren
    const subs = [], starters = [];
    Object.values(seqBy).forEach(seq => starters.push(...seq[0]));
    blocks.forEach((b, i) => {
      if (!i) return;
      Object.entries(seqBy).forEach(([lab, seq]) => {
        const out = seq[i - 1].filter(n => !seq[i].includes(n)), inn = seq[i].filter(n => !seq[i - 1].includes(n));
        out.forEach((n, k) => subs.push({ minute: b.from, out: n, in: inn[k], pos: lab, brk: b.brk }));
      });
    });
    players.forEach(p => { if (!(p.nr in minutes)) minutes[p.nr] = 0; });
    return { blocks, subs, starters: starters.sort((a, b) => a - b), minutes, groups, warnings };
  }

  /* Vorschlag: Minuten je Position gleich auf die Spieler dieser Position verteilen (auf das Raster gerundet) */
  function evenTargets(o) {
    const out = {};
    [...new Set(o.slots)].forEach(lab => {
      const c = o.slots.filter(x => x === lab).length, ps = o.players.filter(p => p.pos === lab);
      if (!ps.length) return;
      const each = c * o.duration / ps.length;
      let left = c * o.duration;
      ps.forEach((p, i) => { const v = i === ps.length - 1 ? left : Math.min(o.duration, Math.round(each / 5) * 5); out[p.nr] = Math.min(o.duration, v); left -= out[p.nr]; });
    });
    return out;
  }

  const api = { plan, evenTargets, blocksOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LZMatchplan = api;
})(typeof window !== "undefined" ? window : globalThis);
