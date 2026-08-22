export const DEFAULT_RULES = Object.freeze({
  format: 'gen3ou',
  speciesClause: true,
});

export function validateTeamRules(team, rules = DEFAULT_RULES) {
  if (!rules.speciesClause) return [];
  const seen = new Set();
  const problems = [];
  for (const set of team) {
    const species = String(set.species).toLowerCase();
    if (seen.has(species)) problems.push(`Species clause: ${set.species} appears more than once`);
    seen.add(species);
  }
  return problems;
}
