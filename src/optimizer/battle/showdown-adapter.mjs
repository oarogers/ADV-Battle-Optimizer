import pkg from "pokemon-showdown";
import { BattleEngine, validateBattleRequest } from "./battle-engine.mjs";
import { normalizeTeam } from "../domain/types.mjs";
import { battleId, canonicalJson, teamId } from "../domain/identity.mjs";

const { BattleStream, Teams, TeamValidator } = pkg;

export class ShowdownBattleEngine extends BattleEngine {
  constructor({ format = "gen3ou" } = {}) {
    super();
    this.format = format;
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
    const id = battleId({
      format: this.format,
      ourTeam: teamId(ourTeam),
      opponentTeam: teamId(opponentTeam),
      ourLead: request.ourLead ?? null,
      opponentLead: request.opponentLead ?? null,
      seed,
      engineVersion: pkg?.VERSION ?? "unknown",
    });

    // This adapter deliberately owns only simulation setup. Decision making
    // remains injectable so Foul Play can control either side later.
    const stream = new BattleStream();
    const packed1 = Teams.pack(ourTeam);
    const packed2 = Teams.pack(opponentTeam);
    const chunks = [];

    const consume = async (playerStream) => {
      for await (const chunk of playerStream) chunks.push(chunk);
    };

    const playerStreams = pkg.getPlayerStreams(stream);
    const readers = [consume(playerStreams.p1), consume(playerStreams.p2)];

    stream.write(`>start ${JSON.stringify({ formatid: this.format, seed })}`);
    stream.write(`>player p1 ${JSON.stringify({ name: "Optimizer", team: packed1 })}`);
    stream.write(`>player p2 ${JSON.stringify({ name: "Opponent", team: packed2 })}`);

    // The engine contract returns the raw protocol now. A decision adapter
    // will consume requests in the next battle-worker milestone.
    stream.write(`>p1 team 123456`);
    stream.write(`>p2 team 123456`);
    await Promise.race([
      Promise.all(readers),
      new Promise((resolve) => setTimeout(resolve, request.timeoutMs ?? 1000)),
    ]);

    return {
      id,
      format: this.format,
      ourTeamId: teamId(ourTeam),
      opponentTeamId: teamId(opponentTeam),
      seed,
      protocolLog: chunks.join(""),
      status: "simulator-ready",
      engineVersion: pkg?.VERSION ?? "unknown",
      canonicalRequest: canonicalJson({ ourTeam, opponentTeam, seed }),
    };
  }
}
