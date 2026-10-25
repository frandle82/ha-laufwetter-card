const dayKey = value => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export function localDayOffset(value, offset = 0) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return dayKey(date);
}

const daylight = (value, sun = {}) => {
  if (!sun.sunrise || !sun.sunset) return true;
  const date = new Date(value), sunrise = new Date(sun.sunrise), sunset = new Date(sun.sunset);
  return date >= sunrise && date < sunset;
};

export const severeRisk = risk => /Gewitter|Unwetter|Sturm- oder Orkanböen|mögliche Glätte|extreme Temperatur|Starkregen/.test(risk);
export const hasSevereRisk = hour => Boolean(hour.warning) || (hour.risks || []).some(severeRisk);

export function analyzeRunWindows(hours, { duration = 60, now = Date.now(), includePast = false, allowNightRuns = false, requireMarked = false, sun = {}, daylightStatus: getDaylightStatus } = {}) {
  const needed = Math.max(1, Math.ceil(Number(duration) / 60));
  const candidates = hours.filter(hour => includePast || Date.parse(hour.datetime) >= now)
    .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  let best = null; const exclusions = [];
  for (let index = 0; index <= candidates.length - needed; index++) {
    const window = candidates.slice(index, index + needed);
    const details = { start: window[0]?.datetime, end: window.at(-1)?.datetime };
    if (window.length < needed || window.some((hour, i) => i && Date.parse(hour.datetime) - Date.parse(window[i - 1].datetime) > 90 * 60000)) { exclusions.push({ ...details, reason: "nicht zusammenhängend" }); continue; }
    if (!allowNightRuns && window.some(hour => getDaylightStatus ? getDaylightStatus(hour) === "night" : !daylight(hour.datetime, sun))) { exclusions.push({ ...details, reason: "Nacht" }); continue; }
    if (requireMarked && window.some(hour => !hour.marked)) { exclusions.push({ ...details, reason: "nicht relativ markiert" }); continue; }
    const risks = [...new Set(window.flatMap(hour => hour.risks || []))];
    const average = window.reduce((sum, hour) => sum + hour.points, 0) / window.length;
    const severe = risks.filter(severeRisk);
    if (severe.length || window.some(hasSevereRisk)) { exclusions.push({ ...details, reason: severe.length ? severe.join(", ") : "offizielle Wetterwarnung" }); continue; }
    const quality = average;
    if (!best || quality > best.quality) best = { hours: window, average, risks, quality };
  }
  return { window: best, exclusions };
}

export function selectRunWindow(hours, options = {}) { return analyzeRunWindows(hours, options).window; }

export function qualityLabel(window) {
  if (!window) return "Ungünstig";
  if (window.risks.length) return "Ungünstig";
  if (window.average >= 15) return "Sehr gut";
  if (window.average >= 8) return "Gut";
  if (window.average >= 0) return "Eingeschränkt";
  return "Ungünstig";
}

export function daySummary(hours, options = {}) {
  const analysis = analyzeRunWindows(hours, options), window = analysis.window;
  const fallback = [...hours].sort((a, b) => b.points - a.points)[0];
  return { hours, window, fallback, label: qualityLabel(window), exclusions: analysis.exclusions, reason: analysis.exclusions[0]?.reason || "keine zusammenhängende, relativ markierte Laufzeit" };
}
