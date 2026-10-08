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
 *   canManage              → true, wenn Spieler angelegt werden können (nur Weg B / PHP)
 *   coach                  → { active, hasPin, canSetup }   Trainer-Status
 *   coachLogin(pin) / coachSetup(pin) / coachLogout()     → { ok, error }
 *   addPlayer({nr, type, pin})                             → { ok, player, error }
 *   setPin(nr, pin)                                        → { ok, error }
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
  async function loadStatic(names = ["team", "zones", "phases", "plans", "players"]) {
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
      canManage: false,
      coach: { active: false, hasPin: false, canSetup: false },
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
    // wie post, liefert aber auch bei Fehlerstatus (400/401/403/409) die JSON-Antwort mit Fehlermeldung
    const postAny = async (file, body) => {
      const r = await fetch(api + file, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
      return r.json();
    };

    const api_ = {
      mode: "api",
      canManage: true,
      coach: { active: false, hasPin: false, canSetup: false },
      async loadContent() {
        const c = await loadStatic(["team", "zones", "phases", "plans"]);
        c.players = await getJSON(api + "players.php");      // Kader aus der Datenbank
        return c;
      },
      async init() {
        const me = await getJSON(api + "me.php");
        user = me.user || null;
        if (me.coach) api_.coach = me.coach;
        progress = user ? normalize(await getJSON(api + "progress.php")) : emptyProgress();
        return { user };
      },
      async login(nr, pin) {
        try {
          const r = await postAny("login.php", { nr, pin });
          if (!r.ok) return { ok: false, error: r.error || "Anmeldung fehlgeschlagen." };
          user = r.user;
          progress = normalize(await getJSON(api + "progress.php"));
          return { ok: true, user };
        } catch (e) {
          return { ok: false, error: "Server nicht erreichbar. Versuch es gleich nochmal." };
        }
      },
      async logout() { try { await post("logout.php"); } catch (e) {} user = null; progress = emptyProgress(); api_.coach.active = false; },
      getProgress() { return progress; },
      async saveProgress(p) {
        progress = p;
        if (!user) return;            // Gäste speichern nichts auf dem Server
        try { await post("progress.php", p); } catch (e) { console.warn("Fortschritt nicht gespeichert", e); }
      },
      async coachLogin(pin)  { return coachCall({ action: "login", pin }); },
      async coachSetup(pin)  { return coachCall({ action: "setup", pin }); },
      async coachLogout()    { return coachCall({ action: "logout" }); },
      async addPlayer(data) {
        try { return await postAny("players.php", data); }
        catch (e) { return { ok: false, error: "Server nicht erreichbar." }; }
      },
      async setPin(nr, pin) {
        try { return await postAny("players.php", { action: "setpin", nr, pin }); }
        catch (e) { return { ok: false, error: "Server nicht erreichbar." }; }
      }
    };
    async function coachCall(body) {
      try {
        const r = await postAny("coach.php", body);
        if (r.coach) api_.coach = r.coach;
        return r;
      } catch (e) { return { ok: false, error: "Server nicht erreichbar." }; }
    }
    return api_;
  }

  /* ---------- Welche Variante? ---------- *
   * mode "auto": Antwortet api/me.php mit JSON, läuft PHP → Weg B. Sonst Weg A.          */
  async function detectMode() {
    if (cfg.mode !== "auto") return cfg.mode;
    try {
      const r = await fetch(cfg.apiBase + "me.php", { credentials: "same-origin" });
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return "local";
      await r.json();
      return "api";
    } catch (e) { return "local"; }
  }

  window.LZStoreReady = detectMode().then(m => m === "api" ? ApiStore() : LocalStore());
})();
