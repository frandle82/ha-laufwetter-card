import { scoreForecast } from "./scoring.js";
import { normalizeForecast, unitSnapshot } from "./forecast.js";
import { formatDateTime, formatTime } from "./format.js";
import { daySummary, localDayOffset } from "./windows.js";
import { daylightPoints, daylightStatus } from "./daylight.js";
import { CARD_STYLES } from "./card-styles.js";

const CARD_VERSION = "0.2.0";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dayName = value => { try { return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(value)); } catch { return "Unbekannter Tag"; } };
const rangeText = window => window ? `${formatTime(window.hours[0].datetime)}–${formatTime(new Date(Date.parse(window.hours.at(-1).datetime) + 60 * 60000))} Uhr` : "Keine empfehlenswerte Laufzeit.";

const metrics = hours => {
  if (!hours?.length) return "Keine Daten";
  const values = key => hours.map(hour => hour[key]).filter(value => value != null);
  const temperatures = values("temperature"), winds = values("wind_speed"), gusts = values("wind_gust_speed"), rain = values("precipitation");
  const temp = temperatures.length ? Math.min(...temperatures) === Math.max(...temperatures) ? `${Math.round(temperatures[0])} °C` : `${Math.round(Math.min(...temperatures))}–${Math.round(Math.max(...temperatures))} °C` : "–";
  return `${temp} · ${winds.length ? `${Math.round(Math.max(...winds))} km/h Wind` : "– Wind"}${gusts.length ? ` · ${Math.round(Math.max(...gusts))} km/h Böen` : ""} · ${rain.length ? `${Math.max(...rain).toFixed(1)} mm/h Regen` : "– Regen"}`;
};

const renderHeader = config => `<header class="card-header"><div class="card-title">${esc(config.title)}</div>${config.show_location && config.location ? `<span class="location">${esc(config.location)}</span>` : ""}</header>`;
const renderDaySummary = (label, hours, summary) => `<section class="day-summary"><h2 class="day-summary__title">${label} · ${hours.length ? esc(dayName(hours[0].datetime)) : "keine Prognose"}</h2><div class="day-summary__window">${esc(rangeText(summary.window))}</div><div class="day-summary__metrics">${esc(metrics(summary.window?.hours || hours))}</div></section>`;
const timelineColor = (hour, selected, isNight) => isNight(hour) ? "#8b95a5" : hour.risks?.length || !hour.marked ? "#d66b61" : selected.has(hour.datetime) ? "#22a06b" : "#e9b44c";
const renderTimeline = (hours, selected, isNight) => `<div class="timeline" aria-label="Stündliche Wetterqualität heute und kommende Tage">${hours.length ? hours.map((hour, index) => `<div class="timeline-hour${index === 0 || new Date(hour.datetime).getDate() !== new Date(hours[index - 1].datetime).getDate() ? " timeline-hour--day-start" : ""}"><div class="timeline-bar" title="${esc(formatDateTime(hour.datetime))}: ${esc(hour.risks?.join(", ") || "Laufen möglich")}" style="height:${Math.max(8, Math.min(100, 36 + hour.points * 3))}%;background:${timelineColor(hour, selected, isNight)}"></div><span class="timeline-label">${new Date(hour.datetime).getHours()}</span></div>`).join("") : "<span class='meta'>Keine zukünftigen Stunden verfügbar.</span>"}</div>`;

class LaufwetterCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.forecast = []; this.error = ""; this.loading = false; this.lastFetch = 0; this.requestId = 0; }
  disconnectedCallback() { this.requestId++; }
  setConfig(config) { if (!config?.entity) throw Error("Bitte eine weather-Entität angeben."); this.config = { title: "Laufwetter", location: "", show_location: false, duration: 60, refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", allow_night_runs: false, ...config }; this.render(); }
  set hass(hass) { this._hass = hass; if (!this.config) return; this.render(); const refresh = Math.max(5, Number(this.config.refresh_minutes) || 30) * 60000; if (!this.loading && Date.now() - this.lastFetch >= refresh) this.fetchForecast(); }
  async fetchForecast() {
    if (!this._hass?.callWS || !this.config) return;
    const entity = typeof this.config.entity === "string" ? this.config.entity.trim() : "", state = this._hass.states?.[entity];
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
    const now = Date.now(), daylight = hour => daylightStatus(hour, this._hass?.config);
    const scoredResult = scoreForecast(this.forecast, { now, daylightPoints: hour => daylightPoints(hour, this._hass?.config) });
    const markedHours = new Set(scoredResult.selection.marked.map(hour => hour.datetime));
    const hours = scoredResult.hours.map(hour => ({ ...hour, marked: markedHours.has(hour.datetime) }));
    const todayKey = localDayOffset(now), tomorrowKey = localDayOffset(now, 1);
    const today = hours.filter(hour => localDayOffset(hour.datetime) === todayKey && Date.parse(hour.datetime) >= now), tomorrow = hours.filter(hour => localDayOffset(hour.datetime) === tomorrowKey);
    const options = { daylightStatus: daylight, allowNightRuns: this.config.allow_night_runs, requireMarked: true, duration: this.config.duration };
    const todaySummary = daySummary(today, { ...options, now }), tomorrowSummary = daySummary(tomorrow, { ...options, includePast: true });
    const selected = new Set([...(todaySummary.window?.hours || []), ...(tomorrowSummary.window?.hours || [])].map(hour => hour.datetime));
    const chartHours = hours.filter(hour => Date.parse(hour.datetime) >= now);
    const debug = this.config.debug ? `<details><summary>Debug</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, threshold: scoredResult.selection.threshold, selection: scoredResult.selection.mode, hours: hours.map(hour => ({ datetime: hour.datetime, temperature: hour.temperature, wind_speed: hour.wind_speed, precipitation: hour.precipitation, humidity: hour.humidity, condition: hour.condition, daylight: daylight(hour), components: hour.components, score: hour.points, marked: hour.marked, selected: selected.has(hour.datetime) })), error: this.error }, null, 2))}</pre></details>` : "";
    this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style><ha-card>${renderHeader(this.config)}${renderDaySummary("Heute", today, todaySummary)}${renderTimeline(chartHours, selected, hour => daylight(hour) === "night")}${renderDaySummary("Morgen", tomorrow, tomorrowSummary)}${this.loading ? `<div class="state meta">Prognose wird geladen …</div>` : ""}${this.error ? `<div class="state state--error">${esc(this.error)}</div>` : ""}${debug}</ha-card>`;
  }
  getCardSize() { return 4; }
}
customElements.define("laufwetter-card", LaufwetterCard); window.customCards = window.customCards || []; window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Konkrete Laufzeiten für heute und morgen" });
