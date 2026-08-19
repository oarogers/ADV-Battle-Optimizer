export const FORMAT = "gen3ou";

export const STAT_NAMES = ["hp", "atk", "def", "spa", "spd", "spe"];

export function emptyStats(value = 0) {
  return Object.fromEntries(STAT_NAMES.map((stat) => [stat, value]));
}

export function clone(value) {
  return structuredClone(value);
}

export function normalizeStats(stats = {}, fallback = 0) {
  return Object.fromEntries(STAT_NAMES.map((stat) => [
    stat,
    Number.isInteger(stats[stat]) ? stats[stat] : fallback,
  ]));
}

export function normalizeSet(input) {
  if (!input?.species) throw new TypeError("PokemonSet requires species");
  const moves = [...(input.moves ?? [])].filter(Boolean).map(String);
  if (moves.length > 4) throw new RangeError("PokemonSet cannot have more than 4 moves");

  return {
    name: input.name ?? input.species,
    species: String(input.species),
    item: input.item ?? "",
    ability: input.ability ?? "",
    moves,
    nature: input.nature ?? "",
    evs: normalizeStats(input.evs),
    ivs: normalizeStats(input.ivs, 31),
    level: Number.isInteger(input.level) ? input.level : 100,
  };
}

export function normalizeTeam(team) {
  if (!Array.isArray(team) || team.length !== 6) {
    throw new RangeError("An ADV team must contain exactly 6 Pokemon");
  }
  return team.map(normalizeSet);
}
