import { scoreForecast } from "./scoring.js";
import { normalizeForecast, unitSnapshot } from "./forecast.js";
import { formatDateTime } from "./format.js";
const CARD_VERSION = "0.1.3";
class LaufwetterCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.forecast = []; this.error = ""; this.loading = false; this.lastFetch = 0; this.requestId = 0; }
  disconnectedCallback() { this.requestId++; }
  setConfig(config) { if (!config.entity) throw Error("Bitte eine weather-Entität angeben."); this.config = { title: "Laufwetter", location: "", refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", ...config }; this.render(); }
  set hass(hass) { this._hass = hass; if (!this.config) return; this.render(); const refresh = Math.max(5, Number(this.config.refresh_minutes) || 30) * 60000; if (!this.loading && Date.now() - this.lastFetch >= refresh) this.fetchForecast(); }
  async fetchForecast() {
    if (!this._hass?.callWS || !this.config) return; this.loading = true; this.lastFetch = Date.now(); const requestId = this.requestId;
    try {
      const result = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: this.config.entity }, return_response: true });
      if (requestId !== this.requestId) return;
      const data = result?.response || result, raw = data?.[this.config.entity]?.forecast;
      if (!Array.isArray(raw)) throw Error("Keine stündliche Prognose verfügbar.");
      this.rawForecast = raw; this.units = unitSnapshot(this._hass, this.config.entity);
      const warning = this.config.warning_entity ? this._hass.states?.[this.config.warning_entity] : null;
      const warningText = warning && !["off", "unknown", "unavailable"].includes(warning.state) ? String(warning.attributes?.friendly_name || warning.state) : "";
      this.forecast = normalizeForecast(raw, this.units).map(hour => ({ ...hour, warning: warningText })); this.error = "";
    } catch (err) { if (requestId === this.requestId) { this.error = String(err.message || err); this.forecast = []; } }
    finally { this.loading = false; this.render(); }
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    const sun = this._hass?.states?.[this.config.sun_entity]?.attributes || {}, sunData = { sunrise: sun.next_rising, sunset: sun.next_setting };
    const now = Date.now(), future = this.forecast.filter(hour => Date.parse(hour.datetime) >= now), scored = scoreForecast(future, { now, sun: sunData }), hours = scored.hours, selection = scored.selection, first = hours[0];
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const tint = value => value == null ? "#94a3b8" : value >= 10 ? "#22a06b" : value >= 4 ? "#88b65d" : value >= 0 ? "#e9b44c" : "#d66b61";
    const marked = new Set(selection.marked.map(hour => hour.datetime));
    const best = selection.marked.filter(hour => !hour.risks?.length).sort((a, b) => b.points - a.points)[0];
    const debug = this.config.debug ? `<details class="debug"><summary>Debug: Rohwerte, Einheiten, normalisierte Werte</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, units: this.units, sun: sunData, raw: this.rawForecast?.slice(0, 3), normalized: this.forecast.slice(0, 3) }, null, 2))}</pre></details>` : "";
    const markText = best ? formatDateTime(best.datetime) : "Keine markierte Laufzeit";
    const format = formatDateTime;
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{padding:20px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px);font-family:var(--primary-font-family,sans-serif)}.head,.summary,.metrics,.best,.timeline{display:flex;justify-content:space-between;align-items:center;gap:12px}.small{font-size:12px;color:var(--secondary-text-color)}h2{margin:4px 0;font-size:27px;color:${tint(first?.points)}}.summary strong{font-size:28px}.metrics{margin:20px 0;text-align:center}.metrics>div{flex:1}.metrics strong{display:block;margin-bottom:4px}.best{border-top:1px solid var(--divider-color);padding-top:14px}.bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(5px,1fr));gap:2px;margin-top:16px}.bar{height:12px;border-radius:2px}.bar.marked{outline:2px solid var(--primary-color)}.timeline{margin-top:7px}.warning,.error{color:var(--error-color);font-size:12px;margin-top:10px}.debug{margin-top:12px}.debug pre{max-height:300px;overflow:auto;white-space:pre-wrap;font-size:11px}.legend{margin-top:8px}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div><div class="summary"><div><span class="small">Laufwetter-Punktzahl</span><h2>${first ? first.points : "–"} Punkte</h2><span class="small">${selection.mode} · ${selection.horizonDays} Tage verfügbar</span></div><strong>${selection.threshold == null ? "relativ" : "Schwelle " + selection.threshold}</strong></div><div class="small">${best ? "Günstiger als andere Stunden" : "Keine ausreichende Empfehlung im verfügbaren Zeitraum"}</div><div class="metrics"><div><strong>${first?.temperature != null ? Math.round(first.temperature) + " °C" : "–"}</strong><span class="small">Temperatur</span></div><div><strong>${first?.wind_speed != null ? Math.round(first.wind_speed) + " km/h" : "–"}${first?.wind_gust_speed != null ? " / " + Math.round(first.wind_gust_speed) : ""}</strong><span class="small">Mittelwind / Böen</span></div><div><strong>${first?.precipitation != null ? first.precipitation.toFixed(1) + " mm/h" : "–"}${first?.precipitation_probability != null ? " · " + Math.round(first.precipitation_probability) + "%" : ""}</strong><span class="small">Menge / Wahrscheinlichkeit</span></div></div><div class="best"><span>Beste verfügbare Laufzeit</span><strong>${markText}</strong></div><div class="bars">${hours.map(hour => `<div class="bar${marked.has(hour.datetime) ? " marked" : ""}" title="${esc(format(hour.datetime))}: ${hour.points} Punkte${hour.risks?.length ? " · " + hour.risks.join(", ") : ""}" style="background:${tint(hour.points)}"></div>`).join("")}</div><div class="legend small">Markierung = relative Empfehlung · ${hours.length} Stunden bewertet</div><div class="timeline small"><span>${hours[0] ? format(hours[0].datetime) : "–"}</span><span>${hours[Math.floor(hours.length / 2)] ? format(hours[Math.floor(hours.length / 2)].datetime) : "–"}</span><span>${hours.at(-1) ? format(hours.at(-1).datetime) : "–"}</span></div>${first?.risks?.length ? `<div class="warning">Warnung: ${esc(first.risks.join(", "))}</div>` : ""}${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}<div class="small" style="margin-top:12px">Additive, relative Heuristik; keine Gleichheit mit laufwetter.de und keine amtliche Sicherheitsbewertung.</div>${debug}</ha-card>`;
  }
  getCardSize() { return 4; }
}
customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Eigenständiger relativer Laufwetter-Index" });
