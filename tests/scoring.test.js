import test from "node:test";
import assert from "node:assert/strict";
import {scoreHour,bestWindow} from "../src/scoring.js";
import {normalizeForecast} from "../src/forecast.js";
test("pleasant dry weather scores high",()=>assert.ok(scoreHour({temperature:12,precipitation_probability:0,wind_speed:5,humidity:55,uv_index:1}).score>=90));
test("thunderstorm caps index",()=>assert.ok(scoreHour({temperature:12,condition:"lightning",precipitation_probability:0}).score<=10));
test("missing forecast yields unknown",()=>assert.equal(scoreHour({}).score,null));
test("best window respects contiguous hours",()=>assert.equal(bestWindow([{datetime:"2026-10-25T10:00:00Z",score:90},{datetime:"2026-10-25T11:00:00Z",score:80}],120).score,85));
test("invalid numeric values are unavailable",()=>assert.equal(scoreHour({temperature:NaN,wind_speed:"bad",uv_index:Infinity}).score,null));
test("extreme values cap score",()=>assert.ok(scoreHour({temperature:40,precipitation_probability:0}).score<=20));
test("gusts cap score",()=>assert.ok(scoreHour({temperature:12,wind_gust_speed:70}).score<=20));
test("non-contiguous forecast is rejected",()=>assert.equal(bestWindow([{datetime:"2026-10-25T10:00:00Z",score:90},{datetime:"2026-10-25T12:00:00Z",score:80}],120),null));
test("forecast normalization converts units and drops invalid numbers",()=>{
  const [hour]=normalizeForecast([{datetime:"2026-10-25T10:00:00Z",temperature:"68",wind_speed:"10",humidity:"bad"}],{temperature:"°F",wind_speed:"mph"});
  assert.equal(Math.round(hour.temperature),20);
  assert.equal(Math.round(hour.wind_speed),16);
  assert.equal(hour.humidity,null);
});
