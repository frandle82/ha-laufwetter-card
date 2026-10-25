// src/scoring.js
var clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
var finite = (value) => Number.isFinite(value) ? value : null;
function band(value, idealMin, idealMax, low, high) {
  if (!Number.isFinite(value)) return null;
  if (value >= idealMin && value <= idealMax) return 100;
  return value < idealMin ? clamp(100 * (value - low) / (idealMin - low)) : clamp(100 * (high - value) / (high - idealMax));
}
function riskList(hour) {
  const condition = String(hour.condition || "").toLowerCase(), risks = [];
  if (/lightning|thunder|hail|storm|exceptional/.test(condition)) risks.push("Gewitter oder Unwetter");
  if (finite(hour.wind_gust_speed) >= 65) risks.push("Sturm- oder Orkanb\xF6en");
  else if (finite(hour.wind_gust_speed) >= 45) risks.push("starke B\xF6en");
  if (finite(hour.temperature) <= -10 || finite(hour.temperature) >= 35) risks.push("extreme Temperatur");
  if (/ice|icy|freezing|glaze|frost|snow/.test(condition) || finite(hour.temperature) <= 1 && finite(hour.precipitation) > 0) risks.push("m\xF6gliche Gl\xE4tte");
  if (finite(hour.precipitation) >= 4) risks.push("Starkregen");
  if (hour.warning) risks.push(hour.warning);
  return [...new Set(risks)];
}
function scoreHour(hour = {}) {
  const temperature = finite(hour.temperature), rain = finite(hour.precipitation), probability = finite(hour.precipitation_probability), wind = finite(hour.wind_speed), humidity = finite(hour.humidity), uv = finite(hour.uv_index);
  const factors = { temperature: band(temperature, 5, 15, -15, 30), rain: rain == null ? probability == null ? null : clamp(100 - probability * 0.25) : clamp(100 - rain * 22), wind: wind == null ? null : band(wind, 0, 18, 0, 55), humidity: band(humidity, 35, 70, 10, 100), uv: uv == null ? null : clamp(100 - Math.max(0, uv - 3) * 18) };
  const weights = { temperature: 0.35, rain: 0.25, wind: 0.2, humidity: 0.12, uv: 0.08 }, available = Object.keys(factors).filter((key) => factors[key] != null);
  if (!available.length) return { comfort: null, score: null, risks: [], recommendation: "Keine Daten", factors, uncertainty: true };
  const total = available.reduce((sum, key) => sum + weights[key], 0);
  let comfort = available.reduce((sum, key) => sum + factors[key] * weights[key], 0) / total;
  const risks = riskList(hour);
  if (risks.some((risk) => /Gewitter|Sturm|extreme|Starkregen|Glätte|Unwetter/.test(risk))) comfort = Math.min(comfort, 20);
  const uncertainty = rain == null && probability != null;
  return { comfort: Math.round(clamp(comfort)), score: Math.round(clamp(comfort)), risks, factors, coverage: Math.round(total * 100), uncertainty, recommendation: risks.length ? "Wetterbedingt nicht empfohlen" : comfort >= 80 ? "Sehr gute Bedingungen" : comfort >= 65 ? "Gute Bedingungen" : comfort >= 45 ? "Laufen m\xF6glich" : "Nur eingeschr\xE4nkt empfehlenswert", explanation: risks[0] || (uncertainty ? "Niederschlagsmenge fehlt; Regenbewertung unsicher" : comfort >= 65 ? "Ausgewogene Laufbedingungen" : "Komfort durch Wetterfaktoren eingeschr\xE4nkt") };
}
function bestWindows(hours, durations = [30, 45, 60, 90, 120]) {
  return durations.map((duration) => {
    const slots = Math.max(1, Math.ceil(duration / 60)), candidates = [];
    for (let index = 0; index <= hours.length - slots; index++) {
      const slice = hours.slice(index, index + slots);
      if (slice.some((hour) => hour.comfort == null)) continue;
      if (slice.some((hour, i) => i && Date.parse(hour.datetime) - Date.parse(slice[i - 1].datetime) !== 36e5)) continue;
      const risks = [...new Set(slice.flatMap((hour) => hour.risks || []))], comfort = Math.round(slice.reduce((sum, hour) => sum + hour.comfort, 0) / slice.length);
      candidates.push({ duration, start: slice[0].datetime, end: new Date(Date.parse(slice[0].datetime) + duration * 6e4).toISOString(), comfort, risks, recommended: !risks.length && comfort >= 45 });
    }
    return candidates.sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.comfort - a.comfort)[0] || null;
  });
}
var scoreLabel = (score) => score == null ? "Keine Daten" : score >= 80 ? "Sehr gut" : score >= 65 ? "Gut" : score >= 45 ? "M\xE4\xDFig" : "Ung\xFCnstig";

// src/forecast.js
var finite2 = (value) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
function normalizeForecast(forecast, units = {}) {
  const temperatureUnit = units.temperature || "\xB0C", windUnit = units.wind_speed || "km/h";
  const toCelsius = (value) => {
    const number = finite2(value);
    return number == null ? null : temperatureUnit === "\xB0F" ? (number - 32) * 5 / 9 : number;
  };
  const toKmh = (value) => {
    const number = finite2(value);
    if (number == null) return null;
    return windUnit === "mph" ? number * 1.609344 : windUnit === "m/s" ? number * 3.6 : windUnit === "kn" ? number * 1.852 : number;
  };
  return (forecast || []).filter((item) => item?.datetime && Number.isFinite(Date.parse(item.datetime))).map((item) => ({
    datetime: item.datetime,
    temperature: toCelsius(item.temperature),
    precipitation_probability: finite2(item.precipitation_probability),
    precipitation: finite2(item.precipitation),
    wind_speed: toKmh(item.wind_speed),
    wind_gust_speed: toKmh(item.wind_gust_speed),
    humidity: finite2(item.humidity),
    uv_index: finite2(item.uv_index),
    condition: String(item.condition || "")
  })).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
}
function unitSnapshot(hass, entityId) {
  const attrs = hass?.states?.[entityId]?.attributes || {};
  return { temperature: attrs.temperature_unit || hass?.config?.unit_system?.temperature || "\xB0C", wind_speed: attrs.wind_speed_unit || hass?.config?.unit_system?.wind_speed || "km/h", precipitation: attrs.precipitation_unit || "mm" };
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
    this.config = { title: "Laufwetter", location: "", duration: 60, refresh_minutes: 30, debug: false, ...config };
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;
    this.render();
    const refresh = Math.max(5, Number(this.config.refresh_minutes) || 30) * 6e4;
    if (!this.loading && Date.now() - this.lastFetch >= refresh) this.fetchForecast();
  }
  async fetchForecast() {
    if (!this._hass?.callWS || !this.config) return;
    this.loading = true;
    this.lastFetch = Date.now();
    const requestId = this.requestId;
    try {
      const result = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: this.config.entity }, return_response: true });
      if (requestId !== this.requestId) return;
      const data = result?.response || result, raw = data?.[this.config.entity]?.forecast;
      if (!Array.isArray(raw)) throw Error("Keine st\xFCndliche Prognose verf\xFCgbar.");
      this.rawForecast = raw;
      this.units = unitSnapshot(this._hass, this.config.entity);
      const warning = this.config.warning_entity ? this._hass.states?.[this.config.warning_entity] : null;
      const warningText = warning && !["off", "unknown", "unavailable"].includes(warning.state) ? String(warning.attributes?.friendly_name || warning.state) : "";
      this.forecast = normalizeForecast(raw, this.units).map((hour) => ({ ...hour, warning: warningText }));
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
    const now = Date.now(), hours = this.forecast.filter((hour) => Date.parse(hour.datetime) >= now).slice(0, 24).map((hour) => ({ ...hour, ...scoreHour(hour) }));
    const windows = bestWindows(hours), selected = windows.find((window2) => window2?.duration === Number(this.config.duration)) || windows[2], first = hours[0], s = first?.comfort;
    const format = (dt) => new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(dt));
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const tint = (value) => value == null ? "#94a3b8" : value >= 80 ? "#22a06b" : value >= 65 ? "#88b65d" : value >= 45 ? "#e9b44c" : "#d66b61";
    const bestText = selected?.recommended ? format(selected.start) : "Kein empfehlenswertes Zeitfenster";
    const debug = this.config.debug ? `<details class="debug"><summary>Debug: Roh- und Normalwerte</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, units: this.units, raw: this.rawForecast?.slice(0, 3), normalized: this.forecast.slice(0, 3) }, null, 2))}</pre></details>` : "";
    const windowText = windows.map((window2) => `<span>${window2?.duration ?? "\u2013"} Min.: ${window2?.recommended ? esc(format(window2.start)) + " \xB7 " + window2.comfort : "kein Fenster"}</span>`).join("");
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{padding:20px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px);font-family:var(--primary-font-family,sans-serif)}.head,.summary,.metrics,.best,.timeline{display:flex;justify-content:space-between;align-items:center;gap:12px}.small{font-size:12px;color:var(--secondary-text-color)}h2{margin:4px 0;font-size:27px;color:${tint(s)}}.gauge{width:86px;height:86px;border-radius:50%;border:7px solid ${tint(s)};display:grid;place-content:center;text-align:center}.gauge strong{font-size:28px}.metrics{margin:20px 0;text-align:center}.metrics>div{flex:1}.metrics strong{display:block;margin-bottom:4px}.best{border-top:1px solid var(--divider-color);padding-top:14px}.bars{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px;margin-top:16px}.bar{height:10px;border-radius:2px}.timeline{margin-top:7px}.warning,.error{color:var(--error-color);font-size:12px;margin-top:10px}.debug{margin-top:12px}.debug pre{max-height:300px;overflow:auto;white-space:pre-wrap;font-size:11px}.windows{display:grid;gap:3px;margin-top:12px}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div><div class="summary"><div><span class="small">Laufkomfort</span><h2>${scoreLabel(s)}</h2><span class="small">${first ? format(first.datetime) : "Keine Prognose"}</span></div><div class="gauge"><strong>${s ?? "\u2013"}</strong><span class="small">von 100</span></div></div><div class="small">${esc(first?.recommendation || "Keine Daten")} \xB7 ${esc(first?.explanation || "")}</div><div class="metrics"><div><strong>${first?.temperature != null ? Math.round(first.temperature) + " \xB0C" : "\u2013"}</strong><span class="small">Temperatur</span></div><div><strong>${first?.wind_speed != null ? Math.round(first.wind_speed) + " km/h" : "\u2013"}${first?.wind_gust_speed != null ? " / " + Math.round(first.wind_gust_speed) : ""}</strong><span class="small">Mittelwind / B\xF6en</span></div><div><strong>${first?.precipitation != null ? first.precipitation.toFixed(1) + " mm/h" : "\u2013"}${first?.precipitation_probability != null ? " \xB7 " + Math.round(first.precipitation_probability) + "%" : ""}</strong><span class="small">Menge / Wahrscheinlichkeit</span></div></div><div class="best"><span>Beste Laufzeit (${Number(this.config.duration) || 60} Min.)</span><strong>${bestText}</strong></div><div class="windows small">${windowText}</div><div class="bars">${hours.map((hour) => `<div class="bar" title="${esc(format(hour.datetime))}: ${hour.comfort ?? "\u2013"}/100${hour.risks?.length ? " \xB7 " + hour.risks.join(", ") : ""}" style="background:${tint(hour.comfort)}"></div>`).join("")}</div><div class="timeline small"><span>Jetzt</span><span>+12 h</span><span>+24 h</span></div>${first?.risks?.length ? `<div class="warning">Warnung: ${esc(first.risks.join(", "))}</div>` : ""}${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}<div class="small" style="margin-top:12px">Heuristischer Laufkomfort, keine medizinische oder amtliche Sicherheitsbewertung.</div>${debug}</ha-card>`;
  }
  getCardSize() {
    return 4;
  }
};
customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", description: "Eigenst\xE4ndiger Laufwetter-Index mit Stundenprognose" });
