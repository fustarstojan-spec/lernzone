/*
 * Lernzone – Konfiguration
 *
 * mode: "auto"  → (Standard) Erkennt selbst, ob PHP läuft: ja → "api", nein → "local".
 * mode: "local" → Weg A. Login per PIN aus data/demo-pins.json,
 *                 Fortschritt nur im Browser (localStorage).
 * mode: "api"   → Weg B. Login und Fortschritt über die PHP-Schnittstelle in /api.
 *                 data/demo-pins.json wird dann NICHT mehr hochgeladen.
 */
window.LZ_CONFIG = {
  mode: "auto",
  apiBase: "api/",
  dataBase: "data/"
};
