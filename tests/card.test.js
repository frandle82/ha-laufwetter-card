import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime } from "../src/format.js";

class TestElement {
  attachShadow() { this.shadowRoot = { innerHTML: "" }; return this.shadowRoot; }
}
const registry = new Map();
globalThis.HTMLElement = TestElement;
globalThis.customElements = { define(name, value) { if (registry.has(name)) throw Error(`duplicate ${name}`); registry.set(name, value); }, get: name => registry.get(name) };
globalThis.window = { customCards: [] };
await import("../src/card.js");
const Card = registry.get("laufwetter-card");
const config = { type: "custom:laufwetter-card", entity: "weather.schwerin", location: "Schwerin", title: "Laufwetter", duration: 60, refresh_minutes: 30 };
const hass = (response, states = { "weather.schwerin": { state: "sunny", attributes: { temperature_unit: "°C", wind_speed_unit: "km/h" } } }) => ({ states, config: { unit_system: { temperature: "°C", wind_speed: "km/h" } }, callWS: async () => response });
const forecastResponse = { response: { "weather.schwerin": { forecast: [{ datetime: "2099-01-01T12:00:00Z", temperature: 12, precipitation: 0, wind_speed: 5 }] } } };

test("date formatter uses compatible German options and survives invalid dates", () => { assert.match(formatDateTime("2099-01-01T12:00:00Z"), /01\.01\./); assert.equal(formatDateTime("not-a-date"), "Unbekannte Zeit"); });

test("exact YAML config initializes without extra parameters", () => { const card = new Card(); card.setConfig(config); assert.equal(card.status, "waiting"); assert.match(card.shadowRoot.innerHTML, /Warte auf Home-Assistant-Daten/); });
test("incomplete entity id gets a clear configuration error", () => { const card = new Card(); assert.throws(() => card.setConfig({ ...config, entity: "weather" }), /vollständige weather-Entität/); });
test("missing hass stays in waiting state", () => { const card = new Card(); card.setConfig(config); card.hass = undefined; assert.equal(card.status, "waiting"); });
test("missing weather entity is shown inside card", () => { const card = new Card(); card.setConfig(config); card.hass = hass(forecastResponse, {}); assert.equal(card.status, "entity-not-found"); assert.match(card.shadowRoot.innerHTML, /weather\.schwerin/); });
test("unavailable weather entity gets separate state", () => { const card = new Card(); card.setConfig(config); card.hass = hass(forecastResponse, { "weather.schwerin": { state: "unavailable", attributes: {} } }); assert.equal(card.status, "entity-unavailable"); assert.match(card.shadowRoot.innerHTML, /nicht verfügbar/); });
test("non-weather entity is rejected before service call", () => { let calls = 0; const card = new Card(); card.setConfig(config); card.hass = { ...hass(forecastResponse, { "weather.schwerin": { entity_id: "sensor.schwerin", state: "ok" } }), callWS: async () => { calls++; } }; assert.equal(card.status, "entity-not-found"); assert.equal(calls, 0); });
test("empty forecast becomes no-data state", async () => { const card = new Card(); card.setConfig(config); card.hass = hass({ response: { "weather.schwerin": { forecast: [] } } }); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(card.status, "no-data"); assert.match(card.shadowRoot.innerHTML, /Keine stündliche Prognose verfügbar/); });
test("service error stays inside card", async () => { const card = new Card(); card.setConfig(config); card.hass = { ...hass(null), callWS: async () => { throw Error("Service unavailable"); } }; await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(card.status, "service-error"); assert.match(card.shadowRoot.innerHTML, /Service unavailable/); });
test("service target uses entity array and failed call is not retried on update", async () => { let calls = 0, request; const card = new Card(); card.setConfig({ ...config, debug: true }); card.hass = { ...hass(null), callWS: async payload => { calls++; request = payload; throw Error("response mismatch"); } }; await new Promise(resolve => setTimeout(resolve, 0)); card.hass = card._hass; assert.equal(calls, 1); assert.deepEqual(request.target.entity_id, ["weather.schwerin"]); assert.match(card.shadowRoot.innerHTML, /response mismatch/); });
test("valid forecast renders and refresh updates data", async () => { let response = forecastResponse; const card = new Card(); card.setConfig(config); card.hass = { ...hass(null), callWS: async () => response }; await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(card.status, "ready"); assert.match(card.shadowRoot.innerHTML, /12 °C/); response = { response: { "weather.schwerin": { forecast: [{ datetime: "2099-01-01T13:00:00Z", temperature: 18, precipitation: 0, wind_speed: 5 }] } } }; await card.fetchForecast(); assert.match(card.shadowRoot.innerHTML, /18 °C/); });
test("direct service response format loads forecast", async () => { const card = new Card(); card.setConfig(config); card.hass = { ...hass(null), callWS: async () => ({ "weather.schwerin": { forecast: [{ datetime: "2099-01-01T12:00:00Z", temperature: 14, precipitation: 0, wind_speed: 6 }] } }) }; await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(card.status, "ready"); assert.match(card.shadowRoot.innerHTML, /14 °C/); });
test("realistic ten-day response handles null UV, missing humidity and gusts", async () => { const forecast = Array.from({ length: 240 }, (_, index) => ({ datetime: new Date(Date.UTC(2099, 0, 1, index)).toISOString(), temperature: 9 + index % 8, precipitation: 0, precipitation_probability: 10, wind_speed: 8, uv_index: null })); const card = new Card(); card.setConfig(config); card.hass = { ...hass(null), callWS: async () => ({ response: { "weather.schwerin": { forecast } } }) }; await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(card.status, "ready"); assert.match(card.shadowRoot.innerHTML, /10 Tage verfügbar/); assert.equal(card.forecast.length, 240); });
test("custom element is registered once", () => { assert.equal(customElements.get("laufwetter-card"), Card); assert.equal(window.customCards.filter(card => card.type === "laufwetter-card").length, 1); });
