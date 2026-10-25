export function formatDateTime(value, timeZone) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
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
    return "–";
  }
}

export function formatTime(value, timeZone) {
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "–";
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date);
  } catch {
    return "–";
  }
}
