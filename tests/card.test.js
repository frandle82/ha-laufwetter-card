import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime } from "../src/format.js";

class TestElement { attachShadow() { this.shadowRoot = { innerHTML: "" }; return this.shadowRoot; } }
const registry = new Map();
globalThis.HTMLElement = TestElement;
globalThis.customElements = { define: (name, value) => registry.set(name, value), get: name => registry.get(name) };
globalThis.window = { customCards: [] };
await import("../src/card.js");
const Card = registry.get("laufwetter-card");
const config = { entity: "weather.schwerin", location: "Schwerin", title: "Laufwetter", duration: 60, refresh_minutes: 30 };
const states = { "weather.schwerin": { state: "sunny", attributes: { temperature_unit: "°C", wind_speed_unit: "km/h" } } };
const forecast = [{ datetime: "2099-01-01T12:00:00Z", temperature: 12, precipitation: 0, wind_speed: 5 }];

test("formats valid German date/time and survives invalid value", () => {
  assert.match(formatDateTime("2099-01-01T12:00:00Z"), /01\.01\./);
  assert.equal(formatDateTime("invalid"), "–");
});
test("renders realistic hourly forecast without DateTimeFormat exception", async () => {
  const card = new Card(); card.setConfig(config); card.hass = { states, config: { unit_system: { temperature: "°C", wind_speed: "km/h" } }, callWS: async () => ({ response: { "weather.schwerin": { forecast } } }) };
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.match(card.shadowRoot.innerHTML, /Laufwetter-Punktzahl/);
  assert.match(card.shadowRoot.innerHTML, /Beste verfügbare Laufzeit/);
});
test("empty forecast and service error render inside card", async () => {
  const empty = new Card(); empty.setConfig(config); empty.hass = { states, callWS: async () => ({ response: { "weather.schwerin": { forecast: [] } } }) }; await new Promise(resolve => setTimeout(resolve, 0)); assert.match(empty.shadowRoot.innerHTML, /0 Stunden bewertet/);
  const failed = new Card(); failed.setConfig(config); failed.hass = { states, callWS: async () => { throw Error("forecast failed"); } }; await new Promise(resolve => setTimeout(resolve, 0)); assert.match(failed.shadowRoot.innerHTML, /forecast failed/);
});
