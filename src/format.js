export function formatDateTime(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("de-DE", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  } catch {
    return "–";
  }
}
