// src/scoring.js
var finite = (value) => Number.isFinite(value) ? value : null;
var dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
var hourKey = (date) => `${dayKey(date)}-${date.getHours()}`;
var weatherStates = {
  clear: "sun",
  "clear-night": "night",
  cloudy: "cloud",
  fog: "fog",
  hail: "hail",
  lightning: "storm",
  "lightning-rainy": "storm",
  partlycloudy: "sun",
  pouring: "rain",
  rainy: "rain",
  snowy: "snow",
  "snowy-rainy": "freezing-rain",
  sunny: "sun",
  windy: "wind",
  "windy-variant": "wind",
  exceptional: "exceptional"
};
var beaufort = (kmh) => kmh == null ? null : kmh < 1 ? 0 : kmh < 6 ? 1 : kmh < 12 ? 2 : kmh < 20 ? 3 : kmh < 29 ? 4 : kmh < 39 ? 5 : kmh < 50 ? 6 : kmh < 62 ? 7 : kmh < 75 ? 8 : kmh < 89 ? 9 : kmh < 103 ? 10 : kmh < 118 ? 11 : 12;
function daytimeBonus(hour, sun = {}) {
  const date = new Date(hour.datetime), sunrise = sun.sunrise ? new Date(sun.sunrise) : null, sunset = sun.sunset ? new Date(sun.sunset) : null;
  if (sunrise && hourKey(date) === hourKey(sunrise) || sunset && hourKey(date) === hourKey(sunset)) return 2;
  if (sunrise && dayKey(date) === dayKey(sunrise) && Math.abs(date.getHours() - sunrise.getHours()) === 1 || sunset && dayKey(date) === dayKey(sunset) && Math.abs(date.getHours() - sunset.getHours()) === 1) return 1;
  if (sunrise && sunset && (date < sunrise || date >= sunset)) return -16;
  return null;
}
function precipitationPoints(hour, weather) {
  if (hour.precipitation == null) return { points: 0, known: false };
  if (hour.precipitation <= 0) return { points: weather === "sun" ? 0 : 2, known: true };
  if (hour.precipitation <= 0.5) return { points: hour.temperature > 19 ? 1 : -2, known: true };
  if (hour.precipitation <= 2) return { points: -4, known: true };
  return { points: -8, known: true };
}
function scoreHour(hour = {}, context = {}) {
  const temperature = finite(hour.temperature), humidity = finite(hour.humidity), wind = finite(hour.wind_speed), gust = finite(hour.wind_gust_speed);
  const weather = weatherStates[String(hour.condition || "").toLowerCase()] || "unknown", date = new Date(hour.datetime), now = context.now ? new Date(context.now) : /* @__PURE__ */ new Date();
  let points = date.toDateString() === now.toDateString() ? 2 : date.toDateString() === new Date(now.getTime() + 864e5).toDateString() ? 1 : 0;
  const daylight = daytimeBonus(hour, context.sun);
  if (daylight != null) points += daylight;
  if (temperature != null) points += temperature < 15 ? temperature / 2 : temperature <= 19 ? 10 : 6 - 2 * (temperature - 19);
  if (humidity != null) points -= humidity / 10;
  const bft = beaufort(wind);
  if (bft != null && bft >= 3) points += temperature != null && temperature < 15 ? -bft : temperature != null && temperature <= 19 ? -1 : bft <= 4 ? 1 : 0;
  const precipitation = precipitationPoints(hour, weather);
  points += precipitation.points;
  if (weather === "sun" && temperature != null) points += temperature <= 19 ? 4 : -8;
  if (weather === "snow" || weather === "freezing-rain") points -= 8;
  if (weather === "storm" || weather === "exceptional") points -= 16;
  const risks = [];
  if (weather === "storm" || weather === "exceptional") risks.push("Gewitter oder Unwetter");
  if (gust != null && gust >= 65) risks.push("Sturm- oder Orkanb\xF6en");
  else if (gust != null && gust >= 45) risks.push("starke B\xF6en");
  if (weather === "snow" || weather === "freezing-rain") risks.push("m\xF6gliche Gl\xE4tte");
  if (temperature != null && (temperature <= -10 || temperature >= 35)) risks.push("extreme Temperatur");
  if (hour.precipitation != null && hour.precipitation > 2) risks.push("Starkregen");
  if (hour.warning) risks.push(hour.warning);
  return { points: Math.round(points * 10) / 10, score: Math.round(points * 10) / 10, risks: [...new Set(risks)], weatherClass: weather, beaufort: bft, precipitationKnown: precipitation.known, daylightKnown: daylight != null };
}
function selectRecommendations(hours, options = {}) {
  const horizonDays = hours.length ? (Date.parse(hours.at(-1).datetime) - Date.parse(hours[0].datetime)) / 864e5 : 0;
  const days = new Set(hours.map((hour) => dayKey(new Date(hour.datetime)))).size;
  if (horizonDays >= 9.5 && days >= 5) {
    let low = -10, high = 20, threshold = -10;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2), marked = hours.filter((hour) => hour.points >= middle), markedDays = new Set(marked.map((hour) => dayKey(new Date(hour.datetime))));
      if (marked.length >= 25 && markedDays.size >= 5) {
        threshold = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    return { mode: "10-Tage-Schwelle", horizonDays: Math.ceil(horizonDays), threshold, marked: hours.filter((hour) => hour.points >= threshold), days };
  }
  const count = options.count || 10;
  return { mode: "Verf\xFCgbarer Zeitraum", horizonDays: Math.max(0, Math.ceil(horizonDays)), threshold: null, marked: [...hours].sort((a, b) => b.points - a.points).slice(0, count), days };
}
function scoreForecast(forecast, context = {}) {
  const scored = forecast.map((hour) => ({ ...hour, ...scoreHour(hour, context) }));
  return { hours: scored, selection: selectRecommendations(scored, context) };
}

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
    this.status = "uninitialized";
  }
  disconnectedCallback() {
    this.requestId++;
  }
  setConfig(config = {}) {
    if (typeof config.entity !== "string" || !/^weather\.[\w-]+$/.test(config.entity)) throw Error("Bitte eine g\xFCltige weather-Entit\xE4t angeben.");
    const duration = Number(config.duration), refresh = Number(config.refresh_minutes);
    this.config = { title: "Laufwetter", location: "", debug: false, sun_entity: "sun.sun", warning_entity: "", ...config };
    this.config.duration = Number.isFinite(duration) && duration > 0 ? duration : 60;
    this.config.refresh_minutes = Number.isFinite(refresh) && refresh >= 5 ? refresh : 30;
    this.status = "waiting";
    this.error = "";
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;
    if (!hass) {
      this.status = "waiting";
      this.render();
      return;
    }
    const entity = hass.states?.[this.config.entity];
    if (!entity || ["unknown", "unavailable"].includes(entity.state)) {
      this.status = "entity-missing";
      this.error = `Wetter-Entit\xE4t ${this.config.entity} ist nicht verf\xFCgbar.`;
      this.render();
      return;
    }
    this.render();
    const refresh = this.config.refresh_minutes * 6e4;
    if (!this.loading && Date.now() - this.lastFetch >= refresh) this.fetchForecast();
  }
  async fetchForecast() {
    if (!this._hass?.callWS || !this.config) return;
    this.loading = true;
    this.status = "loading";
    this.lastFetch = Date.now();
    const requestId = this.requestId;
    this.render();
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
      this.status = this.forecast.length ? "ready" : "no-data";
    } catch (err) {
      if (requestId === this.requestId) {
        this.error = String(err.message || err);
        this.forecast = [];
        this.status = "service-error";
      }
    } finally {
      this.loading = false;
      this.render();
    }
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    const sun = this._hass?.states?.[this.config.sun_entity]?.attributes || {}, sunData = { sunrise: sun.next_rising, sunset: sun.next_setting };
    const now = Date.now(), future = this.forecast.filter((hour) => Date.parse(hour.datetime) >= now), scored = scoreForecast(future, { now, sun: sunData }), hours = scored.hours, selection = scored.selection, first = hours[0];
    const format = (dt) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(dt));
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const tint = (value) => value == null ? "#94a3b8" : value >= 10 ? "#22a06b" : value >= 4 ? "#88b65d" : value >= 0 ? "#e9b44c" : "#d66b61";
    const marked = new Set(selection.marked.map((hour) => hour.datetime));
    const best = selection.marked.filter((hour) => !hour.risks?.length).sort((a, b) => b.points - a.points)[0];
    const debug = this.config.debug ? `<details class="debug"><summary>Debug: Rohwerte, Einheiten, normalisierte Werte</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, units: this.units, sun: sunData, raw: this.rawForecast?.slice(0, 3), normalized: this.forecast.slice(0, 3) }, null, 2))}</pre></details>` : "";
    const markText = best ? format(best.datetime) : "Keine markierte Laufzeit";
    const statusText = { uninitialized: "Konfiguration wird initialisiert", waiting: "Warte auf Home-Assistant-Daten", loading: "Wetterprognose wird geladen", "entity-missing": this.error, "service-error": this.error, "no-data": "Keine st\xFCndliche Prognose verf\xFCgbar", ready: "" }[this.status] || "";
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{padding:20px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px);font-family:var(--primary-font-family,sans-serif)}.head,.summary,.metrics,.best,.timeline{display:flex;justify-content:space-between;align-items:center;gap:12px}.small{font-size:12px;color:var(--secondary-text-color)}h2{margin:4px 0;font-size:27px;color:${tint(first?.points)}}.summary strong{font-size:28px}.metrics{margin:20px 0;text-align:center}.metrics>div{flex:1}.metrics strong{display:block;margin-bottom:4px}.best{border-top:1px solid var(--divider-color);padding-top:14px}.bars{display:grid;grid-template-columns:repeat(auto-fit,minmax(5px,1fr));gap:2px;margin-top:16px}.bar{height:12px;border-radius:2px}.bar.marked{outline:2px solid var(--primary-color)}.timeline{margin-top:7px}.warning,.error{color:var(--error-color);font-size:12px;margin-top:10px}.debug{margin-top:12px}.debug pre{max-height:300px;overflow:auto;white-space:pre-wrap;font-size:11px}.legend{margin-top:8px}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div>${statusText ? `<div class="error" role="status">${esc(statusText)}</div>` : ""}<div class="summary"><div><span class="small">Laufwetter-Punktzahl</span><h2>${first ? first.points : "\u2013"} Punkte</h2><span class="small">${selection.mode} \xB7 ${selection.horizonDays} Tage verf\xFCgbar</span></div><strong>${selection.threshold == null ? "relativ" : "Schwelle " + selection.threshold}</strong></div><div class="small">${best ? "G\xFCnstiger als andere Stunden" : "Keine ausreichende Empfehlung im verf\xFCgbaren Zeitraum"}</div><div class="metrics"><div><strong>${first?.temperature != null ? Math.round(first.temperature) + " \xB0C" : "\u2013"}</strong><span class="small">Temperatur</span></div><div><strong>${first?.wind_speed != null ? Math.round(first.wind_speed) + " km/h" : "\u2013"}${first?.wind_gust_speed != null ? " / " + Math.round(first.wind_gust_speed) : ""}</strong><span class="small">Mittelwind / B\xF6en</span></div><div><strong>${first?.precipitation != null ? first.precipitation.toFixed(1) + " mm/h" : "\u2013"}${first?.precipitation_probability != null ? " \xB7 " + Math.round(first.precipitation_probability) + "%" : ""}</strong><span class="small">Menge / Wahrscheinlichkeit</span></div></div><div class="best"><span>Beste verf\xFCgbare Laufzeit</span><strong>${markText}</strong></div><div class="bars">${hours.map((hour) => `<div class="bar${marked.has(hour.datetime) ? " marked" : ""}" title="${esc(format(hour.datetime))}: ${hour.points} Punkte${hour.risks?.length ? " \xB7 " + hour.risks.join(", ") : ""}" style="background:${tint(hour.points)}"></div>`).join("")}</div><div class="legend small">Markierung = relative Empfehlung \xB7 ${hours.length} Stunden bewertet</div><div class="timeline small"><span>${hours[0] ? format(hours[0].datetime) : "\u2013"}</span><span>${hours[Math.floor(hours.length / 2)] ? format(hours[Math.floor(hours.length / 2)].datetime) : "\u2013"}</span><span>${hours.at(-1) ? format(hours.at(-1).datetime) : "\u2013"}</span></div>${first?.risks?.length ? `<div class="warning">Warnung: ${esc(first.risks.join(", "))}</div>` : ""}${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}<div class="small" style="margin-top:12px">Additive, relative Heuristik; keine Gleichheit mit laufwetter.de und keine amtliche Sicherheitsbewertung.</div>${debug}</ha-card>`;
  }
  getCardSize() {
    return 4;
  }
};
if (!customElements.get("laufwetter-card")) customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "laufwetter-card")) window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", description: "Eigenst\xE4ndiger relativer Laufwetter-Index" });
