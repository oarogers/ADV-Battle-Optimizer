import { createHash } from "node:crypto";
import { normalizeSet, normalizeTeam } from "./types.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

export function stableId(prefix, value) {
  const digest = createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

export function setId(set) {
  return stableId("set", normalizeSet(set));
}

export function teamId(team) {
  return stableId("team", normalizeTeam(team).map(setId));
}

export function opponentId(team) {
  return stableId("opp", normalizeTeam(team).map(setId));
}

export function battleId(input) {
  return stableId("battle", input);
}
