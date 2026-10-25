import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatTime } from "../src/format.js";
import { selectRunWindow, qualityLabel } from "../src/windows.js";
import { daylightPoints, daylightStatus } from "../src/daylight.js";

class TestElement { attachShadow() { this.shadowRoot = { innerHTML: "" }; return this.shadowRoot; } }
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
  assert.doesNotMatch(card.shadowRoot.innerHTML, /Laufwetter-Punktzahl|Sehr gut|Eingeschränkt|Ungünstig/);
});
test("selects a complete, contiguous run window", () => {
  const hours = forecast.map(hour => ({ ...hour, points: 12, risks: [] }));
  const window = selectRunWindow(hours, { duration: 90, includePast: true });
  assert.equal(window.hours.length, 2);
  assert.equal(qualityLabel(window), "Gut");
});
test("does not recommend an entirely unfavorable or nighttime window", () => {
  const hours = forecast.map(hour => ({ ...hour, points: -4, risks: [] }));
  assert.equal(selectRunWindow(hours, { duration: 60, includePast: true }), null);
  const daylight = { sunrise: "2099-01-01T08:00:00Z", sunset: "2099-01-01T16:00:00Z" };
  const night = forecast.slice(0, 2).map((hour, index) => ({ ...hour, datetime: `2099-01-01T0${index + 2}:00:00Z`, points: 20, risks: [] }));
  assert.equal(selectRunWindow(night, { duration: 60, includePast: true, sun: daylight }), null);
});
test("requires marked hours when selecting a relative-score window", () => {
  const hours = forecast.map((hour, index) => ({ ...hour, points: 12, risks: [], marked: index === 1 }));
  assert.equal(selectRunWindow(hours, { duration: 90, includePast: true, requireMarked: true }), null);
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
});
