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

export function selectRunWindow(hours, { duration = 60, now = Date.now(), includePast = false } = {}) {
  const needed = Math.max(1, Math.ceil(Number(duration) / 60));
  const candidates = hours.filter(hour => includePast || Date.parse(hour.datetime) >= now)
    .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  let best = null;
  for (let index = 0; index <= candidates.length - needed; index++) {
    const window = candidates.slice(index, index + needed);
    if (window.length < needed || window.some((hour, i) => i && Date.parse(hour.datetime) - Date.parse(window[i - 1].datetime) > 90 * 60000)) continue;
    const risks = [...new Set(window.flatMap(hour => hour.risks || []))];
    const average = window.reduce((sum, hour) => sum + hour.points, 0) / window.length;
    const quality = risks.length ? -Infinity : average;
    if (!best || quality > best.quality) best = { hours: window, average, risks, quality };
  }
  return best;
}

export function qualityLabel(window) {
  if (!window) return "Ungünstig";
  if (window.risks.length) return "Ungünstig";
  if (window.average >= 15) return "Sehr gut";
  if (window.average >= 8) return "Gut";
  if (window.average >= 0) return "Eingeschränkt";
  return "Ungünstig";
}

export function daySummary(hours, options = {}) {
  const window = selectRunWindow(hours, options);
  return { hours, window, label: qualityLabel(window) };
}
