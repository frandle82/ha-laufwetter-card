// Additive, relative heuristic inspired by the public methodology at laufwetter.de/wie_und_warum/.
const finite = value => Number.isFinite(value) ? value : null;
const dayKey = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const hourKey = date => `${dayKey(date)}-${date.getHours()}`;
const weatherStates = {
  clear: "sun", "clear-night": "night", cloudy: "cloud", fog: "fog", hail: "hail", lightning: "storm", "lightning-rainy": "storm", partlycloudy: "sun", pouring: "rain", rainy: "rain", snowy: "snow", "snowy-rainy": "freezing-rain", sunny: "sun", windy: "wind", "windy-variant": "wind", exceptional: "exceptional"
};
const beaufort = kmh => kmh == null ? null : kmh < 1 ? 0 : kmh < 6 ? 1 : kmh < 12 ? 2 : kmh < 20 ? 3 : kmh < 29 ? 4 : kmh < 39 ? 5 : kmh < 50 ? 6 : kmh < 62 ? 7 : kmh < 75 ? 8 : kmh < 89 ? 9 : kmh < 103 ? 10 : kmh < 118 ? 11 : 12;
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
export function scoreHour(hour = {}, context = {}) {
  const temperature = finite(hour.temperature), humidity = finite(hour.humidity), wind = finite(hour.wind_speed), gust = finite(hour.wind_gust_speed);
  const weather = weatherStates[String(hour.condition || "").toLowerCase()] || "unknown", date = new Date(hour.datetime), now = context.now ? new Date(context.now) : new Date();
  let points = date.toDateString() === now.toDateString() ? 2 : date.toDateString() === new Date(now.getTime() + 86400000).toDateString() ? 1 : 0;
  const daylight = daytimeBonus(hour, context.sun); if (daylight != null) points += daylight;
  if (temperature != null) points += temperature < 15 ? temperature / 2 : temperature <= 19 ? 10 : 6 - 2 * (temperature - 19);
  if (humidity != null) points -= humidity / 10;
  const bft = beaufort(wind);
  if (bft != null && bft >= 3) points += temperature != null && temperature < 15 ? -bft : temperature != null && temperature <= 19 ? -1 : bft <= 4 ? 1 : 0;
  const precipitation = precipitationPoints(hour, weather); points += precipitation.points;
  if (weather === "sun" && temperature != null) points += temperature <= 19 ? 4 : -8;
  if (weather === "snow" || weather === "freezing-rain") points -= 8;
  if (weather === "storm" || weather === "exceptional") points -= 16;
  const risks = [];
  if (weather === "storm" || weather === "exceptional") risks.push("Gewitter oder Unwetter");
  if (gust != null && gust >= 65) risks.push("Sturm- oder Orkanböen"); else if (gust != null && gust >= 45) risks.push("starke Böen");
  if (weather === "snow" || weather === "freezing-rain") risks.push("mögliche Glätte");
  if (temperature != null && (temperature <= -10 || temperature >= 35)) risks.push("extreme Temperatur");
  if (hour.precipitation != null && hour.precipitation > 2) risks.push("Starkregen");
  if (hour.warning) risks.push(hour.warning);
  return { points: Math.round(points * 10) / 10, score: Math.round(points * 10) / 10, risks: [...new Set(risks)], weatherClass: weather, beaufort: bft, precipitationKnown: precipitation.known, daylightKnown: daylight != null };
}
export function selectRecommendations(hours, options = {}) {
  const horizonDays = hours.length ? (Date.parse(hours.at(-1).datetime) - Date.parse(hours[0].datetime)) / 86400000 : 0;
  const days = new Set(hours.map(hour => dayKey(new Date(hour.datetime)))).size;
  if (horizonDays >= 9.5 && days >= 5) {
    let low = -10, high = 20, threshold = -10;
    while (low <= high) { const middle = Math.floor((low + high) / 2), marked = hours.filter(hour => hour.points >= middle), markedDays = new Set(marked.map(hour => dayKey(new Date(hour.datetime)))); if (marked.length >= 25 && markedDays.size >= 5) { threshold = middle; low = middle + 1; } else high = middle - 1; }
    return { mode: "10-Tage-Schwelle", horizonDays: Math.ceil(horizonDays), threshold, marked: hours.filter(hour => hour.points >= threshold), days };
  }
  const count = options.count || 10;
  return { mode: "Verfügbarer Zeitraum", horizonDays: Math.max(0, Math.ceil(horizonDays)), threshold: null, marked: [...hours].sort((a, b) => b.points - a.points).slice(0, count), days };
}
export function scoreForecast(forecast, context = {}) { const scored = forecast.map(hour => ({ ...hour, ...scoreHour(hour, context) })); return { hours: scored, selection: selectRecommendations(scored, context) }; }
