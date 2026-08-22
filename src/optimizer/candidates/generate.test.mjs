import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCandidateTeams } from './generate.mjs';

const sets = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta']
  .map((species, index) => ({
    species,
    tags: {
      roles: index % 2 ? ['special_offense'] : ['physical_wall'],
    },
  }));

const deterministicRng = () => 0.1;

test('generates the requested number of six-set teams', () => {
  const teams = generateCandidateTeams(sets, { populationSize: 25, rng: deterministicRng });
  assert.equal(teams.length, 25);
  for (const team of teams) {
    assert.equal(team.length, 6);
    assert.equal(new Set(team.map(set => set.species)).size, 6);
  }
});

test('rejects catalogs with fewer than six species', () => {
  assert.throws(
    () => generateCandidateTeams(sets.slice(0, 5), { populationSize: 1 }),
    /At least six distinct species/,
  );
});
