/*
 * Lernzone – Datenzugriff
 *
 * Die App spricht NUR mit diesem Objekt. Beide Varianten haben dieselben Methoden:
 *   init()                 → { user }       Sitzung wiederherstellen
 *   loadContent()          → { team, zones, phases, modules, plans, players }
 *   login(nr, pin)         → { ok, user, error }        (nur Weg A; Weg B: signIn, siehe unten)
 *   logout()
 *   getProgress()          → { quiz:{}, tasks:{} }   (synchron, aus dem Zwischenspeicher)
 *   saveProgress(progress) → speichert im Hintergrund
 *   canManage              → true, wenn Spieler angelegt werden können (nur Weg B / PHP)
 *   coach                  → { active, id, name, isAdmin, hasCoaches, canSetup }   Trainer-Status
 *   get(path) / send(file, body)  → direkter Zugriff auf weitere Schnittstellen (nur Weg B)
 *
 * user = { nr, pos, plan, posOff, posDef }   (posOff/posDef = Positionskürzel aus data/team.json)
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
  async function loadStatic(names = ["team", "zones", "phases", "modules", "plans", "players"]) {
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
      coach: { active: false, hasCoaches: false, canSetup: false },
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

  /* ---------- Weg B: PHP-Schnittstelle mit Anmeldung ---------- *
   * Zusätzlich zu den gemeinsamen Methoden:
   *   gate()                    → "login" | "setpw" | "setup" | null   (welche Anmeldeseite gezeigt werden muss)
   *   account                   → { username } des angemeldeten Kontos
   *   pending                   → { username } nach Einmal-Code, bis das eigene Passwort festgelegt ist
   *   signIn(username, password)          → { ok, state: "ok" | "setpw", user, error }
   *   setPassword(pw, pw2)                → { ok, user, error }
   *   changePassword(old, pw, pw2)        → { ok, error }
   *   setupFirst(name, username, pw, pw2, club, team) → { ok, error }   erster Verein + Mannschaft + Admin-Konto (nur localhost)
   *   refreshPlayers()          → Kader neu laden (nur angemeldet)
   * Jede POST-Anfrage schickt das CSRF-Token aus api/me.php mit.                                   */
  function ApiStore() {
    const api = cfg.apiBase;
    let user = null, progress = emptyProgress(), content = null, csrf = "";

    const postAny = async (file, body) => {
      const r = await fetch(api + file, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body || {}) });
      const d = await r.json();
      if (d && d.csrf) csrf = d.csrf;
      return d;
    };
    const safe = async (file, body) => {
      try { return await postAny(file, body); } catch (e) { return { ok: false, error: "Server nicht erreichbar. Versuch es gleich nochmal." }; }
    };

    const api_ = {
      mode: "api",
      canManage: true,
      coach: { active: false, hasCoaches: false, canSetup: false },
      account: null,
      pending: null,
      get currentUser() { return user; },
      gate() {
        if (user || api_.coach.active) return null;
        if (api_.pending) return "setpw";
        if (!api_.coach.hasCoaches && api_.coach.canSetup) return "setup";
        return "login";
      },
      async loadContent() {
        content = await loadStatic(["team", "zones", "phases", "modules", "plans"]);
        content.players = [];                                    // Kader kommt nach der Anmeldung aus der Datenbank
        return content;
      },
      async refreshPlayers() {
        if (!content || api_.gate()) return;
        const list = await api_.get("players.php");
        if (Array.isArray(list)) content.players.splice(0, content.players.length, ...list);
      },
      async init() {
        const me = await getJSON(api + "me.php");
        csrf = me.csrf || "";
        user = me.user || null;
        api_.coach = me.coach || api_.coach;
        api_.account = me.account || null;
        api_.pending = me.pending || null;
        await api_.refreshPlayers();
        progress = user ? normalize(await getJSON(api + "progress.php")) : emptyProgress();
        return { user };
      },
      async afterLogin(r) {
        user = r.user || null;
        if (r.coach) api_.coach = r.coach;
        api_.account = r.account || null;
        api_.pending = null;
        await api_.refreshPlayers();
        progress = user ? normalize(await getJSON(api + "progress.php")) : emptyProgress();
      },
      async signIn(username, password) {
        const r = await safe("auth.php", { action: "login", username, password });
        if (!r.ok) return r;
        if (r.state === "setpw") { api_.pending = { username: r.username, minLen: r.minLen }; return r; }
        await api_.afterLogin(r);
        return { ok: true, state: "ok", user };
      },
      async setPassword(password, password2) {
        const r = await safe("auth.php", { action: "setpw", password, password2 });
        if (!r.ok) { if (r.status === 401 || /noch einmal an/.test(r.error || "")) api_.pending = null; return r; }
        await api_.afterLogin(r);
        return { ok: true, user };
      },
      async changePassword(old, password, password2) {
        const r = await safe("auth.php", { action: "change", old, password, password2 });
        return r.ok ? { ok: true } : r;
      },
      async setupFirst(name, username, password, password2, club, team) {
        const r = await safe("auth.php", { action: "setup", name, username, password, password2, club, team });
        if (r.ok) await api_.afterLogin(r);
        return r;
      },
      cancelPending() { api_.pending = null; return safe("auth.php", { action: "logout" }); },
      async login() { return { ok: false, error: "Bitte mit Benutzername und Passwort anmelden." }; },
      async logout() {
        await safe("auth.php", { action: "logout" });
        user = null; progress = emptyProgress(); api_.account = null; api_.pending = null;
        api_.coach = Object.assign({}, api_.coach, { active: false, id: null, name: null, isAdmin: false, team: null, teams: [] });
        if (content) content.players.splice(0);
      },
      async coachLogout() { return api_.logout(); },
      getProgress() { return progress; },
      async saveProgress(p) {
        progress = p;
        if (!user) return;            // Trainer ohne Spielerkonto speichern keinen Lernfortschritt
        await safe("progress.php", p);
      },
      async get(path) {
        try { const r = await fetch(api + path, { credentials: "same-origin" }); return await r.json(); }
        catch (e) { return { ok: false, error: "Server nicht erreichbar." }; }
      },
      async send(file, body) {
        const r = await safe(file, body);
        if (r && r.me) api_.coach = r.me;
        return r;
      }
    };
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
