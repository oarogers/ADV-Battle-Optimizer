import { battleId, teamId } from "../domain/identity.mjs";

/**
 * Orchestrates one simulation while keeping persistence and AI concerns out
 * of the simulator adapter.
 */
export class BattleWorker {
  constructor({ engine, foulPlay = null, repository = null }) {
    if (!engine) throw new TypeError("BattleWorker requires a battle engine");
    this.engine = engine;
    this.foulPlay = foulPlay;
    this.repository = repository;
  }

  async run(request) {
    const startedAt = new Date().toISOString();
    const ourTeamId = teamId(request.ourTeam);
    const opponentTeamId = teamId(request.opponentTeam);
    const id = battleId({
      format: request.format ?? "gen3ou",
      ourTeamId,
      opponentTeamId,
      seed: request.seed ?? [1, 2, 3, 4],
      purpose: request.purpose ?? "evaluation",
    });

    if (this.repository) {
      const cached = await this.repository.getBattle(id);
      if (cached) return cached;
      await this.repository.beginBattle({ id, ...request, ourTeamId, opponentTeamId, startedAt });
    }

    try {
      const result = await this.engine.run(request);
      if (this.repository) await this.repository.completeBattle(id, {
        ...result,
        startedAt,
        completedAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      if (this.repository) await this.repository.failBattle(id, {
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
