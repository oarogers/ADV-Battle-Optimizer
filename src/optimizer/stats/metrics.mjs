export function createStats() {
  return {
    battles: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    teams: new Map(),
    sets: new Map(),
    matchups: new Map(),
  };
}

function ensure(map, key, factory) {
  if (!map.has(key)) map.set(key, factory());
  return map.get(key);
}

function updateRecord(record, result) {
  record.battles += 1;
  if (result === 'win') record.wins += 1;
  else if (result === 'loss') record.losses += 1;
  else record.ties += 1;
}

export function recordBattle(stats, { teamId, opponentTeamId, setIds = [], result, opponentStrength = null }) {
  updateRecord(stats, result);

  const team = ensure(stats.teams, teamId, () => ({ battles: 0, wins: 0, losses: 0, ties: 0 }));
  updateRecord(team, result);
  const opponent = ensure(stats.teams, opponentTeamId, () => ({ battles: 0, wins: 0, losses: 0, ties: 0 }));
  updateRecord(opponent, result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'tie');

  for (const setId of setIds) {
    const record = ensure(stats.sets, setId, () => ({ battles: 0, wins: 0, losses: 0, ties: 0, opponentStrengthSum: 0, opponentStrengthSamples: 0 }));
    updateRecord(record, result);
    if (Number.isFinite(opponentStrength)) {
      record.opponentStrengthSum += opponentStrength;
      record.opponentStrengthSamples += 1;
    }
  }

  const matchupKey = `${teamId}::${opponentTeamId}`;
  const matchup = ensure(stats.matchups, matchupKey, () => ({ battles: 0, wins: 0, losses: 0, ties: 0 }));
  updateRecord(matchup, result);
}

export function winRate(record) {
  if (!record?.battles) return null;
  return (record.wins + record.ties * 0.5) / record.battles;
}

// Wilson lower bound: conservative estimate that naturally discounts tiny samples.
export function confidenceLowerBound(record, z = 1.96) {
  const n = record?.battles ?? 0;
  if (!n) return null;
  const p = winRate(record);
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denominator);
}

export function empiricalSetScore(record) {
  if (!record?.battles) return { estimate: null, confidence: 0, usage: 0 };
  return {
    estimate: winRate(record),
    confidence: confidenceLowerBound(record),
    usage: record.battles,
  };
}
