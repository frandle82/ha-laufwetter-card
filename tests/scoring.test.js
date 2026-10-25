import test from "node:test";
import assert from "node:assert/strict";
import { scoreHour, scoreForecast, selectRecommendations } from "../src/scoring.js";
import { normalizeForecast } from "../src/forecast.js";

test("temperature formula follows additive bands", () => {
  assert.equal(scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 10 }, { now: "2026-01-02T12:00:00Z" }).points, 5);
  assert.equal(scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 17 }, { now: "2026-01-02T12:00:00Z" }).points, 10);
  assert.equal(scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 22 }, { now: "2026-01-02T12:00:00Z" }).points, 0);
});
test("proximity and humidity are additive", () => assert.equal(scoreHour({ datetime: "2026-01-02T12:00:00Z", temperature: 17, humidity: 80 }, { now: "2026-01-01T01:00:00Z" }).points, 3));
test("night and sun transition receive daylight points", () => {
  const sun = { sunrise: "2026-01-02T07:00:00Z", sunset: "2026-01-02T17:00:00Z" };
  assert.equal(scoreHour({ datetime: "2026-01-02T03:00:00Z", temperature: 17 }, { now: "2026-01-01T00:00:00Z", sun }).points, -5);
  assert.equal(scoreHour({ datetime: "2026-01-02T07:00:00Z", temperature: 17 }, { now: "2026-01-01T00:00:00Z", sun }).points, 13);
});
test("wind uses mean speed and Beaufort, gust is separate risk", () => {
  const result = scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 17, wind_speed: 20, wind_gust_speed: 70 }, { now: "2026-01-02T00:00:00Z" });
  assert.equal(result.beaufort, 4); assert.ok(result.risks.some(risk => risk.includes("Sturm")));
});
test("precipitation amount is distinct from probability", () => {
  const light = scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 12, precipitation: 0.2, precipitation_probability: 90 }, { now: "2026-01-02T00:00:00Z" });
  const unknown = scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 12, precipitation_probability: 90 }, { now: "2026-01-02T00:00:00Z" });
  assert.equal(light.precipitationKnown, true); assert.equal(unknown.precipitationKnown, false); assert.ok(light.points > -10);
});
test("weather states map without inventing rain intensity", () => { const result = scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 12, condition: "rainy" }, { now: "2026-01-02T00:00:00Z" }); assert.equal(result.weatherClass, "rain"); assert.equal(result.precipitationKnown, false); });
test("danger overrides relative score", () => assert.ok(scoreHour({ datetime: "2026-01-01T12:00:00Z", temperature: 17, condition: "lightning" }, { now: "2026-01-02T00:00:00Z" }).risks.length));
test("ten-day selection finds highest threshold with five days", () => {
  const hours = Array.from({ length: 10 * 24 }, (_, index) => { const date = new Date(Date.UTC(2026, 0, 1, index)); return { datetime: date.toISOString(), points: index % 24 === 12 ? 20 : index < 120 ? 5 : -20, risks: [] }; });
  const result = selectRecommendations(hours); assert.equal(result.mode, "10-Tage-Schwelle"); assert.equal(result.threshold, 5); assert.equal(result.marked.length, 125);
});
test("short forecast uses available-period selection", () => { const result = selectRecommendations([{ datetime: "2026-01-01T12:00:00Z", points: 4, risks: [] }]); assert.equal(result.mode, "Verfügbarer Zeitraum"); assert.equal(result.horizonDays, 0); });
test("forecast is sorted and converts wind units", () => { const [first] = normalizeForecast([{ datetime: "2026-01-01T11:00:00Z", wind_speed: "10", wind_gust_speed: "20" }, { datetime: "2026-01-01T10:00:00Z", wind_speed: "10" }], { wind_speed: "mph" }); assert.equal(first.datetime, "2026-01-01T10:00:00Z"); assert.equal(Math.round(first.wind_speed), 16); });
test("scoreForecast keeps hour scoring separate from selection", () => { const result = scoreForecast([{ datetime: "2026-01-01T12:00:00Z", temperature: 17 }], { now: "2026-01-01T00:00:00Z" }); assert.equal(typeof result.hours[0].points, "number"); assert.equal(result.selection.mode, "Verfügbarer Zeitraum"); });
