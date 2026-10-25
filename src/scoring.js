export const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const finite = value => Number.isFinite(value) ? value : null;
function band(value, idealMin, idealMax, low, high) { if (!Number.isFinite(value)) return null; if (value >= idealMin && value <= idealMax) return 100; return value < idealMin ? clamp(100 * (value - low) / (idealMin - low)) : clamp(100 * (high - value) / (high - idealMax)); }
function riskList(hour) {
  const condition = String(hour.condition || "").toLowerCase(), risks = [];
  if (/lightning|thunder|hail|storm|exceptional/.test(condition)) risks.push("Gewitter oder Unwetter");
  if (finite(hour.wind_gust_speed) >= 65) risks.push("Sturm- oder Orkanböen"); else if (finite(hour.wind_gust_speed) >= 45) risks.push("starke Böen");
  if (finite(hour.temperature) <= -10 || finite(hour.temperature) >= 35) risks.push("extreme Temperatur");
  if (/ice|icy|freezing|glaze|frost|snow/.test(condition) || (finite(hour.temperature) <= 1 && finite(hour.precipitation) > 0)) risks.push("mögliche Glätte");
  if (finite(hour.precipitation) >= 4) risks.push("Starkregen"); if (hour.warning) risks.push(hour.warning);
  return [...new Set(risks)];
}
export function scoreHour(hour = {}) {
  const temperature = finite(hour.temperature), rain = finite(hour.precipitation), probability = finite(hour.precipitation_probability), wind = finite(hour.wind_speed), humidity = finite(hour.humidity), uv = finite(hour.uv_index);
  const factors = { temperature: band(temperature, 5, 15, -15, 30), rain: rain == null ? probability == null ? null : clamp(100 - probability * 0.25) : clamp(100 - rain * 22), wind: wind == null ? null : band(wind, 0, 18, 0, 55), humidity: band(humidity, 35, 70, 10, 100), uv: uv == null ? null : clamp(100 - Math.max(0, uv - 3) * 18) };
  const weights = { temperature: 0.35, rain: 0.25, wind: 0.2, humidity: 0.12, uv: 0.08 }, available = Object.keys(factors).filter(key => factors[key] != null);
  if (!available.length) return { comfort: null, score: null, risks: [], recommendation: "Keine Daten", factors, uncertainty: true };
  const total = available.reduce((sum, key) => sum + weights[key], 0); let comfort = available.reduce((sum, key) => sum + factors[key] * weights[key], 0) / total;
  const risks = riskList(hour); if (risks.some(risk => /Gewitter|Sturm|extreme|Starkregen|Glätte|Unwetter/.test(risk))) comfort = Math.min(comfort, 20);
  const uncertainty = rain == null && probability != null;
  return { comfort: Math.round(clamp(comfort)), score: Math.round(clamp(comfort)), risks, factors, coverage: Math.round(total * 100), uncertainty, recommendation: risks.length ? "Wetterbedingt nicht empfohlen" : comfort >= 80 ? "Sehr gute Bedingungen" : comfort >= 65 ? "Gute Bedingungen" : comfort >= 45 ? "Laufen möglich" : "Nur eingeschränkt empfehlenswert", explanation: risks[0] || (uncertainty ? "Niederschlagsmenge fehlt; Regenbewertung unsicher" : comfort >= 65 ? "Ausgewogene Laufbedingungen" : "Komfort durch Wetterfaktoren eingeschränkt") };
}
export function bestWindows(hours, durations = [30, 45, 60, 90, 120]) {
  return durations.map(duration => { const slots = Math.max(1, Math.ceil(duration / 60)), candidates = [];
    for (let index = 0; index <= hours.length - slots; index++) { const slice = hours.slice(index, index + slots); if (slice.some(hour => hour.comfort == null)) continue; if (slice.some((hour, i) => i && Date.parse(hour.datetime) - Date.parse(slice[i - 1].datetime) !== 3600000)) continue; const risks = [...new Set(slice.flatMap(hour => hour.risks || []))], comfort = Math.round(slice.reduce((sum, hour) => sum + hour.comfort, 0) / slice.length); candidates.push({ duration, start: slice[0].datetime, end: new Date(Date.parse(slice[0].datetime) + duration * 60000).toISOString(), comfort, risks, recommended: !risks.length && comfort >= 45 }); }
    return candidates.sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.comfort - a.comfort)[0] || null;
  });
}
export const scoreLabel = score => score == null ? "Keine Daten" : score >= 80 ? "Sehr gut" : score >= 65 ? "Gut" : score >= 45 ? "Mäßig" : "Ungünstig";
