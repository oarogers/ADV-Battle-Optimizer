import fs from 'node:fs/promises';
import { ShowdownBattleEngine } from '../src/optimizer/battle/showdown-adapter.mjs';
import { evaluateTeam } from '../src/optimizer/battle/evaluate-team.mjs';
import { generateCandidateTeams } from '../src/optimizer/candidates/generate.mjs';
import { searchGeneration } from '../src/optimizer/search/iterate.mjs';
import { confidenceLowerBound } from '../src/optimizer/stats/metrics.mjs';
import { loadStats, saveStats } from '../src/optimizer/stats/store.mjs';

const args = parseArgs(process.argv.slice(2));
const catalogFile = args.catalog ?? 'data/generated/smogon-gen3ou.json';
const statsFile = args.stats ?? 'data/generated/optimizer-stats.json';
const populationSize = Number(args.population ?? 10);
const eliteCount = Number(args.elite ?? Math.min(3, populationSize));
const battlesPerTeam = Number(args.battles ?? 6);
const generations = Number(args.generations ?? 1);

const catalogPayload = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
const catalog = catalogPayload.sets ?? catalogPayload;
if (!Array.isArray(catalog) || catalog.length < 6) throw new Error(`Catalog ${catalogFile} contains fewer than six sets`);

const opponents = generateCandidateTeams(catalog, { populationSize: Math.max(5, Math.min(25, populationSize * 2)) });
const persistentStats = await loadStats(statsFile);
const engine = new ShowdownBattleEngine({ decisionTimeoutMs: 15_000, battleTimeoutMs: 120_000 });

console.log(`Catalog: ${catalog.length} sets`);
console.log(`Candidates/generation: ${populationSize}`);
console.log(`Opponents: ${opponents.length}`);
console.log(`Battles/candidate/generation: ${battlesPerTeam}`);
console.log(`Generations: ${generations}`);

let previous = [];
let result = null;

for (let generation = 1; generation <= generations; generation++) {
  // Explicitly favor sets that are unknown or whose early performance is
  // interesting. This is deliberately a light exploration signal, not a
  // viability ranking.
  const underTestSets = [...catalog]
    .map(set => ({ set, record: persistentStats.sets.get(set.id) }))
    .filter(({ record }) => !record || record.battles < 10 || (record.battles < 50 && (confidenceLowerBound(record) ?? 0) > 0.65))
    .map(({ set }) => set);

  const generationCache = new Map();
  result = await searchGeneration({
    catalog,
    opponents,
    evaluateTeam: async (team, context) => {
      const value = await evaluateTeam({
        team,
        opponents: context.opponents,
        engine,
        stats: persistentStats,
        battles: context.battles,
        onBattle: ({ outcome, lead, result: battle }) => {
          console.log(`  ${lead.species} vs ${battle.opponentTeamId}: ${outcome} (${battle.turns} turns)`);
        },
      });
      return value;
    },
    previous,
    stats: generationCache,
    options: {
      populationSize,
      eliteCount,
      battlesPerTeam,
      underTestSets,
    },
  });

  previous = result.elite;
  await saveStats(statsFile, persistentStats);

  console.log(`\nGeneration ${generation} elite:`);
  for (const [index, item] of result.elite.entries()) {
    const names = item.team.map(set => `${set.species} / ${set.name}`).join(', ');
    const winPct = (item.record.wins + item.record.ties * 0.5) / Math.max(1, item.record.battles) * 100;
    console.log(`${index + 1}. score ${(item.score * 100).toFixed(1)} | empirical ${winPct.toFixed(1)}% | ${names}`);
    console.log(`   lead: ${item.lead?.species ?? 'unknown'} | structural ${(item.structure.heuristicScore * 100).toFixed(1)}% | sample ${item.record.battles}`);
  }
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
