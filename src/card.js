import { scoreForecast } from "./scoring.js";
import { normalizeForecast, unitSnapshot } from "./forecast.js";
import { formatDateTime, formatTime } from "./format.js";
import { daySummary, localDayOffset } from "./windows.js";
import { daylightPoints, daylightStatus } from "./daylight.js";

const CARD_VERSION = "0.2.0";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tint = points => points == null ? "#94a3b8" : points >= 15 ? "#22a06b" : points >= 8 ? "#9aba57" : points >= 0 ? "#e9b44c" : "#d66b61";
const dayName = value => { try { return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(value)); } catch { return "Unbekannter Tag"; } };
const rangeText = window => window ? `${formatTime(window.hours[0].datetime)}–${formatTime(new Date(Date.parse(window.hours.at(-1).datetime) + 60 * 60000))} Uhr` : "Kein empfehlenswertes Zeitfenster";

class LaufwetterCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.forecast = []; this.error = ""; this.loading = false; this.lastFetch = 0; this.requestId = 0; }
  disconnectedCallback() { this.requestId++; }
  setConfig(config) { if (!config?.entity) throw Error("Bitte eine weather-Entität angeben."); this.config = { title: "Laufwetter", location: "", show_location: false, duration: 60, refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", allow_night_runs: false, ...config }; this.render(); }
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
    const now = Date.now(); const scoredResult = scoreForecast(this.forecast, { now, daylightPoints: hour => daylightPoints(hour, this._hass?.config) }); const markedHours = new Set(scoredResult.selection.marked.map(hour => hour.datetime)); const scored = { ...scoredResult, hours: scoredResult.hours.map(hour => ({ ...hour, marked: markedHours.has(hour.datetime) })) }; const todayKey = localDayOffset(now), tomorrowKey = localDayOffset(now, 1);
    const today = scored.hours.filter(hour => localDayOffset(hour.datetime) === todayKey && Date.parse(hour.datetime) >= now); const tomorrow = scored.hours.filter(hour => localDayOffset(hour.datetime) === tomorrowKey);
    const sunOptions = { daylightStatus: hour => daylightStatus(hour, this._hass?.config), allowNightRuns: this.config.allow_night_runs };
    const todaySummary = daySummary(today, { ...sunOptions, requireMarked: true, duration: this.config.duration, now }); const tomorrowSummary = daySummary(tomorrow, { ...sunOptions, requireMarked: true, duration: this.config.duration, includePast: true });
    const metrics = window => { if (!window?.length) return "Keine Daten"; const values = key => window.map(hour => hour[key]).filter(value => value != null); const temperatures = values("temperature"), winds = values("wind_speed"), gusts = values("wind_gust_speed"), rain = values("precipitation"); const temp = temperatures.length ? (Math.min(...temperatures) === Math.max(...temperatures) ? `${Math.round(temperatures[0])} °C` : `${Math.round(Math.min(...temperatures))}–${Math.round(Math.max(...temperatures))} °C`) : "–"; return `${temp} · ${winds.length ? Math.round(Math.max(...winds)) + " km/h Wind" : "– Wind"}${gusts.length ? " · " + Math.round(Math.max(...gusts)) + " km/h Böen" : ""} · ${rain.length ? Math.max(...rain).toFixed(1) + " mm/h Regen" : "– Regen"}`; };
    const marked = new Set([...(todaySummary.window?.hours || []), ...(tomorrowSummary.window?.hours || [])].map(hour => hour.datetime));
    const chartHours = scored.hours.filter(hour => Date.parse(hour.datetime) >= now);
    const isNight = hour => daylightStatus(hour, this._hass?.config) === "night";
    const barColor = hour => isNight(hour) ? "#8b95a5" : hour.risks?.length || !hour.marked ? "#d66b61" : marked.has(hour.datetime) ? "#22a06b" : "#e9b44c";
    const chart = chartHours.map((hour, index) => `<div class="chart-hour${index === 0 || new Date(hour.datetime).getDate() !== new Date(chartHours[index - 1].datetime).getDate() ? " day-start" : ""}"><div class="bar" title="${esc(formatDateTime(hour.datetime))}: ${esc(hour.risks?.join(", ") || "Laufen möglich")}" style="height:${Math.max(8, Math.min(100, 36 + hour.points * 3))}%;background:${barColor(hour)}"></div><span>${new Date(hour.datetime).getHours()}</span></div>`).join("");
    const debug = this.config.debug ? `<details><summary>Debug</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, threshold: scored.selection.threshold, selection: scored.selection.mode, hours: scored.hours.map(hour => ({ datetime: hour.datetime, temperature: hour.temperature, wind_speed: hour.wind_speed, precipitation: hour.precipitation, humidity: hour.humidity, condition: hour.condition, daylight: daylightStatus(hour, this._hass?.config), components: hour.components, score: hour.points, marked: hour.marked, selected: marked.has(hour.datetime) })), error: this.error }, null, 2))}</pre></details>` : "";
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{display:block;padding:14px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,12px);font-family:var(--primary-font-family,sans-serif)}h2{margin:0;font-size:14px;font-weight:600}.head{display:flex;justify-content:space-between;gap:12px;align-items:center}.head strong{font-size:16px;font-weight:600}.head .small{display:block;margin-top:2px}.small{font-size:12px;color:var(--secondary-text-color)}.section{padding:8px 0;border-bottom:1px solid var(--divider-color)}.window{padding:3px 0}.window strong{display:block;font-size:16px;font-weight:600}.metrics{justify-content:flex-start;margin-top:2px;font-size:12px}.chart{display:flex;align-items:end;gap:4px;overflow-x:auto;height:112px;margin:12px 0 3px;padding:0 2px}.chart-hour{height:100%;min-width:22px;display:flex;flex-direction:column;align-items:center;justify-content:end;gap:4px;font-size:10px}.chart-hour.day-start{border-left:1px solid var(--divider-color);padding-left:5px;margin-left:4px}.bar{width:100%;min-height:8px;border-radius:3px 3px 0 0}.error{color:var(--error-color);margin-top:12px;font-size:13px}details{margin-top:12px}pre{max-height:240px;overflow:auto;font-size:11px;white-space:pre-wrap}</style><ha-card><div class="head"><div><strong>${esc(this.config.title)}</strong>${this.config.show_location && this.config.location ? `<span class="small">${esc(this.config.location)}</span>` : ""}</div></div><div class="section"><h2>Heute · ${today.length ? esc(dayName(today[0].datetime)) : "keine Prognose"}</h2><div class="window"><strong>${todaySummary.window ? esc(rangeText(todaySummary.window)) : "Heute keine empfehlenswerte Laufzeit."}</strong></div><div class="metrics">${metrics(todaySummary.window?.hours || today)}</div></div><div class="chart" aria-label="Stündliche Wetterqualität heute und kommende Tage">${chart || "<span class='small'>Keine zukünftigen Stunden verfügbar.</span>"}</div><div class="section"><h2>Morgen · ${tomorrow[0] ? esc(dayName(tomorrow[0].datetime)) : "keine Prognose"}</h2><div class="window"><strong>${tomorrowSummary.window ? esc(rangeText(tomorrowSummary.window)) : "Keine empfehlenswerte Laufzeit."}</strong></div><div class="metrics">${metrics(tomorrowSummary.window?.hours || tomorrow)}</div></div>${this.loading ? `<div class="small">Prognose wird geladen …</div>` : ""}${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}${debug}</ha-card>`;
  }
  getCardSize() { return 4; }
}
customElements.define("laufwetter-card", LaufwetterCard); window.customCards = window.customCards || []; window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Konkrete Laufzeiten für heute und morgen" });
