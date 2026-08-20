import fs from "node:fs/promises";
import path from "node:path";
import pkg from "pokemon-showdown";
import { ShowdownBattleEngine } from "./showdown-adapter.mjs";

const { Teams, TeamValidator } = pkg;
const args = parseArgs(process.argv.slice(2));
const format = args.format ?? "gen3ou";
const battles = Number(args.battles ?? 10);
const saveDir = args.saveInteresting ? path.resolve(args.saveInteresting) : null;
const interestingTurns = Number(args.interestingTurns ?? 80);

if (!Number.isInteger(battles) || battles < 1) throw new Error("--battles must be a positive integer");

const [ourTeam, opponentTeam] = await Promise.all([
  loadTeam(args.ourTeam, "our team"),
  loadTeam(args.opponentTeam, "opponent team"),
]);

if (saveDir) await fs.mkdir(saveDir, { recursive: true });

const engine = new ShowdownBattleEngine({
  format,
  decisionTimeoutMs: Number(args.decisionTimeoutMs ?? 15_000),
  battleTimeoutMs: Number(args.battleTimeoutMs ?? 120_000),
});

const results = [];
for (let i = 0; i < battles; i++) {
  const seed = seedForBattle(i + 1);
  const started = Date.now();
  try {
    const result = await engine.run({
      format,
      ourTeam,
      opponentTeam,
      seed,
      purpose: "correctness-harness",
    });
    result.durationMs = Date.now() - started;
    results.push(result);
    console.log(JSON.stringify({
      battle: i + 1,
      outcome: result.outcome,
      turns: result.turns,
      decisions: result.decisions.length,
      durationMs: result.durationMs,
    }));

    if (saveDir && isInteresting(result)) {
      await saveInteresting(saveDir, i + 1, result);
    }
  } catch (error) {
    const failure = {
      battle: i + 1,
      outcome: "error",
      turns: 0,
      decisions: 0,
      durationMs: Date.now() - started,
      error: error.stack ?? String(error),
    };
    results.push(failure);
    console.error(JSON.stringify(failure, null, 2));
    throw error;
  }
}

const counts = Object.fromEntries(["win", "loss", "draw", "incomplete", "error"].map((key) => [key, results.filter((r) => r.outcome === key).length]));
const completed = counts.win + counts.loss + counts.draw;
const totalTurns = results.reduce((sum, r) => sum + (r.turns ?? 0), 0);
const totalDecisions = results.reduce((sum, r) => sum + (r.decisions?.length ?? 0), 0);

console.log(JSON.stringify({
  format,
  battles,
  wins: counts.win,
  losses: counts.loss,
  draws: counts.draw,
  incomplete: counts.incomplete,
  errors: counts.error,
  winRate: completed ? counts.win / completed : 0,
  lossRate: completed ? counts.loss / completed : 0,
  drawRate: completed ? counts.draw / completed : 0,
  averageTurns: battles ? totalTurns / battles : 0,
  decisions: totalDecisions,
  savedInterestingGames: saveDir ? results.filter(isInteresting).length : 0,
}, null, 2));

async function loadTeam(file, label) {
  if (!file) throw new Error(`Missing --${label === "our team" ? "our-team" : "opponent-team"} path`);
  const text = await fs.readFile(path.resolve(file), "utf8");
  const team = Teams.import(text);
  if (!team) throw new Error(`Could not parse ${label} as a Pokémon Showdown team: ${file}`);
  if (team.length !== 6) throw new Error(`${label} must contain exactly 6 Pokémon; got ${team.length}`);
  const problems = new TeamValidator(format).validateTeam(team);
  if (problems?.length) throw new Error(`Illegal ${label} for ${format}:\n${problems.join("\n")}`);
  return team;
}

function isInteresting(result) {
  return result.outcome === "draw" || result.outcome === "incomplete" || result.outcome === "error" || (result.turns ?? 0) >= interestingTurns;
}

async function saveInteresting(dir, index, result) {
  const stem = `battle-${String(index).padStart(4, "0")}-${result.outcome}`;
  await fs.writeFile(path.join(dir, `${stem}.log`), result.protocolLog ?? result.error ?? "", "utf8");
  await fs.writeFile(path.join(dir, `${stem}.json`), JSON.stringify({
    id: result.id,
    outcome: result.outcome,
    winner: result.winner,
    turns: result.turns,
    seed: result.seed,
    decisions: result.decisions,
    error: result.error ?? null,
  }, null, 2), "utf8");
}

function seedForBattle(index) {
  const x = index >>> 0;
  return [
    (0x9e3779b9 ^ Math.imul(x, 0x85ebca6b)) >>> 0,
    Math.imul(x, 0xc2b2ae35) >>> 0,
    (x * 1103515245 + 12345) >>> 0,
    (x * 1664525 + 1013904223) >>> 0,
  ];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const [key, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) out[key] = inline;
    else if (argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}
