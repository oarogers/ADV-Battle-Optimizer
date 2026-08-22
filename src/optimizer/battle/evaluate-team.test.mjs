import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTeam } from './evaluate-team.mjs';
import { createStats } from '../stats/metrics.mjs';

const team = Array.from({ length: 6 }, (_, i) => ({
  species: `Species${i}`,
  name: `Set${i}`,
  moves: [],
  evs: {},
  ivs: {},
}));
const opponent = Array.from({ length: 6 }, (_, i) => ({ species: `Opponent${i}`, moves: [], evs: {}, ivs: {} }));

test('samples every lead when the battle budget reaches six', async () => {
  const leads = [];
  const stats = createStats();
  const engine = {
    async run(request) {
      leads.push(request.ourLead.species);
      return {
        id: `battle-${leads.length}`,
        status: 'complete',
        winner: leads.length % 2 ? 'Optimizer' : 'Opponent',
        turns: 10,
        opponentTeamId: 'opponent-id',
      };
    },
  };

  const result = await evaluateTeam({
    team,
    opponents: [opponent],
    engine,
    stats,
    battles: 6,
    rng: () => 0,
  });

  assert.deepEqual(leads, team.map(set => set.species));
  assert.equal(result.record.battles, 6);
  assert.equal(result.record.wins, 3);
  assert.equal(result.record.losses, 3);
  assert.equal(stats.battles, 6);
  assert.equal(result.lead.species, 'Species0');
});
