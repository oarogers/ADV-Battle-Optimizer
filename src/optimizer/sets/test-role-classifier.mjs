import assert from "node:assert/strict";
import { classifySet } from "./role-classifier.mjs";

const set = {
  species: "Skarmory",
  item: "Leftovers",
  moves: ["Spikes", "Roar", "Protect", "Drill Peck"],
  evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 0, spe: 4 },
};

const result = classifySet(set, {
  baseStats: { hp: 65, atk: 80, def: 140, spa: 40, spd: 70, spe: 70 },
});

assert(result.functions.includes("hazard_setter"));
assert(result.functions.includes("phazer"));
assert(result.roles.includes("bulky"));
assert(result.roles.includes("hazard_pressure"));

console.log("Role classifier validation passed.");
