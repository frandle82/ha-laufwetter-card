import { scoreForecast } from "./scoring.js";
import { normalizeForecast, unitSnapshot } from "./forecast.js";
import { formatDateTime, formatTime } from "./format.js";
import { daySummary, localDayOffset } from "./windows.js";
import { daylightPoints, daylightStatus } from "./daylight.js";
import { CARD_STYLES } from "./card-styles.js";
import { localDayKey, localHour } from "./time.js";

const CARD_VERSION = "0.2.0";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dayName = (value, timeZone) => { try { return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone }).format(new Date(value)); } catch { return "Unbekannter Tag"; } };
const shortDate = (value, timeZone) => { try { return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", timeZone }).format(new Date(value)); } catch { return ""; } };
const rangeText = (window, timeZone) => `${formatTime(window.hours[0].datetime, timeZone)}–${formatTime(new Date(Date.parse(window.hours.at(-1).datetime) + 60 * 60000), timeZone)} Uhr`;

const metrics = hours => {
  if (!hours?.length) return "Keine Daten";
  const values = key => hours.map(hour => hour[key]).filter(value => value != null);
  const temperatures = values("temperature"), winds = values("wind_speed"), gusts = values("wind_gust_speed"), rain = values("precipitation");
  const temp = temperatures.length ? Math.min(...temperatures) === Math.max(...temperatures) ? `${Math.round(temperatures[0])} °C` : `${Math.round(Math.min(...temperatures))}–${Math.round(Math.max(...temperatures))} °C` : "–";
  return `${temp} · ${winds.length ? `${Math.round(Math.max(...winds))} km/h Wind` : "– Wind"}${gusts.length ? ` · ${Math.round(Math.max(...gusts))} km/h Böen` : ""} · ${rain.length ? `${Math.max(...rain).toFixed(1)} mm/h Regen` : "– Regen"}`;
};

const weatherIcon = hours => {
  const condition = String(hours?.[0]?.condition || "").toLowerCase();
  if (condition.includes("lightning")) return "mdi:weather-lightning";
  if (condition.includes("rain")) return "mdi:weather-rainy";
  if (condition.includes("snow")) return "mdi:weather-snowy";
  if (condition.includes("cloud")) return "mdi:weather-cloudy";
  return "mdi:weather-partly-cloudy";
};
const renderHeader = config => `<header class="card-header"><div><div class="card-title">${esc(config.title)}</div>${config.show_location && config.location ? `<span class="location">${esc(config.location)}</span>` : ""}</div><ha-icon class="header-icon" icon="mdi:run"></ha-icon></header>`;
const renderDaySummary = (label, hours, summary, message, timeZone) => {
  const summaryHours = summary.window?.hours || hours;
  return `<section class="day-summary"><ha-icon class="weather-icon" icon="${weatherIcon(summaryHours)}"></ha-icon><h2 class="day-summary__title">${label} · ${hours.length ? esc(dayName(hours[0].datetime, timeZone)) : "keine Prognose"}</h2><div class="day-summary__window">${esc(summary.window ? rangeText(summary.window, timeZone) : message)}</div><div class="day-summary__metrics">${esc(metrics(summaryHours))}</div></section>`;
};
const timelineColor = (hour, selected, isNight) => selected.has(hour.datetime) ? "#22a06b" : hour.marked ? "#e9b44c" : isNight(hour) ? "#8b95a5" : "#d66b61";
const renderTimeline = (hours, selected, isNight, timeZone) => `<section class="timeline-section"><div class="timeline-heading"><span>Laufbedingungen</span>${hours[0] ? `<time class="timeline-date">${esc(shortDate(hours[0].datetime, timeZone))}</time>` : ""}</div><div class="timeline" aria-label="Stündliche Wetterqualität heute und kommende Tage">${hours.length ? hours.map((hour, index) => `<div class="timeline-hour${index === 0 || localDayKey(hour.datetime, timeZone) !== localDayKey(hours[index - 1].datetime, timeZone) ? " timeline-hour--day-start" : ""}" data-date="${esc(shortDate(hour.datetime, timeZone))}" data-datetime="${esc(hour.datetime)}"><div class="timeline-bar" title="${esc(formatDateTime(hour.datetime, timeZone))}: ${esc(hour.risks?.join(", ") || "Laufen möglich")}" style="background:${timelineColor(hour, selected, isNight)}"></div><span class="timeline-label">${localHour(hour.datetime, timeZone)}</span></div>`).join("") : "<span class='meta'>Keine zukünftigen Stunden verfügbar.</span>"}</div><div class="timeline-legend" aria-label="Legende"><span class="legend-night">Nacht</span><span class="legend-bad">Ungünstig</span><span class="legend-ok">Möglich</span><span class="legend-best">Empfohlen</span></div></section>`;
const debugValue = value => value == null || value === "" ? "–" : String(value);
const debugClass = (hour, selected) => selected.has(hour.datetime) ? "Empfohlen" : hour.marked ? "Möglich" : "Ungünstig (Schwelle)";
const debugReason = (hour, summaries) => {
  const instant = Date.parse(hour.datetime);
  const exclusion = summaries.flatMap(summary => summary.exclusions || []).find(item => instant >= Date.parse(item.start) && instant <= Date.parse(item.end));
  return exclusion?.reason || (hour.marked ? "relativ markiert, nicht bestes Fenster" : "Score nicht über Schwelle");
};
const renderDebug = ({ entity, units, timeZone, scoredResult, hours, selected, daylight, summaries, rawForecast, error, scrollTrace }) => {
  const raw = new Map((rawForecast || []).map(hour => [hour.datetime, hour]));
  const rows = hours.map(hour => {
    const source = raw.get(hour.datetime) || {}, components = Object.entries(hour.components || {}).map(([key, value]) => `${key}: ${debugValue(value)}`).join(", ");
    return `<tr><td>${esc(formatDateTime(hour.datetime, timeZone))}<br><small>${esc(hour.datetime)}</small></td><td>${esc(debugValue(source.temperature))} → ${esc(debugValue(hour.temperature))}</td><td>${esc(debugValue(source.apparent_temperature))}</td><td>${esc(debugValue(source.wind_speed))} → ${esc(debugValue(hour.wind_speed))}</td><td>${esc(debugValue(source.wind_gust_speed))} → ${esc(debugValue(hour.wind_gust_speed))}</td><td>${esc(debugValue(source.precipitation))} → ${esc(debugValue(hour.precipitation))}</td><td>${esc(debugValue(source.precipitation_probability))}</td><td>${esc(debugValue(hour.humidity))}</td><td>${esc(debugValue(source.condition))} / ${esc(debugValue(hour.weatherClass))} / ${esc(daylight(hour))}</td><td>${esc(components)}</td><td>${esc(debugValue(hour.points))}</td><td>${esc(debugClass(hour, selected))}</td><td>${esc(debugReason(hour, summaries))}</td></tr>`;
  }).join("");
  return `<details class="debug"><summary>Debug: Datenfluss und Stundenbewertung</summary><p>Entität: ${esc(entity)} · Zeitzone: ${esc(timeZone || "Browser") } · Auswahl: ${esc(scoredResult.selection.mode)} · Schwelle: ${esc(scoredResult.selection.threshold)} · Einheiten: ${esc(JSON.stringify(units || {}))}</p><p>Diagramm: ${esc((scrollTrace || []).map(item => `${item.event}: left=${item.left}, width=${item.width}, viewport=${item.viewport}, sichtbar=${item.first || "–"}…${item.last || "–"}`).join(" → ") || "noch kein Scroll-Ereignis")}</p><div class="debug-table"><table><thead><tr><th>Zeit (lokal / UTC)</th><th>Temperatur roh → norm.</th><th>Gefühlt roh</th><th>Wind roh → norm.</th><th>Böen roh → norm.</th><th>Regen roh → norm.</th><th>Regenwahr.</th><th>Feuchte</th><th>Wetter / Klasse / Licht</th><th>Komponenten</th><th>Score</th><th>Status</th><th>Grund</th></tr></thead><tbody>${rows}</tbody></table></div>${error ? `<p>Fehler: ${esc(error)}</p>` : ""}</details>`;
};

class LaufwetterCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this.forecast = []; this.error = ""; this.loading = false; this.lastFetch = 0; this.requestId = 0; this.timelineScrollLeft = 0; this.timelineAnchor = null; this.timelineTouched = false; this.scored = null; this.timelineFrame = null; this.scrollTrace = []; }
  visibleTimeline(timeline) {
    const blocks = [...(timeline?.querySelectorAll?.(".timeline-hour") || [])], left = timeline?.scrollLeft || 0, right = left + (timeline?.clientWidth || 0);
    const visible = blocks.filter(block => block.offsetLeft + block.offsetWidth > left && (!timeline.clientWidth || block.offsetLeft < right));
    return { blocks, first: visible[0], last: visible.at(-1) };
  }
  traceScroll(event, timeline) {
    if (!this.config?.debug) return;
    const visible = this.visibleTimeline(timeline);
    this.scrollTrace = [...this.scrollTrace.slice(-11), { event, left: Math.round(timeline?.scrollLeft ?? this.timelineScrollLeft), width: timeline?.scrollWidth || 0, viewport: timeline?.clientWidth || 0, first: visible.first?.dataset?.datetime || "", last: visible.last?.dataset?.datetime || "" }];
  }
  rememberTimeline(timeline) {
    if (!timeline) return;
    this.timelineScrollLeft = timeline.scrollLeft;
    const first = this.visibleTimeline(timeline).first;
    if (first?.dataset?.datetime) this.timelineAnchor = { datetime: first.dataset.datetime, offset: first.offsetLeft - timeline.scrollLeft };
  }
  disconnectedCallback() { this.requestId++; if (this.timelineFrame !== null && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(this.timelineFrame); }
  setConfig(config) { if (!config?.entity) throw Error("Bitte eine weather-Entität angeben."); this.config = { title: "Laufwetter", location: "", show_location: false, duration: 60, refresh_minutes: 30, debug: false, sun_entity: "sun.sun", warning_entity: "", allow_night_runs: false, ...config }; this.scored = null; this.render(); }
  set hass(hass) {
    const previous = this._hass; this._hass = hass;
    if (!this.config) return;
    const entity = String(this.config.entity || "").trim(), warning = this.config.warning_entity;
    if (!previous || previous.config !== hass.config || previous.states?.[entity] !== hass.states?.[entity] || warning && previous.states?.[warning] !== hass.states?.[warning]) this.render();
    const refresh = Math.max(5, Number(this.config.refresh_minutes) || 30) * 60000;
    if (!this.loading && Date.now() - this.lastFetch >= refresh) this.fetchForecast();
  }
  async fetchForecast() {
    if (!this._hass?.callWS || !this.config) return;
    const entity = typeof this.config.entity === "string" ? this.config.entity.trim() : "", state = this._hass.states?.[entity];
    if (!/^weather\.[^.]+$/.test(entity)) { this.error = `Ungültige Wetter-Entität: ${entity}`; this.render(); return; }
    if (!state) { this.error = `Die Wetter-Entität ${entity} wurde nicht gefunden oder ist nicht verfügbar.`; this.render(); return; }
    if (["unavailable", "unknown"].includes(state.state)) { this.error = `Die Wetter-Entität ${entity} ist nicht verfügbar.`; this.render(); return; }
    if (this.loading) return;
    this.loading = true; this.lastFetch = Date.now(); const requestId = ++this.requestId;
    try {
      const result = await this._hass.callWS({ type: "call_service", domain: "weather", service: "get_forecasts", service_data: { type: "hourly" }, target: { entity_id: entity }, return_response: true });
      if (requestId !== this.requestId) return;
      const raw = (result?.response || result)?.[entity]?.forecast;
      if (!Array.isArray(raw)) throw Error("Keine stündliche Prognose verfügbar.");
      this.rawForecast = raw; this.units = unitSnapshot(this._hass, entity);
      const warning = this.config.warning_entity ? this._hass.states?.[this.config.warning_entity] : null;
      const warningText = warning && !["off", "unknown", "unavailable"].includes(warning.state) ? String(warning.attributes?.friendly_name || warning.state) : "";
      this.forecast = normalizeForecast(raw, this.units).map(hour => ({ ...hour, warning: warningText })); this.scored = null; this.error = "";
    } catch (error) { if (requestId === this.requestId) this.error = String(error.message || error); }
    finally { if (requestId === this.requestId) { this.loading = false; this.render(); } }
  }
  captureTimelineScroll() {
    const timeline = this.shadowRoot?.querySelector?.(".timeline");
    this.rememberTimeline(timeline);
    this.traceScroll("render-capture", timeline);
    if (this.timelineFrame !== null && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(this.timelineFrame);
    this.timelineFrame = null;
  }
  updateTimelineDate(timeline) {
    this.rememberTimeline(timeline);
    const block = [...(timeline.querySelectorAll?.(".timeline-hour") || [])].find(hour => hour.offsetLeft + hour.offsetWidth > timeline.scrollLeft);
    const date = this.shadowRoot?.querySelector?.(".timeline-date");
    if (block && date) date.textContent = block.dataset.date;
  }
  bindTimeline() {
    const timeline = this.shadowRoot?.querySelector?.(".timeline");
    if (!timeline) return;
    const blocks = [...(timeline.querySelectorAll?.(".timeline-hour") || [])];
    const anchor = this.timelineTouched && this.timelineAnchor ? blocks.find(block => block.dataset.datetime === this.timelineAnchor.datetime) || blocks.find(block => Date.parse(block.dataset.datetime) >= Date.parse(this.timelineAnchor.datetime)) || blocks.at(-1) : null;
    timeline.scrollLeft = anchor ? anchor.offsetLeft - this.timelineAnchor.offset : this.timelineScrollLeft;
    this.traceScroll("render-restore", timeline);
    this.updateTimelineDate(timeline);
    if (timeline._laufwetterBound) return;
    timeline._laufwetterBound = true;
    timeline.addEventListener?.("scroll", () => {
      this.rememberTimeline(timeline);
      this.traceScroll("scroll", timeline);
      if (this.timelineFrame !== null) return;
      const update = () => {
        this.timelineFrame = null; this.updateTimelineDate(timeline);
      };
      if (globalThis.requestAnimationFrame) this.timelineFrame = globalThis.requestAnimationFrame(update); else update();
    });
    const touched = event => { this.timelineTouched = true; this.traceScroll(event.type, timeline); };
    timeline.addEventListener?.("pointerdown", touched);
    timeline.addEventListener?.("wheel", touched, { passive: true });
  }
  keepTimeline() {
    const previous = this.timeline;
    const current = this.shadowRoot?.querySelector?.(".timeline");
    if (!previous || !current || previous === current || typeof current.replaceWith !== "function") { this.timeline = current; return; }
    previous.innerHTML = current.innerHTML;
    current.replaceWith(previous);
    this.timeline = previous;
  }
  buildView() {
    const now = Date.now(), timeZone = this._hass?.config?.time_zone, daylight = hour => daylightStatus(hour, this._hass?.config);
    const scoringDay = localDayOffset(now, 0, timeZone);
    if (!this.scored || this.scored.day !== scoringDay) this.scored = { day: scoringDay, result: scoreForecast(this.forecast, { now, timeZone, daylightPoints: hour => daylightPoints(hour, this._hass?.config) }) };
    const scoredResult = this.scored.result;
    const markedHours = new Set(scoredResult.selection.marked.map(hour => hour.datetime));
    const hours = scoredResult.hours.map(hour => ({ ...hour, marked: markedHours.has(hour.datetime) }));
    const todayKey = localDayOffset(now, 0, timeZone), tomorrowKey = localDayOffset(now, 1, timeZone);
    const today = hours.filter(hour => localDayOffset(hour.datetime, 0, timeZone) === todayKey), tomorrow = hours.filter(hour => localDayOffset(hour.datetime, 0, timeZone) === tomorrowKey);
    const options = { daylightStatus: daylight, allowNightRuns: true, excludeSevereRisks: false, requireMarked: true, duration: this.config.duration };
    const todayFullSummary = daySummary(today, { ...options, includePast: true });
    const todaySummary = daySummary(today, { ...options, now });
    const tomorrowSummary = daySummary(tomorrow, { ...options, includePast: true });
    const historyAvailable = today.some(hour => Date.parse(hour.datetime) <= now - Number(this.config.duration) * 60000);
    const todayMessage = !today.length ? "Heute keine Prognose verfügbar." : todaySummary.window ? "" : todayFullSummary.window && historyAvailable ? "Alle empfohlenen Laufzeiten für heute sind vorbei." : "Heute keine empfohlenen Laufzeiten.";
    const tomorrowMessage = !tomorrow.length ? "Morgen keine Prognose verfügbar." : "Morgen keine empfohlenen Laufzeiten.";
    const selected = new Set([...(todaySummary.window?.hours || []), ...(tomorrowSummary.window?.hours || [])].map(hour => hour.datetime));
    return { daylight, timeZone, scoredResult, hours, today, tomorrow, todayFullSummary, todaySummary, tomorrowSummary, todayMessage, tomorrowMessage, selected, chartHours: hours.filter(hour => Date.parse(hour.datetime) >= now) };
  }
  render() {
    if (!this.shadowRoot || !this.config) return;
    this.captureTimelineScroll();
    const { daylight, timeZone, scoredResult, hours, today, tomorrow, todayFullSummary, todaySummary, tomorrowSummary, todayMessage, tomorrowMessage, selected, chartHours } = this.buildView();
    const debug = this.config.debug ? renderDebug({ entity: this.config.entity, units: this.units, timeZone, scoredResult, hours, selected, daylight, summaries: [todayFullSummary, todaySummary, tomorrowSummary], rawForecast: this.rawForecast, error: this.error, scrollTrace: this.scrollTrace }) : "";
    this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style><ha-card>${renderHeader(this.config)}${renderDaySummary("Heute", today, todaySummary, todayMessage, timeZone)}${renderTimeline(chartHours, selected, hour => daylight(hour) === "night", timeZone)}${renderDaySummary("Morgen", tomorrow, tomorrowSummary, tomorrowMessage, timeZone)}${this.loading ? `<div class="state meta">Prognose wird geladen …</div>` : ""}${this.error ? `<div class="state state--error">${esc(this.error)}</div>` : ""}${debug}</ha-card>`;
    this.keepTimeline();
    this.bindTimeline();
  }
  getCardSize() { return 4; }
}
customElements.define("laufwetter-card", LaufwetterCard); window.customCards = window.customCards || []; window.customCards.push({ type: "laufwetter-card", name: "Laufwetter Card", version: CARD_VERSION, description: "Konkrete Laufzeiten für heute und morgen" });
