import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatTime } from "../src/format.js";
import { analyzeRunWindows, selectRunWindow, qualityLabel } from "../src/windows.js";
import { daylightPoints, daylightStatus } from "../src/daylight.js";

class TestShadowRoot {
  constructor() { this.html = ""; this.timeline = null; this.date = null; }
  set innerHTML(value) {
    this.html = value;
    this.date = { textContent: "" };
    this.timeline = { scrollLeft: 0, blocks: [], addEventListener: (_event, listener) => { this.timeline.listener = listener; }, querySelectorAll: () => this.timeline.blocks };
  }
  get innerHTML() { return this.html; }
  querySelector(selector) { return selector === ".timeline" ? this.timeline : selector === ".timeline-date" ? this.date : null; }
}
class TestElement { attachShadow() { this.shadowRoot = new TestShadowRoot(); return this.shadowRoot; } }
const registry = new Map();
globalThis.HTMLElement = TestElement;
globalThis.customElements = { define: (name, value) => registry.set(name, value), get: name => registry.get(name) };
globalThis.window = { customCards: [] };
await import("../src/card.js");
const Card = registry.get("laufwetter-card");
const config = { entity: "weather.schwerin", location: "Schwerin", title: "Laufwetter", duration: 60, refresh_minutes: 30 };
const states = { "weather.schwerin": { state: "sunny", attributes: { temperature_unit: "°C", wind_speed_unit: "km/h" } } };
const forecast = ["12:00", "13:00", "14:00", "15:00"].map(time => ({ datetime: `2099-01-01T${time}:00Z`, temperature: 12, precipitation: 0, wind_speed: 5 }));

test("formats valid German date/time and survives invalid value", () => {
  assert.match(formatDateTime("2099-01-01T12:00:00Z"), /01\.01\./);
  assert.match(formatTime("2099-01-01T12:00:00Z"), /:\d{2}$/);
  assert.equal(formatDateTime("invalid"), "–");
});
test("renders realistic hourly forecast without DateTimeFormat exception", async () => {
  const card = new Card(); card.setConfig(config); card.hass = { states, config: { unit_system: { temperature: "°C", wind_speed: "km/h" } }, callWS: async () => ({ response: { "weather.schwerin": { forecast } } }) };
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(card.shadowRoot.innerHTML, /Heute/);
  assert.match(card.shadowRoot.innerHTML, /Heute/);
});
test("uses configurable title and optional location below the title", () => {
  const card = new Card(); card.setConfig({ ...config, title: "Mein Laufwetter", show_location: true });
  assert.match(card.shadowRoot.innerHTML, /Mein Laufwetter/);
  assert.match(card.shadowRoot.innerHTML, /Schwerin/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /Laufwetter-Punktzahl|Sehr gut|Eingeschränkt/);
});
test("renders reusable header, summaries and scrollable timeline structure", () => {
  const card = new Card(); card.setConfig(config);
  assert.match(card.shadowRoot.innerHTML, /card-header/);
  assert.match(card.shadowRoot.innerHTML, /day-summary/);
  assert.match(card.shadowRoot.innerHTML, /mdi:run/);
  assert.match(card.shadowRoot.innerHTML, /Laufbedingungen/);
  assert.match(card.shadowRoot.innerHTML, /Nacht.*Ungünstig.*Möglich.*Empfohlen/);
  assert.match(card.shadowRoot.innerHTML, /overflow-x:auto/);
  assert.match(card.shadowRoot.innerHTML, /height:34px/);
  assert.match(card.shadowRoot.innerHTML, /timeline-hour/);
});
test("selects a complete, contiguous run window", () => {
  const hours = forecast.map(hour => ({ ...hour, points: 12, risks: [] }));
  const window = selectRunWindow(hours, { duration: 90, includePast: true });
  assert.equal(window.hours.length, 2);
  assert.equal(qualityLabel(window), "Gut");
});
test("does not recommend a risky or nighttime window", () => {
  const hours = forecast.map(hour => ({ ...hour, points: -4, risks: ["Starkregen"] }));
  assert.equal(selectRunWindow(hours, { duration: 60, includePast: true }), null);
  const daylight = { sunrise: "2099-01-01T08:00:00Z", sunset: "2099-01-01T16:00:00Z" };
  const night = forecast.slice(0, 2).map((hour, index) => ({ ...hour, datetime: `2099-01-01T0${index + 2}:00:00Z`, points: 20, risks: [] }));
  assert.equal(selectRunWindow(night, { duration: 60, includePast: true, sun: daylight }), null);
});
test("requires marked hours when selecting a relative-score window", () => {
  const hours = forecast.map((hour, index) => ({ ...hour, points: 12, risks: [], marked: index === 1 }));
  assert.equal(selectRunWindow(hours, { duration: 90, includePast: true, requireMarked: true }), null);
});
test("allows a marked negative-score window when no risk applies", () => {
  const hours = forecast.slice(0, 2).map(hour => ({ ...hour, points: -4, risks: [], marked: true }));
  assert.equal(selectRunWindow(hours, { duration: 90, includePast: true, requireMarked: true }).average, -4);
});
test("allows marked strong gusts but excludes severe hazards", () => {
  const gusts = forecast.slice(0, 2).map(hour => ({ ...hour, points: -2, marked: true, risks: ["starke Böen"] }));
  assert.equal(selectRunWindow(gusts, { duration: 60, includePast: true, requireMarked: true }).hours.length, 1);
  const storm = gusts.map(hour => ({ ...hour, risks: ["Sturm- oder Orkanböen"] }));
  assert.equal(selectRunWindow(storm, { duration: 60, includePast: true, requireMarked: true }), null);
  assert.match(analyzeRunWindows(storm, { duration: 60, includePast: true, requireMarked: true }).exclusions[0].reason, /Sturm/);
});
test("classifies daylight per forecast date and keeps missing sun data unknown", () => {
  const place = { latitude: 53.63, longitude: 11.41 };
  assert.equal(daylightStatus({ datetime: "2026-10-25T12:00:00+01:00", condition: "sunny" }, place), "day");
  assert.equal(daylightStatus({ datetime: "2026-10-26T12:00:00+01:00", condition: "sunny" }, place), "day");
  assert.equal(daylightStatus({ datetime: "2026-10-25T01:00:00+02:00", condition: "clear" }, place), "night");
  assert.equal(daylightStatus({ datetime: "2026-10-25T12:00:00+01:00", condition: "sunny" }), "unknown");
  assert.equal(daylightPoints({ datetime: "2026-10-25T01:00:00+02:00", condition: "clear" }, place), -16);
});
test("empty forecast and service error render inside card", async () => {
  const empty = new Card(); empty.setConfig(config); empty.hass = { states, callWS: async () => ({ response: { "weather.schwerin": { forecast: [] } } }) }; await new Promise(resolve => setTimeout(resolve, 0)); assert.match(empty.shadowRoot.innerHTML, /Keine zukünftigen Stunden/);
  const failed = new Card(); failed.setConfig(config); failed.hass = { states, callWS: async () => { throw Error("forecast failed"); } }; await new Promise(resolve => setTimeout(resolve, 0)); assert.match(failed.shadowRoot.innerHTML, /forecast failed/);
});
test("keeps available day metrics when no marked run window exists", async () => {
  const card = new Card(); const current = [{ datetime: new Date(Date.now() + 60000).toISOString(), temperature: 10, precipitation: 1, wind_speed: 10, condition: "lightning" }];
  card.setConfig(config); card.hass = { states, config: { unit_system: { temperature: "°C", wind_speed: "km/h" } }, callWS: async () => ({ response: { "weather.schwerin": { forecast: current } } }) };
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(card.shadowRoot.innerHTML, /10 °C/);
  assert.match(card.shadowRoot.innerHTML, /style="background:#d66b61"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /style="height:/);
});
test("preserves timeline scroll and updates date from left visible block across day and DST boundaries", () => {
  const card = new Card(); card.setConfig(config);
  card.shadowRoot.timeline.scrollLeft = 72;
  card.hass = { states, callWS: async () => ({ response: { "weather.schwerin": { forecast: [] } } }) };
  assert.equal(card.shadowRoot.timeline.scrollLeft, 72);
  const timeline = card.shadowRoot.timeline;
  timeline.blocks = [
    { offsetLeft: 0, offsetWidth: 24, dataset: { date: "25. Oktober" } },
    { offsetLeft: 24, offsetWidth: 24, dataset: { date: "25. Oktober" } },
    { offsetLeft: 48, offsetWidth: 24, dataset: { date: "26. Oktober" } },
    { offsetLeft: 72, offsetWidth: 24, dataset: { date: "26. Oktober" } },
    { offsetLeft: 96, offsetWidth: 24, dataset: { date: "27. Oktober" } }
  ];
  timeline.scrollLeft = 50; timeline.listener();
  assert.equal(card.shadowRoot.date.textContent, "26. Oktober");
  timeline.scrollLeft = 23; timeline.listener();
  assert.equal(card.shadowRoot.date.textContent, "25. Oktober");
  timeline.scrollLeft = 73; timeline.listener();
  assert.equal(card.shadowRoot.date.textContent, "26. Oktober");
  timeline.scrollLeft = 97; timeline.listener();
  assert.equal(card.shadowRoot.date.textContent, "27. Oktober");
});
test("preserves timeline scroll after a forecast refresh", async () => {
  const current = [{ datetime: new Date(Date.now() + 3_600_000).toISOString(), temperature: 12, wind_speed: 8, precipitation: 0 }];
  const card = new Card(); card.setConfig(config);
  card.hass = { states, config: { unit_system: { temperature: "°C", wind_speed: "km/h" } }, callWS: async () => ({ response: { "weather.schwerin": { forecast: current } } }) };
  await new Promise(resolve => setTimeout(resolve, 0));
  card.shadowRoot.timeline.scrollLeft = 48; card.lastFetch = 0;
  await card.fetchForecast();
  assert.equal(card.shadowRoot.timeline.scrollLeft, 48);
});
