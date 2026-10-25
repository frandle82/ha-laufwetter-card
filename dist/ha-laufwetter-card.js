// src/time.js
var formatter = (timeZone, options) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, ...options });
  } catch {
    return new Intl.DateTimeFormat("en-CA", options);
  }
};
function localParts(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = formatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}
function localDayKey(value, timeZone) {
  const parts = localParts(value, timeZone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}
function localDayOffset(value, offset = 0, timeZone) {
  const parts = localParts(value, timeZone);
  if (!parts) return "";
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function localHour(value, timeZone) {
  return localParts(value, timeZone)?.hour || "\u2013";
}

// src/scoring.js
var finite = (value) => Number.isFinite(value) ? value : null;
var dayKey = (date, timeZone) => localDayKey(date, timeZone);
var hourKey = (date, timeZone) => `${dayKey(date, timeZone)}-${localParts(date, timeZone)?.hour}`;
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
function daytimeBonus(hour, sun = {}, timeZone) {
  const date = new Date(hour.datetime), sunrise = sun.sunrise ? new Date(sun.sunrise) : null, sunset = sun.sunset ? new Date(sun.sunset) : null;
  if (sunrise && hourKey(date, timeZone) === hourKey(sunrise, timeZone) || sunset && hourKey(date, timeZone) === hourKey(sunset, timeZone)) return 2;
  if (sunrise && dayKey(date, timeZone) === dayKey(sunrise, timeZone) && Math.abs(Number(localParts(date, timeZone)?.hour) - Number(localParts(sunrise, timeZone)?.hour)) === 1 || sunset && dayKey(date, timeZone) === dayKey(sunset, timeZone) && Math.abs(Number(localParts(date, timeZone)?.hour) - Number(localParts(sunset, timeZone)?.hour)) === 1) return 1;
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
  const components = { proximity: dayKey(date, context.timeZone) === dayKey(now, context.timeZone) ? 2 : dayKey(date, context.timeZone) === localDayOffset(now, 1, context.timeZone) ? 1 : 0 };
  let points = components.proximity;
  const daylight2 = context.daylightPoints ? context.daylightPoints(hour) : daytimeBonus(hour, context.sun, context.timeZone);
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
  const days = new Set(hours.map((hour) => dayKey(new Date(hour.datetime), options.timeZone))).size;
  const selectThreshold = (minimumHours2, minimumDays2) => {
    let low = -10, high = 20, threshold = -10;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2), marked = hours.filter((hour) => hour.points > middle), markedDays = new Set(marked.map((hour) => dayKey(new Date(hour.datetime), options.timeZone)));
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
function formatDateTime(value, timeZone) {
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
      hour12: false,
      timeZone
    }).format(date);
  } catch {
    return "\u2013";
  }
}
function formatTime(value, timeZone) {
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "\u2013";
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date);
  } catch {
    return "\u2013";
  }
}

// src/windows.js
var localDayOffset2 = (value, dayOffset = 0, timeZone) => localDayOffset(value, dayOffset, timeZone);
var daylight = (value, sun = {}) => {
  if (!sun.sunrise || !sun.sunset) return true;
  const date = new Date(value), sunrise = new Date(sun.sunrise), sunset = new Date(sun.sunset);
  return date >= sunrise && date < sunset;
};
var severeRisk = (risk) => /Gewitter|Unwetter|Sturm- oder Orkanböen|mögliche Glätte|extreme Temperatur|Starkregen/.test(risk);
var hasSevereRisk = (hour) => Boolean(hour.warning) || (hour.risks || []).some(severeRisk);
function analyzeRunWindows(hours, { duration = 60, now = Date.now(), includePast = false, allowNightRuns = false, excludeSevereRisks = true, requireMarked = false, sun = {}, daylightStatus: getDaylightStatus, timeZone } = {}) {
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
    if (excludeSevereRisks && (severe.length || window2.some(hasSevereRisk))) {
      exclusions.push({ ...details, reason: severe.length ? severe.join(", ") : "offizielle Wetterwarnung" });
      continue;
    }
    const quality = average;
    if (!best || quality > best.quality) best = { hours: window2, average, risks, quality };
  }
  const suitable = (hour) => (allowNightRuns || (getDaylightStatus ? getDaylightStatus(hour) !== "night" : daylight(hour.datetime, sun))) && (!requireMarked || hour.marked) && (!excludeSevereRisks || !hasSevereRisk(hour));
  const groups = [];
  let group = null;
  for (const hour of candidates) {
    if (!suitable(hour)) {
      group = null;
      continue;
    }
    const previous = group?.at(-1), consecutive = previous && Date.parse(hour.datetime) - Date.parse(previous.datetime) <= 90 * 6e4 && localDayOffset2(hour.datetime, 0, timeZone) === localDayOffset2(previous.datetime, 0, timeZone);
    if (consecutive) group.push(hour);
    else {
      group = [hour];
      groups.push(group);
    }
  }
  const windows = groups.filter((group2) => group2.length >= needed).map((group2) => {
    const risks = [...new Set(group2.flatMap((hour) => hour.risks || []))];
    const average = group2.reduce((sum, hour) => sum + hour.points, 0) / group2.length;
    return { hours: group2, average, risks, quality: average };
  });
  return { window: best, windows, exclusions };
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
  return { hours, window: window2, windows: analysis.windows, fallback, label: qualityLabel(window2), exclusions: analysis.exclusions, reason: analysis.exclusions[0]?.reason || "keine zusammenh\xE4ngende, relativ markierte Laufzeit" };
}

// src/daylight.js
var dayOfYear = (year, month, day) => Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 864e5);
var solarTimes = (value, config = {}) => {
  const latitude = Number(config.latitude), longitude = Number(config.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const parts = localParts(value, config.time_zone);
  if (!parts) return null;
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day), declination = -23.44 * Math.cos(2 * Math.PI * (dayOfYear(year, month, day) + 10) / 365) * Math.PI / 180;
  const cosine = -Math.tan(latitude * Math.PI / 180) * Math.tan(declination);
  if (cosine >= 1 || cosine <= -1) return { polar: cosine >= 1 ? "night" : "day" };
  const daylightMinutes = Math.acos(cosine) * 720 / Math.PI;
  const noon = Date.UTC(year, month - 1, day, 12) - longitude * 24e4;
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
.timeline-section{padding:10px 0;border-bottom:1px solid var(--divider-color)}.timeline-heading{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;font-size:12px;font-weight:600}.timeline-heading time{font-weight:400;color:var(--secondary-text-color)}.timeline{display:flex;align-items:flex-start;gap:3px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;touch-action:pan-x;margin:0 -2px;padding:0 2px 3px;scrollbar-width:thin}.timeline-hour{flex:0 0 auto;min-width:24px;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:10px;line-height:1}.timeline-hour--day-start{border-left:1px solid var(--divider-color);padding-left:5px;margin-left:3px}.timeline-bar{width:100%;height:34px;box-sizing:border-box;border-radius:4px}.timeline-label{color:var(--secondary-text-color)}.timeline-legend{display:flex;flex-wrap:wrap;justify-content:space-between;gap:3px 8px;margin-top:8px;font-size:10px;color:var(--secondary-text-color)}.timeline-legend span::before{content:"";display:inline-block;width:7px;height:7px;margin-right:3px;border-radius:2px;background:currentColor}.legend-night{color:#8b95a5}.legend-bad{color:#d66b61}.legend-ok{color:#e9b44c}.legend-best{color:#22a06b}
.state{margin-top:8px;font-size:12px}.state--error{color:var(--error-color)}details{margin-top:10px}.debug p{font-size:11px;line-height:1.4}.debug-table{max-height:280px;overflow:auto;border:1px solid var(--divider-color)}table{border-collapse:collapse;font-size:10px;white-space:nowrap}th,td{padding:4px 6px;text-align:left;vertical-align:top;border-bottom:1px solid var(--divider-color)}th{position:sticky;top:0;background:var(--ha-card-background,var(--card-background-color));font-weight:600}small{color:var(--secondary-text-color)}@media(max-width:360px){ha-card{padding:12px}.day-summary__window{font-size:17px}.timeline-hour{min-width:22px}}
`;

// src/card.js
var CARD_VERSION = "0.2.0";
var esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var dayName = (value, timeZone) => {
  try {
    return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone }).format(new Date(value));
  } catch {
    return "Unbekannter Tag";
  }
};
var shortDate = (value, timeZone) => {
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", timeZone }).format(new Date(value));
  } catch {
    return "";
  }
};
var rangeText = (window2, timeZone) => `${formatTime(window2.hours[0].datetime, timeZone)}\u2013${formatTime(new Date(Date.parse(window2.hours.at(-1).datetime) + 60 * 6e4), timeZone)} Uhr`;
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
var renderDaySummary = (label, hours, summary, message, timeZone) => {
  const summaryHours = summary.windows.flatMap((window2) => window2.hours);
  return `<section class="day-summary"><ha-icon class="weather-icon" icon="${weatherIcon(summaryHours.length ? summaryHours : hours)}"></ha-icon><h2 class="day-summary__title">${label} \xB7 ${hours.length ? esc(dayName(hours[0].datetime, timeZone)) : "keine Prognose"}</h2><div class="day-summary__window">${esc(summary.windows.length ? summary.windows.map((window2) => rangeText(window2, timeZone)).join(", ") : message)}</div><div class="day-summary__metrics">${esc(metrics(summaryHours.length ? summaryHours : hours))}</div></section>`;
};
var timelineColor = (hour, selected, isNight) => selected.has(hour.datetime) ? "#22a06b" : hour.marked ? "#e9b44c" : isNight(hour) ? "#8b95a5" : "#d66b61";
var renderTimeline = (hours, selected, isNight, timeZone) => `<section class="timeline-section"><div class="timeline-heading"><span>Laufbedingungen</span>${hours[0] ? `<time class="timeline-date">${esc(shortDate(hours[0].datetime, timeZone))}</time>` : ""}</div><div class="timeline" aria-label="St\xFCndliche Wetterqualit\xE4t heute und kommende Tage">${hours.length ? hours.map((hour, index) => `<div class="timeline-hour${index === 0 || localDayKey(hour.datetime, timeZone) !== localDayKey(hours[index - 1].datetime, timeZone) ? " timeline-hour--day-start" : ""}" data-date="${esc(shortDate(hour.datetime, timeZone))}" data-datetime="${esc(hour.datetime)}"><div class="timeline-bar" title="${esc(formatDateTime(hour.datetime, timeZone))}: ${esc(hour.risks?.join(", ") || "Laufen m\xF6glich")}" style="background:${timelineColor(hour, selected, isNight)}"></div><span class="timeline-label">${localHour(hour.datetime, timeZone)}</span></div>`).join("") : "<span class='meta'>Keine zuk\xFCnftigen Stunden verf\xFCgbar.</span>"}</div><div class="timeline-legend" aria-label="Legende"><span class="legend-night">Nacht</span><span class="legend-bad">Ung\xFCnstig</span><span class="legend-ok">M\xF6glich</span><span class="legend-best">Empfohlen</span></div></section>`;
var debugValue = (value) => value == null || value === "" ? "\u2013" : String(value);
var debugClass = (hour, selected) => selected.has(hour.datetime) ? "Empfohlen" : hour.marked ? "M\xF6glich" : "Ung\xFCnstig (Schwelle)";
var debugReason = (hour, summaries) => {
  const instant = Date.parse(hour.datetime);
  const exclusion = summaries.flatMap((summary) => summary.exclusions || []).find((item) => instant >= Date.parse(item.start) && instant <= Date.parse(item.end));
  return exclusion?.reason || (hour.marked ? "relativ markiert, nicht bestes Fenster" : "Score nicht \xFCber Schwelle");
};
var renderDebug = ({ entity, units, timeZone, scoredResult, hours, selected, daylight: daylight2, summaries, rawForecast, error, scrollTrace }) => {
  const raw = new Map((rawForecast || []).map((hour) => [hour.datetime, hour]));
  const rows = hours.map((hour) => {
    const source = raw.get(hour.datetime) || {}, components = Object.entries(hour.components || {}).map(([key, value]) => `${key}: ${debugValue(value)}`).join(", ");
    return `<tr><td>${esc(formatDateTime(hour.datetime, timeZone))}<br><small>${esc(hour.datetime)}</small></td><td>${esc(debugValue(source.temperature))} \u2192 ${esc(debugValue(hour.temperature))}</td><td>${esc(debugValue(source.apparent_temperature))}</td><td>${esc(debugValue(source.wind_speed))} \u2192 ${esc(debugValue(hour.wind_speed))}</td><td>${esc(debugValue(source.wind_gust_speed))} \u2192 ${esc(debugValue(hour.wind_gust_speed))}</td><td>${esc(debugValue(source.precipitation))} \u2192 ${esc(debugValue(hour.precipitation))}</td><td>${esc(debugValue(source.precipitation_probability))}</td><td>${esc(debugValue(hour.humidity))}</td><td>${esc(debugValue(source.condition))} / ${esc(debugValue(hour.weatherClass))} / ${esc(daylight2(hour))}</td><td>${esc(components)}</td><td>${esc(debugValue(hour.points))}</td><td>${esc(debugClass(hour, selected))}</td><td>${esc(debugReason(hour, summaries))}</td></tr>`;
  }).join("");
  return `<details class="debug"><summary>Debug: Datenfluss und Stundenbewertung</summary><p>Entit\xE4t: ${esc(entity)} \xB7 Zeitzone: ${esc(timeZone || "Browser")} \xB7 Auswahl: ${esc(scoredResult.selection.mode)} \xB7 Schwelle: ${esc(scoredResult.selection.threshold)} \xB7 Einheiten: ${esc(JSON.stringify(units || {}))}</p><p>Diagramm: ${esc((scrollTrace || []).map((item) => `${item.event}: left=${item.left}, width=${item.width}, viewport=${item.viewport}, sichtbar=${item.first || "\u2013"}\u2026${item.last || "\u2013"}`).join(" \u2192 ") || "noch kein Scroll-Ereignis")}</p><div class="debug-table"><table><thead><tr><th>Zeit (lokal / UTC)</th><th>Temperatur roh \u2192 norm.</th><th>Gef\xFChlt roh</th><th>Wind roh \u2192 norm.</th><th>B\xF6en roh \u2192 norm.</th><th>Regen roh \u2192 norm.</th><th>Regenwahr.</th><th>Feuchte</th><th>Wetter / Klasse / Licht</th><th>Komponenten</th><th>Score</th><th>Status</th><th>Grund</th></tr></thead><tbody>${rows}</tbody></table></div>${error ? `<p>Fehler: ${esc(error)}</p>` : ""}</details>`;
};
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
    this.timelineAnchor = null;
    this.timelineTouched = false;
    this.scored = null;
    this.timelineFrame = null;
    this.scrollTrace = [];
  }
  visibleTimeline(timeline) {
    const blocks = [...timeline?.querySelectorAll?.(".timeline-hour") || []], left = timeline?.scrollLeft || 0, right = left + (timeline?.clientWidth || 0);
    const visible = blocks.filter((block) => block.offsetLeft + block.offsetWidth > left && (!timeline.clientWidth || block.offsetLeft < right));
    return { blocks, first: visible[0], last: visible.at(-1) };
  }
  traceScroll(event, timeline) {
    if (!this.config?.debug) return;
    const visible = this.visibleTimeline(timeline);
    this.scrollTrace = [...this.scrollTrace.slice(-11), { event, left: Math.round(timeline?.scrollLeft ?? this.timelineScrollLeft), width: timeline?.scrollWidth || 0, viewport: timeline?.clientWidth || 0, first: visible.first?.dataset?.datetime || "", last: visible.last?.dataset?.datetime || "" }];
  }
  rememberTimeline(timeline) {
    if (!timeline) return;
    this.timelineScrollLeft = timeline.scrollLeft;
    const first = this.visibleTimeline(timeline).first;
    if (first?.dataset?.datetime) this.timelineAnchor = { datetime: first.dataset.datetime, offset: first.offsetLeft - timeline.scrollLeft };
  }
  disconnectedCallback() {
    this.requestId++;
    if (this.timelineFrame !== null && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(this.timelineFrame);
  }
  setConfig(config) {
    if (!config?.entity) throw Error("Bitte eine weather-Entit\xE4t angeben.");
    this.config = { title: "Laufwetter", location: "", show_location: false, duration: 60, refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", allow_night_runs: false, ...config };
    this.scored = null;
    this.render();
  }
  set hass(hass) {
    const previous = this._hass;
    this._hass = hass;
    if (!this.config) return;
    const entity = String(this.config.entity || "").trim(), warning = this.config.warning_entity;
    if (!previous || previous.config !== hass.config || previous.states?.[entity] !== hass.states?.[entity] || warning && previous.states?.[warning] !== hass.states?.[warning]) this.render();
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
    this.rememberTimeline(timeline);
    this.traceScroll("render-capture", timeline);
    if (this.timelineFrame !== null && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(this.timelineFrame);
    this.timelineFrame = null;
  }
  updateTimelineDate(timeline) {
    this.rememberTimeline(timeline);
    const block = [...timeline.querySelectorAll?.(".timeline-hour") || []].find((hour) => hour.offsetLeft + hour.offsetWidth > timeline.scrollLeft);
    const date = this.shadowRoot?.querySelector?.(".timeline-date");
    if (block && date) date.textContent = block.dataset.date;
  }
  bindTimeline() {
    const timeline = this.shadowRoot?.querySelector?.(".timeline");
    if (!timeline) return;
    const blocks = [...timeline.querySelectorAll?.(".timeline-hour") || []];
    const anchor = this.timelineTouched && this.timelineAnchor ? blocks.find((block) => block.dataset.datetime === this.timelineAnchor.datetime) || blocks.find((block) => Date.parse(block.dataset.datetime) >= Date.parse(this.timelineAnchor.datetime)) || blocks.at(-1) : null;
    timeline.scrollLeft = anchor ? anchor.offsetLeft - this.timelineAnchor.offset : this.timelineScrollLeft;
    this.traceScroll("render-restore", timeline);
    this.updateTimelineDate(timeline);
    if (timeline._laufwetterBound) return;
    timeline._laufwetterBound = true;
    timeline.addEventListener?.("scroll", () => {
      this.rememberTimeline(timeline);
      this.traceScroll("scroll", timeline);
      if (this.timelineFrame !== null) return;
      const update = () => {
        this.timelineFrame = null;
        this.updateTimelineDate(timeline);
      };
      if (globalThis.requestAnimationFrame) this.timelineFrame = globalThis.requestAnimationFrame(update);
      else update();
    });
    const touched = (event) => {
      this.timelineTouched = true;
      this.traceScroll(event.type, timeline);
    };
    timeline.addEventListener?.("pointerdown", touched);
    timeline.addEventListener?.("wheel", touched, { passive: true });
  }
  keepTimeline() {
    const previous = this.timeline;
    const current = this.shadowRoot?.querySelector?.(".timeline");
    if (!previous || !current || previous === current || typeof current.replaceWith !== "function") {
      this.timeline = current;
      return;
    }
    previous.innerHTML = current.innerHTML;
    current.replaceWith(previous);
    this.timeline = previous;
  }
  buildView() {
    const now = Date.now(), timeZone = this._hass?.config?.time_zone, daylight2 = (hour) => daylightStatus(hour, this._hass?.config);
    const scoringDay = localDayOffset2(now, 0, timeZone);
    if (!this.scored || this.scored.day !== scoringDay) this.scored = { day: scoringDay, result: scoreForecast(this.forecast, { now, timeZone, daylightPoints: (hour) => daylightPoints(hour, this._hass?.config) }) };
    const scoredResult = this.scored.result;
    const markedHours = new Set(scoredResult.selection.marked.map((hour) => hour.datetime));
    const hours = scoredResult.hours.map((hour) => ({ ...hour, marked: markedHours.has(hour.datetime) }));
    const todayKey = localDayOffset2(now, 0, timeZone), tomorrowKey = localDayOffset2(now, 1, timeZone);
    const today = hours.filter((hour) => localDayOffset2(hour.datetime, 0, timeZone) === todayKey), tomorrow = hours.filter((hour) => localDayOffset2(hour.datetime, 0, timeZone) === tomorrowKey);
    const options = { daylightStatus: daylight2, allowNightRuns: true, excludeSevereRisks: false, requireMarked: true, duration: this.config.duration, timeZone };
    const todayFullSummary = daySummary(today, { ...options, includePast: true });
    const todaySummary = daySummary(today, { ...options, now });
    const tomorrowSummary = daySummary(tomorrow, { ...options, includePast: true });
    const historyAvailable = today.some((hour) => Date.parse(hour.datetime) <= now - Number(this.config.duration) * 6e4);
    const todayMessage = !today.length ? "Heute keine Prognose verf\xFCgbar." : todaySummary.windows.length ? "" : todayFullSummary.windows.length && historyAvailable ? "Alle empfohlenen Laufzeiten f\xFCr heute sind vorbei." : "Heute keine empfohlenen Laufzeiten.";
    const tomorrowMessage = !tomorrow.length ? "Morgen keine Prognose verf\xFCgbar." : "Morgen keine empfohlenen Laufzeiten.";
    const selected = new Set([...todaySummary.windows, ...tomorrowSummary.windows].flatMap((window2) => window2.hours).map((hour) => hour.datetime));
    return { daylight: daylight2, timeZone, scoredResult, hours, today, tomorrow, todayFullSummary, todaySummary, tomorrowSummary, todayMessage, tomorrowMessage, selected, chartHours: hours.filter((hour) => Date.parse(hour.datetime) >= now) };
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    this.captureTimelineScroll();
    const { daylight: daylight2, timeZone, scoredResult, hours, today, tomorrow, todayFullSummary, todaySummary, tomorrowSummary, todayMessage, tomorrowMessage, selected, chartHours } = this.buildView();
    const debug = this.config.debug ? renderDebug({ entity: this.config.entity, units: this.units, timeZone, scoredResult, hours, selected, daylight: daylight2, summaries: [todayFullSummary, todaySummary, tomorrowSummary], rawForecast: this.rawForecast, error: this.error, scrollTrace: this.scrollTrace }) : "";
    this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style><ha-card>${renderHeader(this.config)}${renderDaySummary("Heute", today, todaySummary, todayMessage, timeZone)}${renderTimeline(chartHours, selected, (hour) => daylight2(hour) === "night", timeZone)}${renderDaySummary("Morgen", tomorrow, tomorrowSummary, tomorrowMessage, timeZone)}${this.loading ? `<div class="state meta">Prognose wird geladen \u2026</div>` : ""}${this.error ? `<div class="state state--error">${esc(this.error)}</div>` : ""}${debug}</ha-card>`;
    this.keepTimeline();
    this.bindTimeline();
  }
  getCardSize() {
    return 4;
  }
};
customElements.define("laufwetter-card", LaufwetterCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Konkrete Laufzeiten f\xFCr heute und morgen" });
