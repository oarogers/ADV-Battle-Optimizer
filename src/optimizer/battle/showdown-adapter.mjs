import pkg from "pokemon-showdown";
import { BattleEngine, validateBattleRequest } from "./battle-engine.mjs";
import { normalizeTeam } from "../domain/types.mjs";
import { teamId, battleId, canonicalJson } from "../domain/identity.mjs";
import { FoulPlayProcess, defaultFoulPlayRoot } from "./foul-play-process.mjs";

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
    const id = battleId({
      format: this.format,
      ourTeam: ourTeamId,
      opponentTeam: opponentTeamId,
      ourLead: request.ourLead ?? null,
      opponentLead: request.opponentLead ?? null,
      seed,
      engineVersion: pkg?.VERSION ?? "unknown",
      ai: "foul-play",
    });

    const stream = new BattleStream();
    const playerStreams = getPlayerStreams(stream);
    const chunks = { p1: [], p2: [] };
    const foulPlay = {
      p1: new FoulPlayProcess({ root: this.foulPlayRoot, side: "p1", timeoutMs: this.decisionTimeoutMs }),
      p2: new FoulPlayProcess({ root: this.foulPlayRoot, side: "p2", timeoutMs: this.decisionTimeoutMs }),
    };

    const consume = async (side, playerStream) => {
      for await (const chunk of playerStream) {
        chunks[side].push(chunk);
        foulPlay[side].update(chunk);

        // Team preview is a separate protocol phase. Foul Play's bridge is
        // initialized for non-preview battle state, so select the first six
        // slots here. Explicit leads are supported by selecting the requested
        // slot when supplied; otherwise slot 1 is used as the deterministic
        // default until lead optimization is added.
        if (chunk.includes("|teampreview|")) {
          const requested = side === "p1" ? request.ourLead : request.opponentLead;
          const index = requested ? ourTeam.indexOf(requested) + 1 : 1;
          stream.write(`>${side} team ${index > 0 ? index : 1}`);
          continue;
        }

        if (chunk.includes("|request|")) {
          const decision = await foulPlay[side].waitForRecommendation();
          if (decision.decision) stream.write(`>${side} ${decision.decision}`);
        }
      }
    };

    try {
      foulPlay.p1.start({ format: this.format, userTeam: ourTeam, opponentTeam });
      foulPlay.p2.start({ format: this.format, userTeam: opponentTeam, opponentTeam: ourTeam });

      stream.write(`>start ${JSON.stringify({ formatid: this.format, seed })}`);
      stream.write(`>player p1 ${JSON.stringify({ name: "Optimizer", team: Teams.pack(ourTeam) })}`);
      stream.write(`>player p2 ${JSON.stringify({ name: "Opponent", team: Teams.pack(opponentTeam) })}`);

      await Promise.all([
        consume("p1", playerStreams.p1),
        consume("p2", playerStreams.p2),
      ]);

      const protocolLog = chunks.p1.map((chunk) => `[p1]\n${chunk}`).concat(
        chunks.p2.map((chunk) => `[p2]\n${chunk}`),
      ).join("\n");
      const winner = parseWinner(protocolLog);
      const turns = parseTurns(protocolLog);

      return {
        id,
        format: this.format,
        ourTeamId,
        opponentTeamId,
        seed,
        winner,
        turns,
        status: winner ? "complete" : "incomplete",
        protocolLog,
        engineVersion: pkg?.VERSION ?? "unknown",
        ai: "foul-play",
        canonicalRequest: canonicalJson({ ourTeam, opponentTeam, seed }),
      };
    } finally {
      foulPlay.p1.stop();
      foulPlay.p2.stop();
    }
  }
}

function parseWinner(log) {
  const match = log.match(/\|win\|([^\n|]+)/);
  return match?.[1] ?? null;
}

function parseTurns(log) {
  const matches = [...log.matchAll(/\|turn\|(\d+)/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : 0;
}
