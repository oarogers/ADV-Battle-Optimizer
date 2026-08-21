import pkg from "pokemon-showdown";
import { BattleEngine, validateBattleRequest } from "./battle-engine.mjs";
import { normalizeTeam } from "../domain/types.mjs";
import { FoulPlayProcess, defaultFoulPlayRoot } from "./foul-play-process.mjs";
import { teamId, battleId, canonicalJson } from "../domain/identity.mjs";

const { BattleStream, Teams, TeamValidator, getPlayerStreams } = pkg;

export class ShowdownBattleEngine extends BattleEngine {
  constructor({ format = "gen3ou", foulPlayRoot = defaultFoulPlayRoot(), decisionTimeoutMs = 60_000, battleTimeoutMs = 120_000 } = {}) {
    super();
    this.format = format;
    this.foulPlayRoot = foulPlayRoot;
    this.decisionTimeoutMs = decisionTimeoutMs;
    this.battleTimeoutMs = battleTimeoutMs;
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
    const protocol = [];
    const decisions = [];
    const requests = { p1: null, p2: null };
    const foulPlay = {
      p1: new FoulPlayProcess({ root: this.foulPlayRoot, side: "p1", timeoutMs: this.decisionTimeoutMs }),
      p2: new FoulPlayProcess({ root: this.foulPlayRoot, side: "p2", timeoutMs: this.decisionTimeoutMs }),
    };
    const teams = { p1: ourTeam, p2: opponentTeam };
    let battleFinished = false;

    const debug = (message) => {
      if (process.env.DEBUG_SHOWDOWN) process.stderr.write(`[showdown] ${message}\n`);
    };

    const consume = async (side, playerStream) => {
      for await (const chunk of playerStream) {
        chunks[side].push(chunk);
        protocol.push({ side, chunk });
        debug(`${side} <- ${JSON.stringify(chunk)}`);

        if (chunk.includes("|error|")) {
          throw new Error(`Showdown ${side} emitted an error:\n${chunk}`);
        }
        if (chunk.includes("|win|") || chunk.includes("|tie|")) {
          battleFinished = true;
          debug(`${side}: terminal result received`);
          return;
        }

        const isRequest = chunk.includes("|request|");
        if (isRequest) requests[side] = parseLatestRequest(chunk);
        const waiter = isRequest ? foulPlay[side].waitForRecommendation() : null;
        foulPlay[side].update(chunk);

        if (chunk.includes("|teampreview|")) {
          const requestedLead = side === "p1" ? request.ourLead : request.opponentLead;
          const command = `>${side} team ${previewOrder(teams[side], requestedLead)}`;
          debug(`${side} -> ${command}`);
          stream.write(command);
          decisions.push({ side, turn: parseTurns(chunk), decision: command.slice(side.length + 2), source: "team-preview" });
          continue;
        }

        if (waiter) {
          const decision = await waiter;
          if (battleFinished) return;
          if (!decision.decision) throw new Error(`Foul Play ${side} returned an empty decision`);
          const safeDecision = validateAdvDecision(decision.decision, this.format, requests[side], decision.rqid);
          const command = `>${side} ${safeDecision}`;
          debug(`${side} -> ${command}`);
          decisions.push({ side, turn: parseTurns(chunk), decision: safeDecision, rqid: decision.rqid, elapsed_ms: decision.elapsed_ms });
          stream.write(command);
        }
      }
    };

    try {
      foulPlay.p1.start({ format: this.format, userTeam: ourTeam, opponentTeam });
      foulPlay.p2.start({ format: this.format, userTeam: opponentTeam, opponentTeam: ourTeam });
      await Promise.all([foulPlay.p1.waitUntilReady(), foulPlay.p2.waitUntilReady()]);

      debug(`start format=${this.format} seed=${JSON.stringify(seed)}`);
      stream.write(`>start ${JSON.stringify({ formatid: this.format, seed })}`);
      stream.write(`>player p1 ${JSON.stringify({ name: "Optimizer", team: Teams.pack(ourTeam) })}`);
      stream.write(`>player p2 ${JSON.stringify({ name: "Opponent", team: Teams.pack(opponentTeam) })}`);

      await Promise.race([
        Promise.all([consume("p1", playerStreams.p1), consume("p2", playerStreams.p2)]),
        waitForBattleCompletion(this.battleTimeoutMs, chunks),
      ]);

      const protocolLog = protocol.map(({ side, chunk }) => `[${side}]\n${chunk}`).join("\n");
      const winner = parseWinner(protocolLog);
      return {
        id, format: this.format, ourTeamId, opponentTeamId, seed, winner,
        outcome: winner === "Optimizer" ? "win" : winner === "Opponent" ? "loss" : winner === "tie" ? "draw" : "incomplete",
        turns: parseTurns(protocolLog), decisions, status: winner ? "complete" : "incomplete", protocolLog,
        engineVersion: pkg?.VERSION ?? "unknown", ai: "foul-play", canonicalRequest: canonicalJson({ ourTeam, opponentTeam, seed }),
      };
    } finally {
      foulPlay.p1.stop();
      foulPlay.p2.stop();
    }
  }
}

function waitForBattleCompletion(ms, chunks) {
  return new Promise((_, reject) => setTimeout(() => {
    const recent = [...chunks.p1.slice(-3).map((chunk) => `[p1] ${chunk}`), ...chunks.p2.slice(-3).map((chunk) => `[p2] ${chunk}`)].join("\n");
    reject(new Error(`Showdown battle did not complete within ${ms} ms. Last protocol chunks:\n${recent || "<none>"}`));
  }, ms));
}

function previewOrder(team, lead) {
  const species = lead?.species ?? lead?.name ?? lead;
  const index = species ? team.findIndex((set) => String(set.species).toLowerCase() === String(species).toLowerCase()) : -1;
  if (index < 0) return "123456";
  return [index, ...team.map((_, i) => i).filter((i) => i !== index)].map((i) => i + 1).join("");
}

function parseLatestRequest(chunk) {
  const matches = [...chunk.matchAll(/\|request\|([^\n]+)/g)];
  if (!matches.length) return null;
  try { return JSON.parse(matches[matches.length - 1][1]); }
  catch (error) { throw new Error(`Malformed Showdown request JSON: ${error.message}`); }
}

function normalizeMoveName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validateAdvDecision(decision, format, request, rqid) {
  let normalized = String(decision).trim();
  if (normalized.startsWith("/choose ")) normalized = normalized.slice("/choose ".length).trim();
  // Foul Play may emit a Showdown-style slash command directly. Strip only the
  // command marker; the action still has to pass the request-based legality checks below.
  if (/^\/(?:move|switch)\s+/i.test(normalized)) normalized = normalized.slice(1).trim();
  if (!normalized) throw new Error("Foul Play produced an empty decision");
  if (/\b(terastallize|mega|zmove|dynamax|max|gigantamax)\b/i.test(normalized)) {
    throw new Error(`Foul Play produced a non-ADV action for ${format}: ${normalized}`);
  }
  if (normalized.includes(",")) throw new Error(`Foul Play produced a multi-choice action in singles: ${normalized}`);
  if (!request) throw new Error(`No Showdown request available while validating Foul Play decision: ${normalized}`);
  if (rqid != null && request.rqid != null && Number(rqid) !== Number(request.rqid)) {
    throw new Error(`Stale Foul Play request id ${rqid}; Showdown is waiting on ${request.rqid}`);
  }

  const numericMatch = /^(move|switch)\s+(\d+)$/i.exec(normalized);
  const namedMoveMatch = /^move\s+(.+)$/i.exec(normalized);
  if (!numericMatch && !namedMoveMatch) {
    throw new Error(`Foul Play produced an unsupported ADV decision syntax: ${normalized}`);
  }

  let kind;
  let slot;
  if (numericMatch) {
    kind = numericMatch[1].toLowerCase();
    slot = Number(numericMatch[2]);
  } else {
    kind = "move";
    const requestedName = normalizeMoveName(namedMoveMatch[1]);
    const moves = request.active?.[0]?.moves ?? [];
    const matches = moves
      .map((move, index) => ({ move, index }))
      .filter(({ move }) => normalizeMoveName(move.move) === requestedName);
    if (matches.length === 0) {
      throw new Error(`Foul Play selected a move not present in the current Showdown request: ${namedMoveMatch[1]}`);
    }
    if (matches.length > 1) {
      throw new Error(`Foul Play selected an ambiguous move name in the current Showdown request: ${namedMoveMatch[1]}`);
    }
    slot = matches[0].index + 1;
    normalized = `move ${slot}`;
  }

  if (kind === "move") {
    if (request.forceSwitch) throw new Error(`Foul Play attempted a move during a forced switch: ${normalized}`);
    const move = request.active?.[0]?.moves?.[slot - 1];
    if (!move) throw new Error(`Foul Play selected nonexistent move slot ${slot}`);
    if (move.disabled) throw new Error(`Foul Play selected disabled move ${slot}: ${move.move}`);
    if (Number(move.pp) <= 0) throw new Error(`Foul Play selected move ${slot} with no PP: ${move.move}`);
  } else {
    if (slot < 1 || slot > (request.side?.pokemon?.length ?? 0)) throw new Error(`Foul Play selected nonexistent switch slot ${slot}`);
    const target = request.side.pokemon[slot - 1];
    if (!target || target.active || /fnt/i.test(target.condition ?? "") || /^0(?:\/|\s|$)/.test(target.condition ?? "")) {
      throw new Error(`Foul Play selected an illegal switch target: slot ${slot}`);
    }
  }
  return normalized;
}

function parseWinner(log) {
  if (/\|tie(?:\||$)/.test(log)) return "tie";
  return log.match(/\|win\|([^\n|]+)/)?.[1] ?? null;
}
function parseTurns(log) { const matches = [...log.matchAll(/\|turn\|(\d+)/g)]; return matches.length ? Number(matches[matches.length - 1][1]) : 0; }
