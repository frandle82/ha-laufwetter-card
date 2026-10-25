import { scoreHour, bestWindows, scoreLabel } from "./scoring.js";
import { normalizeForecast, unitSnapshot } from "./forecast.js";
class LaufwetterCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.forecast = []; this.error = ""; this.loading = false; this.lastFetch = 0; this.requestId = 0; }
  disconnectedCallback() { this.requestId++; }
  setConfig(config) { if (!config.entity) throw Error("Bitte eine weather-Entität angeben."); this.config = { title: "Laufwetter", location: "", duration: 60, refresh_minutes: 30, debug: false, ...config }; this.render(); }
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
    const now = Date.now(), hours = this.forecast.filter(hour => Date.parse(hour.datetime) >= now).slice(0, 24).map(hour => ({ ...hour, ...scoreHour(hour) }));
    const windows = bestWindows(hours), selected = windows.find(window => window?.duration === Number(this.config.duration)) || windows[2], first = hours[0], s = first?.comfort;
    const format = dt => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(dt));
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const tint = value => value == null ? "#94a3b8" : value >= 80 ? "#22a06b" : value >= 65 ? "#88b65d" : value >= 45 ? "#e9b44c" : "#d66b61";
    const bestText = selected?.recommended ? format(selected.start) : "Kein empfehlenswertes Zeitfenster";
    const debug = this.config.debug ? `<details class="debug"><summary>Debug: Roh- und Normalwerte</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, units: this.units, raw: this.rawForecast?.slice(0, 3), normalized: this.forecast.slice(0, 3) }, null, 2))}</pre></details>` : "";
    const windowText = windows.map(window => `<span>${window?.duration ?? "–"} Min.: ${window?.recommended ? esc(format(window.start)) + " · " + window.comfort : "kein Fenster"}</span>`).join("");
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{padding:20px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px);font-family:var(--primary-font-family,sans-serif)}.head,.summary,.metrics,.best,.timeline{display:flex;justify-content:space-between;align-items:center;gap:12px}.small{font-size:12px;color:var(--secondary-text-color)}h2{margin:4px 0;font-size:27px;color:${tint(s)}}.gauge{width:86px;height:86px;border-radius:50%;border:7px solid ${tint(s)};display:grid;place-content:center;text-align:center}.gauge strong{font-size:28px}.metrics{margin:20px 0;text-align:center}.metrics>div{flex:1}.metrics strong{display:block;margin-bottom:4px}.best{border-top:1px solid var(--divider-color);padding-top:14px}.bars{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px;margin-top:16px}.bar{height:10px;border-radius:2px}.timeline{margin-top:7px}.warning,.error{color:var(--error-color);font-size:12px;margin-top:10px}.debug{margin-top:12px}.debug pre{max-height:300px;overflow:auto;white-space:pre-wrap;font-size:11px}.windows{display:grid;gap:3px;margin-top:12px}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div><div class="summary"><div><span class="small">Laufkomfort</span><h2>${scoreLabel(s)}</h2><span class="small">${first ? format(first.datetime) : "Keine Prognose"}</span></div><div class="gauge"><strong>${s ?? "–"}</strong><span class="small">von 100</span></div></div><div class="small">${esc(first?.recommendation || "Keine Daten")} · ${esc(first?.explanation || "")}</div><div class="metrics"><div><strong>${first?.temperature != null ? Math.round(first.temperature) + " °C" : "–"}</strong><span class="small">Temperatur</span></div><div><strong>${first?.wind_speed != null ? Math.round(first.wind_speed) + " km/h" : "–"}${first?.wind_gust_speed != null ? " / " + Math.round(first.wind_gust_speed) : ""}</strong><span class="small">Mittelwind / Böen</span></div><div><strong>${first?.precipitation != null ? first.precipitation.toFixed(1) + " mm/h" : "–"}${first?.precipitation_probability != null ? " · " + Math.round(first.precipitation_probability) + "%" : ""}</strong><span class="small">Menge / Wahrscheinlichkeit</span></div></div><div class="best"><span>Beste Laufzeit (${Number(this.config.duration) || 60} Min.)</span><strong>${bestText}</strong></div><div class="windows small">${windowText}</div><div class="bars">${hours.map(hour => `<div class="bar" title="${esc(format(hour.datetime))}: ${hour.comfort ?? "–"}/100${hour.risks?.length ? " · " + hour.risks.join(", ") : ""}" style="background:${tint(hour.comfort)}"></div>`).join("")}</div><div class="timeline small"><span>Jetzt</span><span>+12 h</span><span>+24 h</span></div>${first?.risks?.length ? `<div class="warning">Warnung: ${esc(first.risks.join(", "))}</div>` : ""}${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}<div class="small" style="margin-top:12px">Heuristischer Laufkomfort, keine medizinische oder amtliche Sicherheitsbewertung.</div>${debug}</ha-card>`;
  }
  getCardSize() { return 4; }
}
customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", description: "Eigenständiger Laufwetter-Index mit Stundenprognose" });
