import { scoreForecast } from "./scoring.js";
import { normalizeForecast, unitSnapshot } from "./forecast.js";
import { formatDateTime, formatTime } from "./format.js";
import { daySummary, localDayOffset } from "./windows.js";

const CARD_VERSION = "0.2.0";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tint = points => points == null ? "#94a3b8" : points >= 15 ? "#22a06b" : points >= 8 ? "#9aba57" : points >= 0 ? "#e9b44c" : "#d66b61";
const dayName = value => { try { return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(value)); } catch { return "Unbekannter Tag"; } };
const rangeText = window => window ? `${formatTime(window.hours[0].datetime)}–${formatTime(new Date(Date.parse(window.hours.at(-1).datetime) + 60 * 60000))} Uhr` : "Kein empfehlenswertes Zeitfenster";

class LaufwetterCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.forecast = []; this.error = ""; this.loading = false; this.lastFetch = 0; this.requestId = 0; }
  disconnectedCallback() { this.requestId++; }
  setConfig(config) { if (!config?.entity) throw Error("Bitte eine weather-Entität angeben."); this.config = { title: "Laufwetter", location: "", duration: 60, refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", ...config }; this.render(); }
  set hass(hass) { this._hass = hass; if (!this.config) return; this.render(); const refresh = Math.max(5, Number(this.config.refresh_minutes) || 30) * 60000; if (!this.loading && Date.now() - this.lastFetch >= refresh) this.fetchForecast(); }
  async fetchForecast() {
    if (!this._hass?.callWS || !this.config) return;
    const entity = typeof this.config.entity === "string" ? this.config.entity.trim() : ""; const state = this._hass.states?.[entity];
    if (!/^weather\.[^.]+$/.test(entity)) { this.error = `Ungültige Wetter-Entität: ${entity}`; this.render(); return; }
    if (!state) { this.error = `Die Wetter-Entität ${entity} wurde nicht gefunden oder ist nicht verfügbar.`; this.render(); return; }
    if (["unavailable", "unknown"].includes(state.state)) { this.error = `Die Wetter-Entität ${entity} ist nicht verfügbar.`; this.render(); return; }
    if (this.loading) return;
    this.loading = true; this.lastFetch = Date.now(); const requestId = ++this.requestId;
    try {
      const result = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: entity }, return_response: true });
      if (requestId !== this.requestId) return;
      const raw = (result?.response || result)?.[entity]?.forecast;
      if (!Array.isArray(raw)) throw Error("Keine stündliche Prognose verfügbar.");
      this.rawForecast = raw; this.units = unitSnapshot(this._hass, entity);
      const warning = this.config.warning_entity ? this._hass.states?.[this.config.warning_entity] : null;
      const warningText = warning && !["off", "unknown", "unavailable"].includes(warning.state) ? String(warning.attributes?.friendly_name || warning.state) : "";
      this.forecast = normalizeForecast(raw, this.units).map(hour => ({ ...hour, warning: warningText })); this.error = "";
    } catch (error) { if (requestId === this.requestId) this.error = String(error.message || error); }
    finally { if (requestId === this.requestId) { this.loading = false; this.render(); } }
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    const sun = this._hass?.states?.[this.config.sun_entity]?.attributes || {}; const now = Date.now(); const scored = scoreForecast(this.forecast, { now, sun: { sunrise: sun.next_rising, sunset: sun.next_setting } }); const todayKey = localDayOffset(now), tomorrowKey = localDayOffset(now, 1);
    const today = scored.hours.filter(hour => localDayOffset(hour.datetime) === todayKey && Date.parse(hour.datetime) >= now); const tomorrow = scored.hours.filter(hour => localDayOffset(hour.datetime) === tomorrowKey);
    const todaySummary = daySummary(today, { duration: this.config.duration, now }); const tomorrowSummary = daySummary(tomorrow, { duration: this.config.duration, includePast: true }); const first = todaySummary.window?.hours[0] || today[0];
    const metrics = hour => hour ? `${hour.temperature != null ? Math.round(hour.temperature) + " °C" : "–"} · ${hour.wind_speed != null ? Math.round(hour.wind_speed) + " km/h" : "–"}${hour.wind_gust_speed != null ? " / " + Math.round(hour.wind_gust_speed) + " Böen" : ""} · ${hour.precipitation != null ? hour.precipitation.toFixed(1) + " mm/h" : "–"}${hour.precipitation_probability != null ? " / " + Math.round(hour.precipitation_probability) + "%" : ""}` : "Keine Daten";
    const chart = today.map(hour => `<div class="bar" title="${esc(formatDateTime(hour.datetime))}: ${hour.points} · ${esc(hour.risks?.join(", ") || "Laufen möglich")}" style="height:${Math.max(8, Math.min(100, 36 + hour.points * 3))}%;background:${tint(hour.points)}"></div>`).join("");
    const debug = this.config.debug ? `<details><summary>Debug</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, units: this.units, raw: this.rawForecast?.slice(0, 3), normalized: this.forecast.slice(0, 3), error: this.error }, null, 2))}</pre></details>` : "";
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{display:block;padding:18px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,12px);font-family:var(--primary-font-family,sans-serif)}h2{margin:4px 0 10px;font-size:24px}.head,.window,.metrics,.tomorrow{display:flex;justify-content:space-between;gap:12px;align-items:center}.small{font-size:12px;color:var(--secondary-text-color)}.window{border-top:1px solid var(--divider-color);border-bottom:1px solid var(--divider-color);padding:12px 0}.window strong{display:block;font-size:18px}.metrics{margin:14px 0;text-align:center}.metrics>div{flex:1}.metrics strong{display:block}.chart{height:100px;display:flex;align-items:end;gap:3px;margin:12px 0 4px}.bar{min-width:4px;flex:1;border-radius:3px 3px 0 0}.axis{display:flex;justify-content:space-between}.tomorrow{border-top:1px solid var(--divider-color);margin-top:16px;padding-top:14px}.tomorrow strong{display:block}.error{color:var(--error-color);margin-top:12px;font-size:13px}details{margin-top:12px}pre{max-height:240px;overflow:auto;font-size:11px;white-space:pre-wrap}@media(max-width:420px){.metrics{font-size:12px;gap:4px}.window{align-items:flex-start;flex-direction:column}}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div><h2>Heute</h2><div class="small">${today.length ? esc(dayName(today[0].datetime)) : "Noch keine heutigen Prognosestunden"}</div><div class="window"><div><span class="small">Beste Laufzeit</span><strong>${esc(rangeText(todaySummary.window))}</strong></div><strong>${todaySummary.label}</strong></div><div class="metrics"><div><strong>${metrics(first)}</strong><span class="small">Temperatur · Wind/Böen · Regen</span></div></div><div class="chart" aria-label="Stündliche Wetterqualität heute">${chart || "<span class='small'>Keine zukünftigen Stunden verfügbar.</span>"}</div><div class="axis small"><span>${today[0] ? formatTime(today[0].datetime) : "–"}</span><span>${today.at(-1) ? formatTime(today.at(-1).datetime) : "–"}</span></div><div class="tomorrow"><div><span class="small">Morgen</span><strong>${tomorrow[0] ? esc(dayName(tomorrow[0].datetime)) : "Keine Prognose"}</strong></div><div><strong>${esc(rangeText(tomorrowSummary.window))}</strong><span class="small">${tomorrowSummary.label}${tomorrowSummary.window ? " · " + metrics(tomorrowSummary.window.hours[0]) : ""}</span></div></div>${this.loading ? `<div class="small">Prognose wird geladen …</div>` : ""}${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}${debug}</ha-card>`;
  }
  getCardSize() { return 4; }
}
customElements.define("laufwetter-card", LaufwetterCard); window.customCards = window.customCards || []; window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Konkrete Laufzeiten für heute und morgen" });
