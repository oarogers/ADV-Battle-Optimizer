/**
 * Engine-independent contract for one reproducible battle evaluation.
 * Implementations may use Showdown locally, a worker process, or another
 * simulator without changing the optimizer's domain model.
 */
export class BattleEngine {
  async run(_request) {
    throw new Error("BattleEngine.run() must be implemented by an adapter");
  }
}

export function validateBattleRequest(request) {
  if (!request?.ourTeam || !request?.opponentTeam) {
    throw new TypeError("Battle request requires ourTeam and opponentTeam");
  }
  if (request.ourTeam.length !== 6 || request.opponentTeam.length !== 6) {
    throw new RangeError("Battle request teams must contain six Pokemon");
  }
  return request;
}
