import assert from "node:assert/strict";
import { requestNeedsDecision } from "./showdown-adapter.mjs";

const waitRequest = '|request|{"wait":true,"side":{"name":"Optimizer","id":"p1"}}';
const moveRequest = '|request|{"active":[{"moves":[{"move":"Thunderbolt","disabled":false}]}],"side":{"name":"Optimizer","id":"p1"}}';
const switchRequest = '|request|{"forceSwitch":[true],"side":{"name":"Optimizer","id":"p1"}}';

assert.equal(requestNeedsDecision(waitRequest), false);
assert.equal(requestNeedsDecision(`|\n${waitRequest}`), false);
assert.equal(requestNeedsDecision(moveRequest), true);
assert.equal(requestNeedsDecision(switchRequest), true);

console.log("Showdown request decision tests passed");
