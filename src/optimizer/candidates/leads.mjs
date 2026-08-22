/** Return one candidate for each possible lead. The lead is always a member of the team. */
export function leadCandidates(team) {
  return team.map((lead, index) => ({ team, lead, leadIndex: index }));
}

export function bestLead(resultByLead) {
  return [...resultByLead]
    .filter(result => Number.isFinite(result?.winRate))
    .sort((a, b) => b.winRate - a.winRate)[0] ?? null;
}
