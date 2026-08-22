const TAG_GROUPS = {
  offensive: new Set(['physical_offense', 'special_offense', 'immediate_offense', 'setup_sweeper']),
  defensive: new Set(['physical_wall', 'special_wall', 'bulky', 'recovery']),
  support: new Set(['hazard_setter', 'hazard_removal', 'phazer', 'status_support', 'speed_control', 'weather', 'trapper']),
};

function tags(set) {
  return new Set([
    ...(set?.tags?.roles ?? []),
    ...(set?.tags?.functions ?? []),
    ...(set?.tags?.style ?? []),
  ]);
}

function countGroup(team, group) {
  return team.reduce((n, set) => n + [...tags(set)].some(tag => group.has(tag)) ? 1 : 0, 0);
}

function roleCoverage(team) {
  const covered = new Set(team.flatMap(set => [...tags(set)]));
  return Math.min(1, covered.size / Math.max(1, Math.min(10, team.length * 2)));
}

function offensiveDefensiveBalance(team) {
  const offense = countGroup(team, TAG_GROUPS.offensive);
  const defense = countGroup(team, TAG_GROUPS.defensive);
  const total = offense + defense;
  if (!total) return 0.5;
  return 1 - Math.abs(offense - defense) / total;
}

function roleCompression(team) {
  const total = team.reduce((n, set) => n + tags(set).size, 0);
  return Math.min(1, total / Math.max(1, team.length * 3));
}

function redundancy(team) {
  const counts = new Map();
  for (const set of team) for (const tag of tags(set)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const useful = [...counts.values()].filter(n => n >= 2).length;
  const wasteful = [...counts.values()].filter(n => n >= 4).length;
  return Math.max(0, Math.min(1, 0.5 + useful * 0.08 - wasteful * 0.15));
}

function leadSuitability(team, lead) {
  if (!lead) return 0.5;
  const t = tags(lead);
  let score = 0.5;
  if (t.has('hazard_setter')) score += 0.2;
  if (t.has('speed_control')) score += 0.1;
  if (t.has('status_support')) score += 0.08;
  if (t.has('phazer')) score += 0.05;
  if (t.has('recovery')) score += 0.02;
  return Math.min(1, score);
}

/** Structural heuristics are deliberately independent from empirical results. */
export function evaluateStructure(team, { lead = null } = {}) {
  const components = {
    roleCoverage: roleCoverage(team),
    offensiveDefensiveBalance: offensiveDefensiveBalance(team),
    threatCoverage: 0.5,
    roleCompression: roleCompression(team),
    redundancy: redundancy(team),
    synergy: 0.5,
    antiSynergy: 0.5,
    supportRequirements: 0.5,
    failureModes: 0.5,
    winConditionQuality: 0.5,
    leadSuitability: leadSuitability(team, lead),
  };

  const weights = {
    roleCoverage: 1,
    offensiveDefensiveBalance: 0.75,
    threatCoverage: 1,
    roleCompression: 0.5,
    redundancy: 0.5,
    synergy: 1,
    antiSynergy: 1,
    supportRequirements: 0.75,
    failureModes: 1,
    winConditionQuality: 1,
    leadSuitability: 0.75,
  };

  const weighted = Object.entries(weights).reduce((sum, [key, weight]) => sum + components[key] * weight, 0);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  return { components, heuristicScore: weighted / totalWeight, weights };
}
