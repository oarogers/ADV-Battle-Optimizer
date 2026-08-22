import { generateCandidateTeams } from '../candidates/generate.mjs';
import { evaluateStructure } from '../evaluation/structural.mjs';
import { confidenceLowerBound, winRate } from '../stats/metrics.mjs';

const DEFAULTS = {
  populationSize: 1000,
  eliteCount: 100,
  battlesPerTeam: 20,
  mutationFraction: 0.55,
  explorationFraction: 0.25,
  randomFraction: 0.20,
  diversityWeight: 0.15,
  riskWeight: 0.25,
};

const teamKey = team => team.map(set => set.id ?? `${set.species}|${set.name ?? ''}|${set.item ?? ''}|${(set.moves ?? []).join(',')}`).sort().join('::');
const speciesKey = team => team.map(set => set.species).sort().join('|');

function cloneTeam(team) { return team.map(set => set); }

function mutateTeam(team, catalog, rng) {
  const next = cloneTeam(team);
  const index = Math.floor(rng() * next.length);
  const usedSpecies = new Set(next.map(set => set.species));
  const sameSpecies = catalog.filter(set => set.species === next[index].species);
  const alternatives = sameSpecies.length > 1 ? sameSpecies : catalog.filter(set => !usedSpecies.has(set.species));
  if (!alternatives.length) return next;
  next[index] = alternatives[Math.floor(rng() * alternatives.length)];
  return next;
}

function exploratoryTeam(catalog, underTest, rng) {
  const base = generateCandidateTeams(catalog, { populationSize: 1, rng })[0];
  if (underTest.length && rng() < 0.7) {
    const index = Math.floor(rng() * base.length);
    const candidate = underTest[Math.floor(rng() * underTest.length)];
    if (candidate?.species && !base.some(set => set.species === candidate.species)) base[index] = candidate;
  }
  return base;
}

function empiricalScore(record, riskWeight) {
  if (!record?.battles) return 0;
  const mean = winRate(record) ?? 0;
  const lower = confidenceLowerBound(record) ?? 0;
  return mean * (1 - riskWeight) + lower * riskWeight;
}

function rankTeams(results, config) {
  const unique = new Map();
  for (const result of results) {
    const key = teamKey(result.team);
    const existing = unique.get(key);
    if (!existing || result.score > existing.score) unique.set(key, result);
  }
  const ranked = [...unique.values()].sort((a, b) => b.score - a.score);
  const selected = [];
  const speciesKeys = new Set();
  for (const result of ranked) {
    const overlap = selected.length ? selected.reduce((max, item) => {
      const a = new Set(speciesKey(result.team).split('|'));
      const b = new Set(speciesKey(item.team).split('|'));
      const intersection = [...a].filter(x => b.has(x)).length;
      return Math.max(max, intersection / 6);
    }, 0) : 0;
    const adjusted = result.score - config.diversityWeight * overlap;
    if (selected.length < config.eliteCount && adjusted >= (selected.at(-1)?.adjustedScore ?? -Infinity)) {
      selected.push({ ...result, adjustedScore: adjusted });
      speciesKeys.add(speciesKey(result.team));
    }
  }
  return selected.sort((a, b) => b.adjustedScore - a.adjustedScore).slice(0, config.eliteCount);
}

/**
 * One search generation. Battle execution is injected so this module never
 * owns or modifies the working Showdown/Foul Play integration.
 *
 * evaluateTeam(team) must return { record } where record is a battle aggregate.
 */
export async function searchGeneration({ catalog, opponents, evaluateTeam, previous = [], stats = new Map(), options = {} }) {
  const config = { ...DEFAULTS, ...options };
  const rng = config.rng ?? Math.random;
  const candidates = [];

  for (const elite of previous.slice(0, config.eliteCount)) {
    candidates.push(elite.team);
    for (let i = 0; i < Math.max(1, Math.round(config.mutationFraction * 3)); i++) {
      candidates.push(mutateTeam(elite.team, catalog, rng));
    }
  }

  while (candidates.length < config.populationSize) {
    const roll = candidates.length / config.populationSize;
    if (roll < config.randomFraction) {
      candidates.push(...generateCandidateTeams(catalog, { populationSize: 1, rng }));
    } else if (roll < config.randomFraction + config.explorationFraction) {
      candidates.push(exploratoryTeam(catalog, [...stats.keys()].map(id => catalog.find(set => set.id === id)).filter(Boolean), rng));
    } else if (previous.length) {
      const elite = previous[Math.floor(rng() * Math.min(previous.length, config.eliteCount))];
      candidates.push(mutateTeam(elite.team, catalog, rng));
    } else {
      candidates.push(...generateCandidateTeams(catalog, { populationSize: 1, rng }));
    }
  }

  const results = [];
  for (const team of candidates) {
    const key = teamKey(team);
    let result = stats.get(key);
    if (!result) {
      result = await evaluateTeam(team, { opponents, battles: config.battlesPerTeam });
      stats.set(key, result);
    }
    const structure = evaluateStructure(team, { lead: result.lead ?? team[0] });
    const empirical = empiricalScore(result.record, config.riskWeight);
    results.push({ team, record: result.record, empiricalScore: empirical, structure, score: empirical + 0.05 * structure.heuristicScore });
  }

  return {
    generation: results,
    elite: rankTeams(results, config),
    stats,
  };
}
