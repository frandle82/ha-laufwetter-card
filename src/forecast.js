const finite = value => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
export function normalizeForecast(forecast, units = {}) {
  const temperatureUnit = units.temperature || "°C", windUnit = units.wind_speed || "km/h";
  const toCelsius = value => { const number = finite(value); return number == null ? null : temperatureUnit === "°F" ? (number - 32) * 5 / 9 : number; };
  const toKmh = value => { const number = finite(value); if (number == null) return null; return windUnit === "mph" ? number * 1.609344 : windUnit === "m/s" ? number * 3.6 : windUnit === "kn" ? number * 1.852 : number; };
  return (forecast || []).filter(item => item?.datetime && Number.isFinite(Date.parse(item.datetime))).map(item => ({
    datetime: item.datetime, temperature: toCelsius(item.temperature), precipitation_probability: finite(item.precipitation_probability), precipitation: finite(item.precipitation),
    wind_speed: toKmh(item.wind_speed), wind_gust_speed: toKmh(item.wind_gust_speed), humidity: finite(item.humidity), uv_index: finite(item.uv_index), condition: String(item.condition || "")
  })).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
}
export function unitSnapshot(hass, entityId) {
  const attrs = hass?.states?.[entityId]?.attributes || {};
  return { temperature: attrs.temperature_unit || hass?.config?.unit_system?.temperature || "°C", wind_speed: attrs.wind_speed_unit || hass?.config?.unit_system?.wind_speed || "km/h", precipitation: attrs.precipitation_unit || "mm" };
}
