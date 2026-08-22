import fs from 'node:fs/promises';
import path from 'node:path';
import { ShowdownBattleEngine } from '../src/optimizer/battle/showdown-adapter.mjs';
import { evaluateTeam } from '../src/optimizer/battle/evaluate-team.mjs';
import { generateCandidateTeams } from '../src/optimizer/candidates/generate.mjs';
import { searchGeneration } from '../src/optimizer/search/iterate.mjs';
import { loadStats, saveStats } from '../src/optimizer/stats/store.mjs';

const args = parseArgs(process.argv.slice(2));
const catalogFile = args.catalog ?? 'data/generated/smogon-gen3ou.json';
const statsFile = args.stats ?? 'data/generated/optimizer-stats.json';
const populationSize = Number(args.population ?? 10);
const eliteCount = Number(args.elite ?? Math.min(3, populationSize));
const battlesPerTeam = Number(args.battles ?? 6);

const catalogPayload = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
const catalog = catalogPayload.sets ?? catalogPayload;
if (!Array.isArray(catalog) || catalog.length < 6) throw new Error(`Catalog ${catalogFile} contains fewer than six sets`);

// The opponent pool is independently sampled from the same legal set catalog.
// It is deliberately generated separately from the candidate population so the
// first experiment does not simply test teams against themselves.
const opponents = generateCandidateTeams(catalog, { populationSize: Math.max(5, Math.min(25, populationSize * 2)) });
const stats = await loadStats(statsFile);
const engine = new ShowdownBattleEngine({ decisionTimeoutMs: 15_000, battleTimeoutMs: 120_000 });

console.log(`Catalog: ${catalog.length} sets`);
console.log(`Candidates: ${populationSize}`);
console.log(`Opponents: ${opponents.length}`);
console.log(`Battles per candidate: ${battlesPerTeam}`);

const evaluated = new Map();
const evaluate = (team, context) => evaluateTeam({
  team,
  opponents: context.opponents,
  engine,
  stats,
  battles: context.battles,
  onBattle: ({ outcome, lead, result }) => {
    console.log(`  ${lead.species} vs ${result.opponentTeamId}: ${outcome} (${result.turns} turns)`);
  },
});

let previous = [];
const result = await searchGeneration({
  catalog,
  opponents,
  evaluateTeam: async (team, context) => {
    const value = await evaluate(team, context);
    evaluated.set(team.map(set => set.id ?? `${set.species}:${set.name}`).sort().join('|'), value);
    return value;
  },
  previous,
  options: {
    populationSize,
    eliteCount,
    battlesPerTeam,
  },
});

await saveStats(statsFile, stats);

console.log('\nElite teams:');
for (const [index, item] of result.elite.entries()) {
  const names = item.team.map(set => `${set.species} / ${set.name}`).join(', ');
  console.log(`${index + 1}. ${(item.score * 100).toFixed(1)} score | ${(item.record.wins / Math.max(1, item.record.battles) * 100).toFixed(1)}% wins | ${names}`);
  console.log(`   lead: ${item.lead?.species ?? 'unknown'} | structural: ${(item.structure.heuristicScore * 100).toFixed(1)}%`);
}

console.log(`\nStats saved to ${statsFile}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inline] = arg.slice(2).split('=', 2);
    parsed[key] = inline ?? argv[++i];
  }
  return parsed;
}
