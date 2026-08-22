import test from 'node:test';
import assert from 'node:assert/strict';
import { searchGeneration } from './iterate.mjs';

const catalog = Array.from({ length: 12 }, (_, i) => ({
  id: `set-${i}`,
  species: `Species${i}`,
  tags: { roles: [i % 2 ? 'special_offense' : 'physical_wall'] },
}));

const opponents = [];
const evaluateTeam = async (team) => ({
  lead: team[0],
  record: { battles: 20, wins: team[0].species === 'Species0' ? 16 : 12, losses: team[0].species === 'Species0' ? 4 : 8, ties: 0 },
});

test('search generation returns elite teams and preserves species clause', async () => {
  const result = await searchGeneration({
    catalog,
    opponents,
    evaluateTeam,
    options: { populationSize: 30, eliteCount: 5, rng: () => 0.42 },
  });
  assert.ok(result.elite.length > 0);
  for (const item of result.elite) assert.equal(new Set(item.team.map(set => set.species)).size, 6);
});
