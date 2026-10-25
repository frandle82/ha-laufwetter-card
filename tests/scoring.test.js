import test from "node:test";
import assert from "node:assert/strict";
import {scoreHour,bestWindow} from "../src/scoring.js";
test("pleasant dry weather scores high",()=>assert.ok(scoreHour({temperature:12,precipitation_probability:0,wind_speed:5,humidity:55,uv_index:1}).score>=90));
test("thunderstorm caps index",()=>assert.ok(scoreHour({temperature:12,condition:"lightning",precipitation_probability:0}).score<=10));
test("missing forecast yields unknown",()=>assert.equal(scoreHour({}).score,null));
test("best window respects contiguous hours",()=>assert.equal(bestWindow([{datetime:"2026-10-25T10:00:00Z",score:90},{datetime:"2026-10-25T11:00:00Z",score:80}],120).score,85));
