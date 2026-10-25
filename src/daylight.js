import { localParts } from "./time.js";

const dayOfYear = (year, month, day) => Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000);

const solarTimes = (value, config = {}) => {
  const latitude = Number(config.latitude), longitude = Number(config.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const parts = localParts(value, config.time_zone);
  if (!parts) return null;
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day), declination = -23.44 * Math.cos(2 * Math.PI * (dayOfYear(year, month, day) + 10) / 365) * Math.PI / 180;
  const cosine = -Math.tan(latitude * Math.PI / 180) * Math.tan(declination);
  if (cosine >= 1 || cosine <= -1) return { polar: cosine >= 1 ? "night" : "day" };
  const daylightMinutes = Math.acos(cosine) * 720 / Math.PI;
  const noon = Date.UTC(year, month - 1, day, 12) - longitude * 240000;
  return { sunrise: noon - daylightMinutes * 60000, sunset: noon + daylightMinutes * 60000 };
};

export function daylightStatus(hour, config = {}) {
  if (String(hour.condition || "").toLowerCase() === "clear-night") return "night";
  const times = solarTimes(hour.datetime, config);
  if (!times) return "unknown";
  if (times.polar) return times.polar;
  const time = Date.parse(hour.datetime);
  return time < times.sunrise || time >= times.sunset ? "night" : "day";
}

export function daylightPoints(hour, config = {}) {
  const status = daylightStatus(hour, config);
  if (status === "night") return -16;
  const times = solarTimes(hour.datetime, config);
  if (!times || times.polar) return null;
  const distance = Math.min(Math.abs(Date.parse(hour.datetime) - times.sunrise), Math.abs(Date.parse(hour.datetime) - times.sunset));
  return distance < 60 * 60000 ? 2 : distance < 120 * 60000 ? 1 : 0;
}
