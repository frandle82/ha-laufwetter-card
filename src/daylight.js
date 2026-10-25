const dayOfYear = date => Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);

export function daylightStatus(hour, config = {}) {
  if (String(hour.condition || "").toLowerCase() === "clear-night") return "night";
  const latitude = Number(config.latitude), longitude = Number(config.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return "unknown";
  const date = new Date(hour.datetime), declination = -23.44 * Math.cos(2 * Math.PI * (dayOfYear(date) + 10) / 365) * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180, cosine = -Math.tan(latitudeRadians) * Math.tan(declination);
  if (cosine >= 1) return "night";
  if (cosine <= -1) return "day";
  const daylightMinutes = Math.acos(cosine) * 720 / Math.PI;
  const noon = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12) - longitude * 240000;
  return date.getTime() < noon - daylightMinutes * 60000 || date.getTime() >= noon + daylightMinutes * 60000 ? "night" : "day";
}
