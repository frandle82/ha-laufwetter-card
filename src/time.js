const formatter = (timeZone, options) => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone, ...options }); } catch { return new Intl.DateTimeFormat("en-CA", options); }
};

export function localParts(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = formatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

export function localDayKey(value, timeZone) {
  const parts = localParts(value, timeZone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

export function localDayOffset(value, offset = 0, timeZone) {
  const parts = localParts(value, timeZone);
  if (!parts) return "";
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function localHour(value, timeZone) { return localParts(value, timeZone)?.hour || "–"; }
