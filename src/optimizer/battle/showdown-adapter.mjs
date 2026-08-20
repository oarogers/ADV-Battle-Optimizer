import pkg from "pokemon-showdown";
import { BattleEngine, validateBattleRequest } from "./battle-engine.mjs";
import { normalizeTeam } from "../domain/types.mjs";
import { FoulPlayProcess, defaultFoulPlayRoot } from "./foul-play-process.mjs";
import { teamId, battleId, canonicalJson } from "../domain/identity.mjs";

const { BattleStream, Teams, TeamValidator, getPlayerStreams } = pkg;

export class ShowdownBattleEngine extends BattleEngine {
  constructor({ format = "gen3ou", foulPlayRoot = defaultFoulPlayRoot(), decisionTimeoutMs = 60_000 } = {}) {
    super();
    this.format = format;
    this.foulPlayRoot = foulPlayRoot;
    this.decisionTimeoutMs = decisionTimeoutMs;
    this.validator = new TeamValidator(format);
  }

  validateTeam(team) {
    const normalized = normalizeTeam(team);
    const problems = this.validator.validateTeam(normalized);
    if (problems?.length) throw new Error(`Illegal ${this.format} team:\n${problems.join("\n")}`);
    return normalized;
  }

  async run(request) {
    validateBattleRequest(request);
    const ourTeam = this.validateTeam(request.ourTeam);
    const opponentTeam = this.validateTeam(request.opponentTeam);
    const seed = request.seed ?? [1, 2, 3, 4];
    const ourTeamId = teamId(ourTeam);
    const opponentTeamId = teamId(opponentTeam);
    const id = battleId({ format: this.format, ourTeam: ourTeamId, opponentTeam: opponentTeamId, ourLead: request.ourLead ?? null, opponentLead: request.opponentLead ?? null, seed, engineVersion: pkg?.VERSION ?? "unknown", ai: "foul-play" });

    const stream = new BattleStream();
    const playerStreams = getPlayerStreams(stream);
    const chunks = { p1: [], p2: [] };
    const foulPlay = {
      p1: new FoulPlayProcess({ root: this.foulPlayRoot, side: "p1", timeoutMs: this.decisionTimeoutMs }),
      p2: new FoulPlayProcess({ root: this.foulPlayRoot, side: "p2", timeoutMs: this.decisionTimeoutMs }),
    };
    const teams = { p1: ourTeam, p2: opponentTeam };
    let battleFinished = false;

    const consume = async (side, playerStream) => {
      for await (const chunk of playerStream) {
        chunks[side].push(chunk);
        if (chunk.includes("|win|") || chunk.includes("|tie|")) {
          battleFinished = true;
          // A BattleStream player iterator may remain open after the terminal
          // protocol message. Return immediately; the battle result is already
          // fully represented by the chunks received so far.
          return;
        }
        if (battleFinished) return;

        const isRequest = chunk.includes("|request|");
        const waiter = isRequest ? foulPlay[side].waitForRecommendation() : null;
        foulPlay[side].update(chunk);

        if (chunk.includes("|teampreview|")) {
          const requestedLead = side === "p1" ? request.ourLead : request.opponentLead;
          stream.write(`>${side} team ${previewOrder(teams[side], requestedLead)}`);
          continue;
        }

        if (waiter) {
          const decision = await waiter;
          if (battleFinished) return;
          if (decision.decision) {
            const safeDecision = validateAdvDecision(decision.decision, this.format);
            stream.write(`>${side} ${safeDecision}`);
          }
        }
      }
    };

    try {
      foulPlay.p1.start({ format: this.format, userTeam: ourTeam, opponentTeam });
      foulPlay.p2.start({ format: this.format, userTeam: opponentTeam, opponentTeam: ourTeam });

      await Promise.all([foulPlay.p1.waitUntilReady(), foulPlay.p2.waitUntilReady()]);

      stream.write(`>start ${JSON.stringify({ formatid: this.format, seed })}`);
      stream.write(`>player p1 ${JSON.stringify({ name: "Optimizer", team: Teams.pack(ourTeam) })}`);
      stream.write(`>player p2 ${JSON.stringify({ name: "Opponent", team: Teams.pack(opponentTeam) })}`);

      // Once Showdown has declared a result, the player iterators are allowed
      // to remain open internally. Do not make battle completion depend on
      // those iterators closing.
      await Promise.race([
        Promise.all([consume("p1", playerStreams.p1), consume("p2", playerStreams.p2)]),
        waitForBattleCompletion(15_000),
      ]);

      const protocolLog = [...chunks.p1.map((chunk) => `[p1]\n${chunk}`), ...chunks.p2.map((chunk) => `[p2]\n${chunk}`)].join("\n");
      const winner = parseWinner(protocolLog);
      return { id, format: this.format, ourTeamId, opponentTeamId, seed, winner, turns: parseTurns(protocolLog), status: winner ? "complete" : "incomplete", protocolLog, engineVersion: pkg?.VERSION ?? "unknown", ai: "foul-play", canonicalRequest: canonicalJson({ ourTeam, opponentTeam, seed }) };
    } finally {
      foulPlay.p1.stop();
      foulPlay.p2.stop();
    }
  }
}

function waitForBattleCompletion(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Showdown battle did not complete within ${ms} ms`)), ms));
}

function previewOrder(team, lead) {
  const species = lead?.species ?? lead?.name ?? lead;
  const index = species ? team.findIndex((set) => String(set.species).toLowerCase() === String(species).toLowerCase()) : -1;
  if (index < 0) return "123456";
  return [index, ...team.map((_, i) => i).filter((i) => i !== index)].map((i) => i + 1).join("");
}

function validateAdvDecision(decision, format) {
  if (format !== "gen3ou") return decision;
  const normalized = String(decision).trim();
  if (/\bterastallize\b/i.test(normalized) || /\bmega\b/i.test(normalized) || /\bzmove\b/i.test(normalized) || /\bdynamax\b/i.test(normalized)) {
    throw new Error(`Foul Play produced a non-ADV action for ${format}: ${normalized}`);
  }
  return normalized;
}

function parseWinner(log) { return log.match(/\|win\|([^\n|]+)/)?.[1] ?? null; }
function parseTurns(log) { const matches = [...log.matchAll(/\|turn\|(\d+)/g)]; return matches.length ? Number(matches[matches.length - 1][1]) : 0; }
