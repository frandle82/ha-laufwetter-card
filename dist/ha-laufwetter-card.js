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
  const components = { proximity: date.toDateString() === now.toDateString() ? 2 : date.toDateString() === new Date(now.getTime() + 864e5).toDateString() ? 1 : 0 };
  let points = components.proximity;
  const daylight2 = context.daylightPoints ? context.daylightPoints(hour) : daytimeBonus(hour, context.sun);
  components.daylight = daylight2;
  if (daylight2 != null) points += daylight2;
  components.temperature = temperature == null ? null : temperature < 15 ? temperature / 2 : temperature <= 19 ? 10 : 6 - 2 * (temperature - 19);
  if (components.temperature != null) points += components.temperature;
  components.humidity = humidity == null ? null : -humidity / 10;
  if (components.humidity != null) points += components.humidity;
  const bft = beaufort(wind);
  components.wind = bft != null && bft >= 3 ? temperature != null && temperature < 15 ? -bft : temperature != null && temperature <= 19 ? -1 : bft <= 4 ? 1 : 0 : 0;
  points += components.wind;
  const precipitation = precipitationPoints(hour, weather);
  components.precipitation = precipitation.points;
  points += components.precipitation;
  components.weather = weather === "sun" && temperature != null ? temperature <= 19 ? 4 : -8 : weather === "snow" || weather === "freezing-rain" ? -8 : weather === "storm" || weather === "exceptional" ? -16 : 0;
  points += components.weather;
  const risks = [];
  if (weather === "storm" || weather === "exceptional") risks.push("Gewitter oder Unwetter");
  if (gust != null && gust >= 65) risks.push("Sturm- oder Orkanb\xF6en");
  else if (gust != null && gust >= 45) risks.push("starke B\xF6en");
  if (weather === "snow" || weather === "freezing-rain") risks.push("m\xF6gliche Gl\xE4tte");
  if (temperature != null && (temperature <= -10 || temperature >= 35)) risks.push("extreme Temperatur");
  if (hour.precipitation != null && hour.precipitation > 2) risks.push("Starkregen");
  if (hour.warning) risks.push(hour.warning);
  return { points: Math.round(points * 10) / 10, score: Math.round(points * 10) / 10, components, risks: [...new Set(risks)], weatherClass: weather, beaufort: bft, precipitationKnown: precipitation.known, daylightKnown: daylight2 != null };
}
function selectRecommendations(hours, options = {}) {
  const horizonDays = hours.length ? (Date.parse(hours.at(-1).datetime) - Date.parse(hours[0].datetime)) / 864e5 : 0;
  const days = new Set(hours.map((hour) => dayKey(new Date(hour.datetime)))).size;
  const selectThreshold = (minimumHours2, minimumDays2) => {
    let low = -10, high = 20, threshold = -10;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2), marked = hours.filter((hour) => hour.points > middle), markedDays = new Set(marked.map((hour) => dayKey(new Date(hour.datetime))));
      if (marked.length >= minimumHours2 && markedDays.size >= minimumDays2) {
        threshold = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    return { threshold, marked: hours.filter((hour) => hour.points > threshold) };
  };
  if (horizonDays >= 9.5 && days >= 5) {
    const selection2 = selectThreshold(25, 5);
    return { mode: "10-Tage-Schwelle", horizonDays: Math.ceil(horizonDays), days, ...selection2 };
  }
  const minimumDays = Math.min(5, days), minimumHours = Math.min(hours.length, Math.max(1, minimumDays * 5));
  const selection = selectThreshold(minimumHours, minimumDays);
  return { mode: "Kurzfrist-Schwelle", horizonDays: Math.max(0, Math.ceil(horizonDays)), days, minimumHours, minimumDays, ...selection };
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
var severeRisk = (risk) => /Gewitter|Unwetter|Sturm- oder Orkanböen|mögliche Glätte|extreme Temperatur|Starkregen/.test(risk);
var hasSevereRisk = (hour) => Boolean(hour.warning) || (hour.risks || []).some(severeRisk);
function analyzeRunWindows(hours, { duration = 60, now = Date.now(), includePast = false, allowNightRuns = false, requireMarked = false, sun = {}, daylightStatus: getDaylightStatus } = {}) {
  const needed = Math.max(1, Math.ceil(Number(duration) / 60));
  const candidates = hours.filter((hour) => includePast || Date.parse(hour.datetime) >= now).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  let best = null;
  const exclusions = [];
  for (let index = 0; index <= candidates.length - needed; index++) {
    const window2 = candidates.slice(index, index + needed);
    const details = { start: window2[0]?.datetime, end: window2.at(-1)?.datetime };
    if (window2.length < needed || window2.some((hour, i) => i && Date.parse(hour.datetime) - Date.parse(window2[i - 1].datetime) > 90 * 6e4)) {
      exclusions.push({ ...details, reason: "nicht zusammenh\xE4ngend" });
      continue;
    }
    if (!allowNightRuns && window2.some((hour) => getDaylightStatus ? getDaylightStatus(hour) === "night" : !daylight(hour.datetime, sun))) {
      exclusions.push({ ...details, reason: "Nacht" });
      continue;
    }
    if (requireMarked && window2.some((hour) => !hour.marked)) {
      exclusions.push({ ...details, reason: "nicht relativ markiert" });
      continue;
    }
    const risks = [...new Set(window2.flatMap((hour) => hour.risks || []))];
    const average = window2.reduce((sum, hour) => sum + hour.points, 0) / window2.length;
    const severe = risks.filter(severeRisk);
    if (severe.length || window2.some(hasSevereRisk)) {
      exclusions.push({ ...details, reason: severe.length ? severe.join(", ") : "offizielle Wetterwarnung" });
      continue;
    }
    const quality = average;
    if (!best || quality > best.quality) best = { hours: window2, average, risks, quality };
  }
  return { window: best, exclusions };
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
  const analysis = analyzeRunWindows(hours, options), window2 = analysis.window;
  const fallback = [...hours].sort((a, b) => b.points - a.points)[0];
  return { hours, window: window2, fallback, label: qualityLabel(window2), exclusions: analysis.exclusions, reason: analysis.exclusions[0]?.reason || "keine zusammenh\xE4ngende, relativ markierte Laufzeit" };
}

// src/daylight.js
var dayOfYear = (date) => Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 864e5);
var solarTimes = (value, config = {}) => {
  const latitude = Number(config.latitude), longitude = Number(config.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const date = new Date(value), declination = -23.44 * Math.cos(2 * Math.PI * (dayOfYear(date) + 10) / 365) * Math.PI / 180;
  const cosine = -Math.tan(latitude * Math.PI / 180) * Math.tan(declination);
  if (cosine >= 1 || cosine <= -1) return { polar: cosine >= 1 ? "night" : "day" };
  const daylightMinutes = Math.acos(cosine) * 720 / Math.PI;
  const noon = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) - longitude * 24e4;
  return { sunrise: noon - daylightMinutes * 6e4, sunset: noon + daylightMinutes * 6e4 };
};
function daylightStatus(hour, config = {}) {
  if (String(hour.condition || "").toLowerCase() === "clear-night") return "night";
  const times = solarTimes(hour.datetime, config);
  if (!times) return "unknown";
  if (times.polar) return times.polar;
  const time = Date.parse(hour.datetime);
  return time < times.sunrise || time >= times.sunset ? "night" : "day";
}
function daylightPoints(hour, config = {}) {
  const status = daylightStatus(hour, config);
  if (status === "night") return -16;
  const times = solarTimes(hour.datetime, config);
  if (!times || times.polar) return null;
  const distance = Math.min(Math.abs(Date.parse(hour.datetime) - times.sunrise), Math.abs(Date.parse(hour.datetime) - times.sunset));
  return distance < 60 * 6e4 ? 2 : distance < 120 * 6e4 ? 1 : 0;
}

// src/card-styles.js
var CARD_STYLES = `
:host{display:block}ha-card{display:block;padding:14px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,12px);font-family:var(--primary-font-family,sans-serif)}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:1px solid var(--divider-color)}.card-title{font-size:16px;font-weight:600;line-height:1.25}.header-icon,.weather-icon{width:18px;height:18px;color:var(--secondary-text-color)}.location,.meta{font-size:12px;color:var(--secondary-text-color)}.location{display:block;margin-top:2px}
.day-summary{position:relative;padding:10px 0;border-bottom:1px solid var(--divider-color)}.day-summary__title{margin:0;font-size:13px;font-weight:600;line-height:1.3}.day-summary__window{margin-top:4px;font-size:18px;font-weight:600;line-height:1.3}.day-summary__metrics{margin-top:3px;padding-right:24px;font-size:12px;color:var(--secondary-text-color);line-height:1.4}.weather-icon{position:absolute;right:0;top:13px}
.timeline-section{padding:10px 0;border-bottom:1px solid var(--divider-color)}.timeline-heading{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:12px;font-weight:600}.timeline-heading time{font-weight:400;color:var(--secondary-text-color)}.timeline{display:flex;align-items:flex-start;gap:3px;overflow-x:auto;margin:0 -2px;padding:0 2px 3px;scroll-snap-type:x proximity}.timeline-hour{min-width:24px;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:10px;line-height:1;scroll-snap-align:start}.timeline-hour--day-start{border-left:1px solid var(--divider-color);padding-left:5px;margin-left:3px}.timeline-bar{width:100%;height:34px;box-sizing:border-box;border-radius:4px}.timeline-label{color:var(--secondary-text-color)}.timeline-legend{display:flex;flex-wrap:wrap;justify-content:space-between;gap:3px 8px;margin-top:8px;font-size:10px;color:var(--secondary-text-color)}.timeline-legend span::before{content:"";display:inline-block;width:7px;height:7px;margin-right:3px;border-radius:2px;background:currentColor}.legend-night{color:#8b95a5}.legend-bad{color:#d66b61}.legend-ok{color:#e9b44c}.legend-best{color:#22a06b}
.state{margin-top:8px;font-size:12px}.state--error{color:var(--error-color)}details{margin-top:10px}pre{max-height:240px;overflow:auto;font-size:11px;white-space:pre-wrap}@media(max-width:360px){ha-card{padding:12px}.day-summary__window{font-size:17px}.timeline-hour{min-width:22px}}
`;

// src/card.js
var CARD_VERSION = "0.2.0";
var esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var dayName = (value) => {
  try {
    return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(value));
  } catch {
    return "Unbekannter Tag";
  }
};
var shortDate = (value) => {
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long" }).format(new Date(value));
  } catch {
    return "";
  }
};
var rangeText = (window2) => `${formatTime(window2.hours[0].datetime)}\u2013${formatTime(new Date(Date.parse(window2.hours.at(-1).datetime) + 60 * 6e4))} Uhr`;
var metrics = (hours) => {
  if (!hours?.length) return "Keine Daten";
  const values = (key) => hours.map((hour) => hour[key]).filter((value) => value != null);
  const temperatures = values("temperature"), winds = values("wind_speed"), gusts = values("wind_gust_speed"), rain = values("precipitation");
  const temp = temperatures.length ? Math.min(...temperatures) === Math.max(...temperatures) ? `${Math.round(temperatures[0])} \xB0C` : `${Math.round(Math.min(...temperatures))}\u2013${Math.round(Math.max(...temperatures))} \xB0C` : "\u2013";
  return `${temp} \xB7 ${winds.length ? `${Math.round(Math.max(...winds))} km/h Wind` : "\u2013 Wind"}${gusts.length ? ` \xB7 ${Math.round(Math.max(...gusts))} km/h B\xF6en` : ""} \xB7 ${rain.length ? `${Math.max(...rain).toFixed(1)} mm/h Regen` : "\u2013 Regen"}`;
};
var weatherIcon = (hours) => {
  const condition = String(hours?.[0]?.condition || "").toLowerCase();
  if (condition.includes("lightning")) return "mdi:weather-lightning";
  if (condition.includes("rain")) return "mdi:weather-rainy";
  if (condition.includes("snow")) return "mdi:weather-snowy";
  if (condition.includes("cloud")) return "mdi:weather-cloudy";
  return "mdi:weather-partly-cloudy";
};
var renderHeader = (config) => `<header class="card-header"><div><div class="card-title">${esc(config.title)}</div>${config.show_location && config.location ? `<span class="location">${esc(config.location)}</span>` : ""}</div><ha-icon class="header-icon" icon="mdi:run"></ha-icon></header>`;
var renderDaySummary = (label, hours, summary, message) => {
  const summaryHours = summary.window?.hours || hours;
  return `<section class="day-summary"><ha-icon class="weather-icon" icon="${weatherIcon(summaryHours)}"></ha-icon><h2 class="day-summary__title">${label} \xB7 ${hours.length ? esc(dayName(hours[0].datetime)) : "keine Prognose"}</h2><div class="day-summary__window">${esc(summary.window ? rangeText(summary.window) : message)}</div><div class="day-summary__metrics">${esc(metrics(summaryHours))}</div></section>`;
};
var timelineColor = (hour, selected, isNight) => isNight(hour) ? "#8b95a5" : hasSevereRisk(hour) || !hour.marked ? "#d66b61" : selected.has(hour.datetime) ? "#22a06b" : "#e9b44c";
var renderTimeline = (hours, selected, isNight) => `<section class="timeline-section"><div class="timeline-heading"><span>Laufbedingungen</span>${hours[0] ? `<time class="timeline-date">${esc(shortDate(hours[0].datetime))}</time>` : ""}</div><div class="timeline" aria-label="St\xFCndliche Wetterqualit\xE4t heute und kommende Tage">${hours.length ? hours.map((hour, index) => `<div class="timeline-hour${index === 0 || new Date(hour.datetime).getDate() !== new Date(hours[index - 1].datetime).getDate() ? " timeline-hour--day-start" : ""}" data-date="${esc(shortDate(hour.datetime))}"><div class="timeline-bar" title="${esc(formatDateTime(hour.datetime))}: ${esc(hour.risks?.join(", ") || "Laufen m\xF6glich")}" style="background:${timelineColor(hour, selected, isNight)}"></div><span class="timeline-label">${new Date(hour.datetime).getHours()}</span></div>`).join("") : "<span class='meta'>Keine zuk\xFCnftigen Stunden verf\xFCgbar.</span>"}</div><div class="timeline-legend" aria-label="Legende"><span class="legend-night">Nacht</span><span class="legend-bad">Ung\xFCnstig</span><span class="legend-ok">M\xF6glich</span><span class="legend-best">Empfohlen</span></div></section>`;
var LaufwetterCard = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.forecast = [];
    this.error = "";
    this.loading = false;
    this.lastFetch = 0;
    this.requestId = 0;
    this.timelineScrollLeft = 0;
    this.scored = null;
    this.timelineFrame = null;
  }
  disconnectedCallback() {
    this.requestId++;
    if (this.timelineFrame && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(this.timelineFrame);
  }
  setConfig(config) {
    if (!config?.entity) throw Error("Bitte eine weather-Entit\xE4t angeben.");
    this.config = { title: "Laufwetter", location: "", show_location: false, duration: 60, refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", allow_night_runs: false, ...config };
    this.scored = null;
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
    const entity = typeof this.config.entity === "string" ? this.config.entity.trim() : "", state = this._hass.states?.[entity];
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
      this.scored = null;
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
  captureTimelineScroll() {
    const timeline = this.shadowRoot?.querySelector?.(".timeline");
    if (timeline) this.timelineScrollLeft = timeline.scrollLeft;
  }
  updateTimelineDate(timeline) {
    this.timelineScrollLeft = timeline.scrollLeft;
    const block = [...timeline.querySelectorAll?.(".timeline-hour") || []].find((hour) => hour.offsetLeft + hour.offsetWidth > timeline.scrollLeft);
    const date = this.shadowRoot?.querySelector?.(".timeline-date");
    if (block && date) date.textContent = block.dataset.date;
  }
  bindTimeline() {
    const timeline = this.shadowRoot?.querySelector?.(".timeline");
    if (!timeline) return;
    timeline.scrollLeft = this.timelineScrollLeft;
    this.updateTimelineDate(timeline);
    timeline.addEventListener?.("scroll", () => {
      if (this.timelineFrame) return;
      const update = () => {
        this.timelineFrame = null;
        this.updateTimelineDate(timeline);
      };
      if (globalThis.requestAnimationFrame) this.timelineFrame = globalThis.requestAnimationFrame(update);
      else update();
    });
  }
  buildView() {
    const now = Date.now(), daylight2 = (hour) => daylightStatus(hour, this._hass?.config);
    const scoringDay = localDayOffset(now);
    if (!this.scored || this.scored.day !== scoringDay) this.scored = { day: scoringDay, result: scoreForecast(this.forecast, { now, daylightPoints: (hour) => daylightPoints(hour, this._hass?.config) }) };
    const scoredResult = this.scored.result;
    const markedHours = new Set(scoredResult.selection.marked.map((hour) => hour.datetime));
    const hours = scoredResult.hours.map((hour) => ({ ...hour, marked: markedHours.has(hour.datetime) }));
    const todayKey = localDayOffset(now), tomorrowKey = localDayOffset(now, 1);
    const today = hours.filter((hour) => localDayOffset(hour.datetime) === todayKey), tomorrow = hours.filter((hour) => localDayOffset(hour.datetime) === tomorrowKey);
    const options = { daylightStatus: daylight2, allowNightRuns: this.config.allow_night_runs, requireMarked: true, duration: this.config.duration };
    const todayFullSummary = daySummary(today, { ...options, includePast: true });
    const todaySummary = daySummary(today, { ...options, now });
    const tomorrowSummary = daySummary(tomorrow, { ...options, includePast: true });
    const historyAvailable = today.some((hour) => Date.parse(hour.datetime) <= now - Number(this.config.duration) * 6e4);
    const todayMessage = !today.length ? "Heute keine Prognose verf\xFCgbar." : todaySummary.window ? "" : todayFullSummary.window && historyAvailable ? "Alle empfohlenen Laufzeiten f\xFCr heute sind vorbei." : "Heute keine empfohlenen Laufzeiten.";
    const tomorrowMessage = !tomorrow.length ? "Morgen keine Prognose verf\xFCgbar." : "Morgen keine empfohlenen Laufzeiten.";
    const selected = new Set([...todaySummary.window?.hours || [], ...tomorrowSummary.window?.hours || []].map((hour) => hour.datetime));
    return { daylight: daylight2, scoredResult, hours, today, tomorrow, todayFullSummary, todaySummary, tomorrowSummary, todayMessage, tomorrowMessage, selected, chartHours: hours.filter((hour) => Date.parse(hour.datetime) >= now) };
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    this.captureTimelineScroll();
    const { daylight: daylight2, scoredResult, hours, today, tomorrow, todayFullSummary, todaySummary, tomorrowSummary, todayMessage, tomorrowMessage, selected, chartHours } = this.buildView();
    const debug = this.config.debug ? `<details><summary>Debug</summary><pre>${esc(JSON.stringify({ entity: this.config.entity, threshold: scoredResult.selection.threshold, selection: scoredResult.selection.mode, exclusions: { todayFull: todayFullSummary.exclusions, todayAvailable: todaySummary.exclusions, tomorrow: tomorrowSummary.exclusions }, hours: hours.map((hour) => ({ datetime: hour.datetime, temperature: hour.temperature, wind_speed: hour.wind_speed, precipitation: hour.precipitation, humidity: hour.humidity, condition: hour.condition, daylight: daylight2(hour), components: hour.components, score: hour.points, marked: hour.marked, selected: selected.has(hour.datetime) })), error: this.error }, null, 2))}</pre></details>` : "";
    this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style><ha-card>${renderHeader(this.config)}${renderDaySummary("Heute", today, todaySummary, todayMessage)}${renderTimeline(chartHours, selected, (hour) => daylight2(hour) === "night")}${renderDaySummary("Morgen", tomorrow, tomorrowSummary, tomorrowMessage)}${this.loading ? `<div class="state meta">Prognose wird geladen \u2026</div>` : ""}${this.error ? `<div class="state state--error">${esc(this.error)}</div>` : ""}${debug}</ha-card>`;
    this.bindTimeline();
  }
  getCardSize() {
    return 4;
  }
};
customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Konkrete Laufzeiten f\xFCr heute und morgen" });
