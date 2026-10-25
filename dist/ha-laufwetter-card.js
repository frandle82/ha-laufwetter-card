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
  const daylight2 = daytimeBonus(hour, context.sun);
  if (daylight2 != null) points += daylight2;
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
  return { points: Math.round(points * 10) / 10, score: Math.round(points * 10) / 10, risks: [...new Set(risks)], weatherClass: weather, beaufort: bft, precipitationKnown: precipitation.known, daylightKnown: daylight2 != null };
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

// src/format.js
function formatDateTime(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "\u2013";
    return new Intl.DateTimeFormat("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  } catch {
    return "\u2013";
  }
}
function formatTime(value) {
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "\u2013";
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  } catch {
    return "\u2013";
  }
}

// src/windows.js
var dayKey2 = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};
function localDayOffset(value, offset = 0) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return dayKey2(date);
}
var daylight = (value, sun = {}) => {
  if (!sun.sunrise || !sun.sunset) return true;
  const date = new Date(value), sunrise = new Date(sun.sunrise), sunset = new Date(sun.sunset);
  return date >= sunrise && date < sunset;
};
function selectRunWindow(hours, { duration = 60, now = Date.now(), includePast = false, allowNightRuns = false, sun = {} } = {}) {
  const needed = Math.max(1, Math.ceil(Number(duration) / 60));
  const candidates = hours.filter((hour) => includePast || Date.parse(hour.datetime) >= now).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  let best = null;
  for (let index = 0; index <= candidates.length - needed; index++) {
    const window2 = candidates.slice(index, index + needed);
    if (window2.length < needed || window2.some((hour, i) => i && Date.parse(hour.datetime) - Date.parse(window2[i - 1].datetime) > 90 * 6e4)) continue;
    if (!allowNightRuns && window2.some((hour) => !daylight(hour.datetime, sun))) continue;
    const risks = [...new Set(window2.flatMap((hour) => hour.risks || []))];
    const average = window2.reduce((sum, hour) => sum + hour.points, 0) / window2.length;
    if (risks.length || average < 0) continue;
    const quality = risks.length ? -Infinity : average;
    if (!best || quality > best.quality) best = { hours: window2, average, risks, quality };
  }
  return best;
}
function qualityLabel(window2) {
  if (!window2) return "Ung\xFCnstig";
  if (window2.risks.length) return "Ung\xFCnstig";
  if (window2.average >= 15) return "Sehr gut";
  if (window2.average >= 8) return "Gut";
  if (window2.average >= 0) return "Eingeschr\xE4nkt";
  return "Ung\xFCnstig";
}
function daySummary(hours, options = {}) {
  const window2 = selectRunWindow(hours, options);
  const fallback = [...hours].sort((a, b) => b.points - a.points)[0];
  return { hours, window: window2, fallback, label: qualityLabel(window2) };
}

// src/card.js
var CARD_VERSION = "0.2.0";
var esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var tint = (points) => points == null ? "#94a3b8" : points >= 15 ? "#22a06b" : points >= 8 ? "#9aba57" : points >= 0 ? "#e9b44c" : "#d66b61";
var dayName = (value) => {
  try {
    return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(value));
  } catch {
    return "Unbekannter Tag";
  }
};
var rangeText = (window2) => window2 ? `${formatTime(window2.hours[0].datetime)}\u2013${formatTime(new Date(Date.parse(window2.hours.at(-1).datetime) + 60 * 6e4))} Uhr` : "Kein empfehlenswertes Zeitfenster";
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
    if (!config?.entity) throw Error("Bitte eine weather-Entit\xE4t angeben.");
    this.config = { title: "Laufwetter", location: "", duration: 60, refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", allow_night_runs: false, ...config };
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
    const entity = typeof this.config.entity === "string" ? this.config.entity.trim() : "";
    const state = this._hass.states?.[entity];
    if (!/^weather\.[^.]+$/.test(entity)) {
      this.error = `Ung\xFCltige Wetter-Entit\xE4t: ${entity}`;
      this.render();
      return;
    }
    if (!state) {
      this.error = `Die Wetter-Entit\xE4t ${entity} wurde nicht gefunden oder ist nicht verf\xFCgbar.`;
      this.render();
      return;
    }
    if (["unavailable", "unknown"].includes(state.state)) {
      this.error = `Die Wetter-Entit\xE4t ${entity} ist nicht verf\xFCgbar.`;
      this.render();
      return;
    }
    if (this.loading) return;
    this.loading = true;
    this.lastFetch = Date.now();
    const requestId = ++this.requestId;
    try {
      const result = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: entity }, return_response: true });
      if (requestId !== this.requestId) return;
      const raw = (result?.response || result)?.[entity]?.forecast;
      if (!Array.isArray(raw)) throw Error("Keine st\xFCndliche Prognose verf\xFCgbar.");
      this.rawForecast = raw;
      this.units = unitSnapshot(this._hass, entity);
      const warning = this.config.warning_entity ? this._hass.states?.[this.config.warning_entity] : null;
      const warningText = warning && !["off", "unknown", "unavailable"].includes(warning.state) ? String(warning.attributes?.friendly_name || warning.state) : "";
      this.forecast = normalizeForecast(raw, this.units).map((hour) => ({ ...hour, warning: warningText }));
      this.error = "";
    } catch (error) {
      if (requestId === this.requestId) this.error = String(error.message || error);
    } finally {
      if (requestId === this.requestId) {
        this.loading = false;
        this.render();
      }
    }
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    const sun = this._hass?.states?.[this.config.sun_entity]?.attributes || {};
    const now = Date.now();
    const scored = scoreForecast(this.forecast, { now, sun: { sunrise: sun.next_rising, sunset: sun.next_setting } });
    const todayKey = localDayOffset(now), tomorrowKey = localDayOffset(now, 1);
    const today = scored.hours.filter((hour) => localDayOffset(hour.datetime) === todayKey && Date.parse(hour.datetime) >= now);
    const tomorrow = scored.hours.filter((hour) => localDayOffset(hour.datetime) === tomorrowKey);
    const sunOptions = { sun: { sunrise: sun.next_rising, sunset: sun.next_setting }, allowNightRuns: this.config.allow_night_runs };
    const todaySummary = daySummary(today, { ...sunOptions, duration: this.config.duration, now });
    const tomorrowSummary = daySummary(tomorrow, { duration: this.config.duration, includePast: true });
    const metrics = (window2) => {
      if (!window2?.length) return "Keine Daten";
      const values = (key) => window2.map((hour) => hour[key]).filter((value) => value != null);
      const temperatures = values("temperature"), winds = values("wind_speed"), gusts = values("wind_gust_speed"), rain = values("precipitation");
      const temp = temperatures.length ? Math.min(...temperatures) === Math.max(...temperatures) ? `${Math.round(temperatures[0])} \xB0C` : `${Math.round(Math.min(...temperatures))}\u2013${Math.round(Math.max(...temperatures))} \xB0C` : "\u2013";
      return `${temp} \xB7 ${winds.length ? Math.round(Math.max(...winds)) + " km/h Wind" : "\u2013 Wind"}${gusts.length ? " \xB7 " + Math.round(Math.max(...gusts)) + " km/h B\xF6en" : ""} \xB7 ${rain.length ? Math.max(...rain).toFixed(1) + " mm/h Regen" : "\u2013 Regen"}`;
    };
    const marked = new Set(todaySummary.window?.hours.map((hour) => hour.datetime) || []);
    const chart = today.map((hour) => `<div class="chart-hour"><div class="bar${marked.has(hour.datetime) ? " recommended" : ""}" title="${esc(formatDateTime(hour.datetime))}: ${hour.points} \xB7 ${esc(hour.risks?.join(", ") || "Laufen m\xF6glich")}" style="height:${Math.max(8, Math.min(100, 36 + hour.points * 3))}%;background:${tint(hour.points)}"></div><span>${new Date(hour.datetime).getHours()}</span></div>`).join("");
    const debug = this.config.debug ? `<details><summary>Debug</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, units: this.units, raw: this.rawForecast?.slice(0, 3), normalized: this.forecast.slice(0, 3), error: this.error }, null, 2))}</pre></details>` : "";
    this.shadowRoot.innerHTML = `<style>:host{display:block}ha-card{display:block;padding:18px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,12px);font-family:var(--primary-font-family,sans-serif)}h2{margin:0;font-size:18px}.head,.window,.metrics,.tomorrow{display:flex;justify-content:space-between;gap:12px;align-items:center}.small{font-size:12px;color:var(--secondary-text-color)}.section{padding:10px 0;border-bottom:1px solid var(--divider-color)}.window{padding:5px 0}.window strong{display:block;font-size:18px}.metrics{justify-content:flex-start;margin-top:4px;font-size:13px}.chart{display:flex;align-items:end;gap:4px;overflow-x:auto;height:122px;margin:16px 0 4px}.chart-hour{height:100%;min-width:22px;display:flex;flex-direction:column;align-items:center;justify-content:end;gap:5px;font-size:11px}.bar{width:100%;min-height:8px;border-radius:3px 3px 0 0}.bar.recommended{outline:2px solid var(--primary-color);outline-offset:2px}.error{color:var(--error-color);margin-top:12px;font-size:13px}details{margin-top:12px}pre{max-height:240px;overflow:auto;font-size:11px;white-space:pre-wrap}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div><div class="section"><h2>Heute \xB7 ${today.length ? esc(dayName(today[0].datetime)) : "keine Prognose"}</h2><div class="window"><strong>${todaySummary.window ? esc(rangeText(todaySummary.window)) : "Heute keine empfehlenswerte Laufzeit."}</strong></div><div class="metrics">${metrics(todaySummary.window?.hours || [])}</div></div><div class="chart" aria-label="St\xFCndliche Wetterqualit\xE4t heute">${chart || "<span class='small'>Keine zuk\xFCnftigen Stunden verf\xFCgbar.</span>"}</div><div class="section"><h2>Morgen \xB7 ${tomorrow[0] ? esc(dayName(tomorrow[0].datetime)) : "keine Prognose"}</h2><div class="window"><strong>${tomorrowSummary.window ? esc(rangeText(tomorrowSummary.window)) : "Keine empfehlenswerte Laufzeit."}</strong></div><div class="metrics">${metrics(tomorrowSummary.window?.hours || [])}</div></div>${this.loading ? `<div class="small">Prognose wird geladen \u2026</div>` : ""}${this.error ? `<div class="error">${esc(this.error)}</div>` : ""}${debug}</ha-card>`;
  }
  getCardSize() {
    return 4;
  }
};
customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Konkrete Laufzeiten f\xFCr heute und morgen" });
