const ROLE_RULES = [
  ["hazard_setter", ["stealthrock", "spikes", "toxicspikes"]],
  ["hazard_removal", ["rapidspin"]],
  ["phazer", ["roar", "whirlwind", "haze"]],
  ["status_support", ["toxic", "thunderwave", "willowisp", "hypnosis", "sleeppowder", "spore"]],
  ["recovery", ["recover", "softboiled", "wish", "synthesis", "moonlight", "morningsun", "milkdrink"]],
  ["rest_talk", ["rest", "sleeptalk"]],
  ["setup_sweeper", ["swordsdance", "dragondance", "calmmind", "agility", "curse", "bellydrum"]],
  ["screen_support", ["reflect", "lightscreen"]],
  ["weather_setter", ["raindance", "sunnyday", "sandstorm"]],
  ["trapping", ["perishsong", "meanlook", "spiderweb"]],
  ["pivot", ["batonpass"]],
];

const PHYSICAL_OFFENSE = new Set([
  "earthquake", "rockslide", "rockblast", "brickbreak", "focuspunch", "bodyslam",
  "return", "doubleedge", "facade", "hiddenpower", "megahorn", "sludgebomb",
  "shadowball", "meteor", "meteor-mash", "meteor mash", "ironhead", "aerialace",
  "drillpeck", "extremespeed", "quickattack", "machpunch", "bulletpunch",
]);

const SPECIAL_OFFENSE = new Set([
  "thunderbolt", "thunder", "icebeam", "blizzard", "surf", "hydropump", "flamethrower",
  "fireblast", "psychic", "psychic", "shadowball", "gigadrain", "energyball",
  "icepunch", "thunderpunch", "firepunch", "hiddenpower",
]);

const FAST_SPEED = 100;
const BULKY_HP = 90;
const BULKY_DEF = 90;
const BULKY_SPD = 90;

export function classifySet(set, speciesData = {}) {
  const moveIds = new Set((set.moves ?? []).map(toId));
  const tags = new Set();
  const roles = new Set();

  for (const [role, moves] of ROLE_RULES) {
    if (moves.some((move) => moveIds.has(move))) tags.add(role);
  }

  const evs = set.evs ?? {};
  const baseStats = speciesData.baseStats ?? {};
  const attackInvestment = (evs.atk ?? 0) > 100;
  const specialInvestment = (evs.spa ?? 0) > 100;
  const speedInvestment = (evs.spe ?? 0) > 100;
  const fast = (baseStats.spe ?? 0) >= FAST_SPEED || speedInvestment;
  const bulky = (baseStats.hp ?? 0) >= BULKY_HP || (baseStats.def ?? 0) >= BULKY_DEF || (baseStats.spd ?? 0) >= BULKY_SPD;

  if (set.item && /choice band/i.test(set.item)) tags.add("choice_band");
  if (set.item && /choice specs/i.test(set.item)) tags.add("choice_specs");
  if (set.item && /choice scarf/i.test(set.item)) tags.add("choice_scarf");
  if (set.item && /leftovers/i.test(set.item)) tags.add("leftovers");
  if (set.item && /life orb/i.test(set.item)) tags.add("life_orb");

  if ([...moveIds].some((move) => PHYSICAL_OFFENSE.has(move)) && attackInvestment) roles.add("physical_attacker");
  if ([...moveIds].some((move) => SPECIAL_OFFENSE.has(move)) && specialInvestment) roles.add("special_attacker");
  if (fast) roles.add("speed_control");
  if (bulky) roles.add("bulky");

  if (tags.has("choice_band") || tags.has("choice_scarf")) roles.add("immediate_offense");
  if (tags.has("choice_specs")) roles.add("special_offense");
  if (tags.has("recovery") || tags.has("rest_talk")) roles.add("durable");
  if (tags.has("hazard_setter")) roles.add("hazard_pressure");
  if (tags.has("hazard_removal")) roles.add("hazard_control");
  if (tags.has("status_support")) roles.add("disruption");
  if (tags.has("weather_setter")) roles.add("weather");

  return {
    roles: [...roles].sort(),
    functions: [...tags].sort(),
    classifierVersion: "1",
  };
}

function toId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
