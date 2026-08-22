import { setId, teamId } from '../domain/identity.mjs';
import { recordBattle, winRate } from '../stats/metrics.mjs';

function emptyRecord() {
  return { battles: 0, wins: 0, losses: 0, ties: 0 };
}

function recordResult(record, result) {
  record.battles += 1;
  if (result === 'win') record.wins += 1;
  else if (result === 'loss') record.losses += 1;
  else record.ties += 1;
}

function resultForWinner(winner) {
  if (winner === 'Optimizer') return 'win';
  if (winner === 'Opponent') return 'loss';
  return 'tie';
}

function randomSeed(rng = Math.random) {
  return Array.from({ length: 4 }, () => Math.floor(rng() * 0x100000000));
}

function chooseOpponent(opponents, rng) {
  if (!opponents?.length) throw new Error('Team evaluation requires at least one opponent team');
  return opponents[Math.floor(rng() * opponents.length)];
}

/**
 * Evaluate a candidate team against an independently generated opponent pool.
 * Lead choices are sampled round-robin so every member receives lead exposure
 * when the battle budget is at least six. Opponent leads are intentionally left
 * to Foul Play for this first integration; explicit opponent-lead modeling can
 * be added without changing the evaluator contract.
 */
export async function evaluateTeam({ team, opponents, engine, stats = null, battles = 20, rng = Math.random, onBattle = null }) {
  if (!engine?.run) throw new TypeError('evaluateTeam requires a BattleEngine instance');
  if (!Array.isArray(team) || team.length !== 6) throw new RangeError('Candidate team must contain six Pokemon');
  if (!Number.isInteger(battles) || battles < 1) throw new RangeError('battles must be a positive integer');

  const record = emptyRecord();
  const leadRecords = new Map(team.map(set => [setId(set), emptyRecord()]));
  const ourTeamId = teamId(team);
  const setIds = team.map(setId);

  for (let i = 0; i < battles; i++) {
    const opponentTeam = chooseOpponent(opponents, rng);
    const lead = team[i % team.length];
    const result = await engine.run({
      format: 'gen3ou',
      ourTeam: team,
      opponentTeam,
      ourLead: lead,
      seed: randomSeed(rng),
      purpose: 'optimizer-search',
    });

    if (result.status !== 'complete') throw new Error(`Incomplete optimizer battle ${result.id}`);
    const outcome = resultForWinner(result.winner);
    recordResult(record, outcome);
    recordResult(leadRecords.get(setId(lead)), outcome);

    if (stats) {
      recordBattle(stats, {
        teamId: ourTeamId,
        opponentTeamId: result.opponentTeamId,
        setIds,
        result: outcome,
      });
    }

    await onBattle?.({ result, outcome, lead, opponentTeam });
  }

  const lead = [...leadRecords.entries()]
    .filter(([, value]) => value.battles > 0)
    .sort((a, b) => (winRate(b[1]) ?? 0) - (winRate(a[1]) ?? 0))[0]?.[0];

  return {
    record,
    lead: team.find(set => setId(set) === lead) ?? team[0],
    leadRecords,
  };
}
