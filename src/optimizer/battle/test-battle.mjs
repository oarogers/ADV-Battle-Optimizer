import { team1, team2 } from "../../teams.mjs";
import { ShowdownBattleEngine } from "./showdown-adapter.mjs";

const engine = new ShowdownBattleEngine({ decisionTimeoutMs: 120_000 });
const result = await engine.run({
  format: "gen3ou",
  ourTeam: team1,
  opponentTeam: team2,
  seed: [1, 2, 3, 4],
  purpose: "smoke-test",
});

console.log(JSON.stringify({
  id: result.id,
  status: result.status,
  winner: result.winner,
  turns: result.turns,
  ourTeamId: result.ourTeamId,
  opponentTeamId: result.opponentTeamId,
  protocolBytes: result.protocolLog.length,
}, null, 2));

if (result.status !== "complete") {
  throw new Error("Battle did not complete");
}
