/*
 * Lernzone – Datenzugriff
 *
 * Die App spricht NUR mit diesem Objekt. Beide Varianten haben dieselben Methoden:
 *   init()                 → { user }       Sitzung wiederherstellen
 *   loadContent()          → { team, zones, phases, plans, players }
 *   login(nr, pin)         → { ok, user, error }
 *   logout()
 *   getProgress()          → { quiz:{}, tasks:{} }   (synchron, aus dem Zwischenspeicher)
 *   saveProgress(progress) → speichert im Hintergrund
 *
 * user = { nr, pos, plan }
 * progress = { quiz: { <modulId>: {best, of, last} }, tasks: { "<Jahr>-W<KW>": { <index>: true|false } } }
 */
(function () {
  const cfg = window.LZ_CONFIG;
  const emptyProgress = () => ({ quiz: {}, tasks: {} });
  const obj = v => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};   // PHP liefert leere Objekte manchmal als []
  const normalize = p => {
    const tasks = obj(p && p.tasks);
    for (const k in tasks) tasks[k] = Array.isArray(tasks[k]) ? Object.assign({}, tasks[k]) : obj(tasks[k]);
    return { quiz: obj(p && p.quiz), tasks };
  };

  async function getJSON(url, opts) {
    const r = await fetch(url, Object.assign({ credentials: "same-origin" }, opts));
    if (!r.ok) throw new Error(url + " → HTTP " + r.status);
    return r.json();
  }
  async function loadStatic() {
    const names = ["team", "zones", "phases", "plans", "players"];
    const parts = await Promise.all(names.map(n => getJSON(cfg.dataBase + n + ".json")));
    return Object.fromEntries(names.map((n, i) => [n, parts[i]]));
  }

  /* ---------- Weg A: alles im Browser ---------- */
  function LocalStore() {
    const ls = {
      get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    };
    let content = null, user = null, progress = emptyProgress();
    const key = () => "lz:p:" + (user ? user.nr : "gast");
    const findUser = nr => content.players.find(p => p.nr === nr) || null;

    return {
      mode: "local",
      async loadContent() { content = await loadStatic(); return content; },
      async init() {
        user = findUser(ls.get("lz:session", null));
        progress = normalize(ls.get(key(), null));
        return { user };
      },
      async login(nr, pin) {
        const pins = await getJSON(cfg.dataBase + "demo-pins.json");
        if (pins[nr] !== pin) return { ok: false, error: "PIN stimmt nicht. Frag deinen Trainer, wenn du sie vergessen hast." };
        user = findUser(nr);
        ls.set("lz:session", nr);
        progress = normalize(ls.get(key(), null));
        return { ok: true, user };
      },
      async logout() { user = null; ls.set("lz:session", null); progress = normalize(ls.get(key(), null)); },
      getProgress() { return progress; },
      async saveProgress(p) { progress = p; ls.set(key(), p); }
    };
  }

  /* ---------- Weg B: PHP-Schnittstelle ---------- */
  function ApiStore() {
    const api = cfg.apiBase;
    let user = null, progress = emptyProgress();
    const post = (file, body) => getJSON(api + file, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {})
    });

    return {
      mode: "api",
      async loadContent() { return loadStatic(); },
      async init() {
        const me = await getJSON(api + "me.php");
        user = me.user || null;
        progress = user ? normalize(await getJSON(api + "progress.php")) : emptyProgress();
        return { user };
      },
      async login(nr, pin) {
        try {
          const r = await post("login.php", { nr, pin });
          if (!r.ok) return { ok: false, error: r.error || "Anmeldung fehlgeschlagen." };
          user = r.user;
          progress = normalize(await getJSON(api + "progress.php"));
          return { ok: true, user };
        } catch (e) {
          return { ok: false, error: "Server nicht erreichbar. Versuch es gleich nochmal." };
        }
      },
      async logout() { try { await post("logout.php"); } catch (e) {} user = null; progress = emptyProgress(); },
      getProgress() { return progress; },
      async saveProgress(p) {
        progress = p;
        if (!user) return;            // Gäste speichern nichts auf dem Server
        try { await post("progress.php", p); } catch (e) { console.warn("Fortschritt nicht gespeichert", e); }
      }
    };
  }

  window.LZStore = cfg.mode === "api" ? ApiStore() : LocalStore();
})();
