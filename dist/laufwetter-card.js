// src/scoring.js
var clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
var scoreRange = (value, idealMin, idealMax, low, high) => {
  if (!Number.isFinite(value)) return null;
  if (value >= idealMin && value <= idealMax) return 100;
  if (value < idealMin) return clamp(100 * (value - low) / (idealMin - low));
  return clamp(100 * (high - value) / (high - idealMax));
};
function scoreHour(h) {
  const finite = (value) => Number.isFinite(value) ? value : null;
  const temperature = finite(h.temperature), precipitationProbability = finite(h.precipitation_probability);
  const precipitation = finite(h.precipitation), windSpeed = finite(h.wind_speed);
  const humidity = finite(h.humidity), uvIndex = finite(h.uv_index);
  const gust = finite(h.wind_gust_speed);
  const factors = {
    temperature: scoreRange(temperature, 8, 15, -10, 34),
    rain: precipitationProbability != null ? clamp(100 - precipitationProbability) : precipitation != null ? clamp(100 - precipitation * 35) : null,
    wind: windSpeed != null ? scoreRange(windSpeed, 0, 12, 0, 55) : null,
    humidity: humidity != null ? scoreRange(humidity, 35, 70, 10, 100) : null,
    uv: uvIndex != null ? clamp(100 - Math.max(0, uvIndex - 3) * 18) : null
  };
  const weights = { temperature: 0.4, rain: 0.3, wind: 0.15, humidity: 0.1, uv: 0.05 };
  const available = Object.keys(factors).filter((k) => factors[k] !== null);
  if (!available.length) return { score: null, reason: "Keine geeigneten Wetterdaten" };
  const total = available.reduce((sum, k) => sum + weights[k], 0);
  let score = available.reduce((sum, k) => sum + factors[k] * weights[k], 0) / total;
  const condition = String(h.condition || "").toLowerCase();
  if (/lightning|hail|exceptional/.test(condition)) score = Math.min(score, 10);
  if (temperature != null && (temperature <= -10 || temperature >= 35)) score = Math.min(score, 20);
  if (gust != null && gust >= 65) score = Math.min(score, 20);
  return { score: Math.round(clamp(score)), factors, coverage: Math.round(total * 100) };
}
function bestWindow(hours, duration = 60) {
  const slots = Math.max(1, Math.ceil(duration / 60));
  const candidates = [];
  for (let i = 0; i <= hours.length - slots; i++) {
    const slice = hours.slice(i, i + slots);
    if (slice.some((h) => h.score == null)) continue;
    if (slice.some((h, j) => j > 0 && new Date(h.datetime) - new Date(slice[j - 1].datetime) !== 36e5)) continue;
    candidates.push({ start: slice[0].datetime, end: new Date(new Date(slice[0].datetime).getTime() + duration * 6e4).toISOString(), score: Math.round(slice.reduce((s, h) => s + h.score, 0) / slots) });
  }
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}
var scoreLabel = (s) => s == null ? "Keine Daten" : s >= 80 ? "Sehr gut" : s >= 65 ? "Gut" : s >= 45 ? "M\xE4\xDFig" : "Ung\xFCnstig";

// src/forecast.js
function normalizeForecast(forecast, unitSystem = {}) {
  const temperatureUnit = unitSystem.temperature || "\xB0C";
  const windUnit = unitSystem.wind_speed || "km/h";
  const numberOrNull = (value) => {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const toC = (t) => {
    const value = numberOrNull(t);
    return value == null ? null : temperatureUnit === "\xB0F" ? (value - 32) * 5 / 9 : value;
  };
  const toKmh = (v) => {
    const value = numberOrNull(v);
    return value == null ? null : windUnit === "mph" ? value * 1.609344 : windUnit === "m/s" ? value * 3.6 : windUnit === "kn" ? value * 1.852 : value;
  };
  return (forecast || []).filter((x) => x.datetime && !Number.isNaN(Date.parse(x.datetime))).map((x) => ({
    datetime: x.datetime,
    temperature: toC(x.temperature),
    precipitation_probability: numberOrNull(x.precipitation_probability),
    precipitation: numberOrNull(x.precipitation),
    wind_speed: toKmh(x.wind_speed),
    wind_gust_speed: toKmh(x.wind_gust_speed),
    humidity: numberOrNull(x.humidity),
    uv_index: numberOrNull(x.uv_index),
    condition: x.condition || ""
  })).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
}

// src/card.js
var LaufwetterCard = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.forecast = [];
    this.error = "";
    this.loading = false;
    this.lastFetch = 0;
    this.requestId = 0;
  }
  disconnectedCallback() {
    this.requestId++;
  }
  setConfig(config) {
    if (!config.entity) throw Error("Bitte eine weather-Entit\xE4t angeben.");
    this.config = { title: "Laufwetter", location: "", duration: 60, refresh_minutes: 30, ...config };
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;
    this.render();
    const now = Date.now();
    if (!this.loading && now - this.lastFetch >= Math.max(5, Number(this.config.refresh_minutes)) * 6e4) {
      this.fetchForecast();
    }
  }
  async fetchForecast() {
    if (!this._hass?.callWS || !this.config) return;
    this.loading = true;
    this.lastFetch = Date.now();
    const requestId = this.requestId;
    try {
      const result = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: this.config.entity }, return_response: true });
      if (requestId !== this.requestId) return;
      const data = result?.response || result;
      const forecast = data?.[this.config.entity]?.forecast;
      if (!Array.isArray(forecast)) throw Error("Keine st\xFCndliche Prognose verf\xFCgbar.");
      const entity = this._hass.states?.[this.config.entity];
      const units = { ...this._hass.config?.unit_system, ...entity?.attributes };
      this.forecast = normalizeForecast(forecast, { temperature: units.temperature_unit || units.temperature, wind_speed: units.wind_speed_unit || units.wind_speed });
      this.error = "";
    } catch (err) {
      if (requestId === this.requestId) {
        this.error = String(err.message || err);
        this.forecast = [];
      }
    } finally {
      this.loading = false;
      this.render();
    }
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    const now = Date.now(), hours = this.forecast.filter((h) => Date.parse(h.datetime) >= now).slice(0, 24).map((h) => ({ ...h, ...scoreHour(h) }));
    const best = bestWindow(hours, Number(this.config.duration) || 60), first = hours[0], s = first?.score;
    const format = (dt) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(dt));
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const tint = (x) => x == null ? "#94a3b8" : x >= 80 ? "#22a06b" : x >= 65 ? "#88b65d" : x >= 45 ? "#e9b44c" : "#d66b61";
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{padding:20px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px);font-family:var(--primary-font-family,sans-serif)}.head,.summary,.metrics,.best,.timeline{display:flex;justify-content:space-between;align-items:center;gap:12px}.small{font-size:12px;color:var(--secondary-text-color)}h2{margin:4px 0;font-size:27px;color:${tint(s)}}.gauge{width:86px;height:86px;border-radius:50%;border:7px solid ${tint(s)};display:grid;place-content:center;text-align:center}.gauge strong{font-size:28px}.metrics{margin:20px 0;text-align:center}.metrics>div{flex:1}.metrics strong{display:block;margin-bottom:4px}.best{border-top:1px solid var(--divider-color);padding-top:14px}.bars{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px;margin-top:16px}.bar{height:10px;border-radius:2px}.timeline{margin-top:7px}.error{color:var(--error-color);font-size:12px;margin-top:10px}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div><div class="summary"><div><span class="small">Aktuelle Prognosestunde</span><h2>${scoreLabel(s)}</h2><span class="small">${first ? format(first.datetime) : "Keine Prognose"}</span></div><div class="gauge"><strong>${s ?? "\u2013"}</strong><span class="small">von 100</span></div></div><div class="metrics"><div><strong>${first?.temperature != null ? Math.round(first.temperature) + " \xB0C" : "\u2013"}</strong><span class="small">Temperatur</span></div><div><strong>${first?.wind_speed != null ? Math.round(first.wind_speed) + " km/h" : "\u2013"}</strong><span class="small">Wind</span></div><div><strong>${first?.precipitation_probability != null ? Math.round(first.precipitation_probability) + " %" : "\u2013"}</strong><span class="small">Regenrisiko</span></div></div><div class="best"><span>Beste Laufzeit (${Number(this.config.duration) || 60} Min.)</span><strong>${best ? format(best.start) : "\u2013"}</strong></div><div class="bars">${hours.map((h) => `<div class="bar" title="${esc(format(h.datetime))}: ${h.score ?? "\u2013"}/100" style="background:${tint(h.score)}"></div>`).join("")}</div><div class="timeline small"><span>Jetzt</span><span>+12 h</span><span>+24 h</span></div><div class="small" style="margin-top:12px">Eigener Wetterindex \xB7 keine medizinische Sicherheitsbewertung</div>${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}</ha-card>`;
  }
  getCardSize() {
    return 4;
  }
};
customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", description: "Eigenst\xE4ndiger Laufwetter-Index mit Stundenprognose" });
