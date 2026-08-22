import test from 'node:test';
import assert from 'node:assert/strict';
import { createStats, recordBattle, winRate, confidenceLowerBound } from './metrics.mjs';

test('records team and set results separately from usage', () => {
  const stats = createStats();
  recordBattle(stats, { teamId: 'team-a', opponentTeamId: 'team-b', setIds: ['set-a'], result: 'win' });
  recordBattle(stats, { teamId: 'team-a', opponentTeamId: 'team-c', setIds: ['set-a'], result: 'loss' });
  assert.equal(stats.battles, 2);
  assert.equal(winRate(stats.teams.get('team-a')), 0.5);
  assert.equal(stats.sets.get('set-a').battles, 2);
  assert.ok(confidenceLowerBound(stats.sets.get('set-a')) < 0.5);
});
