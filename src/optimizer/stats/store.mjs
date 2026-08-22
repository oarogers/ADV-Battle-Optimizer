import fs from 'node:fs/promises';
import path from 'node:path';
import { createStats } from './metrics.mjs';

const SCHEMA_VERSION = 1;

export async function loadStats(filename) {
  try {
    const data = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (data.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported stats schema: ${data.schemaVersion}`);
    return hydrate(data);
  } catch (error) {
    if (error.code === 'ENOENT') return createStats();
    throw error;
  }
}

export async function saveStats(filename, stats) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temp = `${filename}.tmp`;
  await fs.writeFile(temp, JSON.stringify(serialize(stats), null, 2));
  await fs.rename(temp, filename);
}

function serialize(stats) {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    battles: stats.battles,
    wins: stats.wins,
    losses: stats.losses,
    ties: stats.ties,
    teams: Object.fromEntries(stats.teams),
    sets: Object.fromEntries(stats.sets),
    matchups: Object.fromEntries(stats.matchups),
  };
}

function hydrate(data) {
  const stats = createStats();
  stats.battles = data.battles ?? 0;
  stats.wins = data.wins ?? 0;
  stats.losses = data.losses ?? 0;
  stats.ties = data.ties ?? 0;
  stats.teams = new Map(Object.entries(data.teams ?? {}));
  stats.sets = new Map(Object.entries(data.sets ?? {}));
  stats.matchups = new Map(Object.entries(data.matchups ?? {}));
  return stats;
}
