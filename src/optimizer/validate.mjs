import { team1, team2 } from "../teams.mjs";
import { normalizeTeam } from "./domain/types.mjs";
import { setId, teamId, opponentId, battleId } from "./domain/identity.mjs";
import { MemoryRepository } from "./persistence/memory-repository.mjs";

const a = normalizeTeam(team1);
const b = normalizeTeam(team2);

if (a.length !== 6 || b.length !== 6) throw new Error("Sample teams must contain six Pokemon");
if (new Set(a.map(setId)).size !== 6) throw new Error("Team 1 set identities are not unique");
if (teamId(a) === teamId(b)) throw new Error("Distinct teams produced the same identity");
if (!opponentId(b).startsWith("opp_")) throw new Error("Opponent identity failed");

const repository = new MemoryRepository();
const id = battleId({ format: "gen3ou", ourTeam: teamId(a), opponent: teamId(b), seed: [1, 2, 3, 4] });
await repository.beginBattle({ id, format: "gen3ou" });
await repository.completeBattle(id, { winner: "p1", turns: 42 });
const stored = await repository.getBattle(id);
if (stored.status !== "completed" || stored.winner !== "p1") throw new Error("Battle persistence failed");

console.log("Optimizer milestone 1 validation passed.");
console.log(`Team 1: ${teamId(a)}`);
console.log(`Team 2: ${teamId(b)}`);
console.log(`Battle: ${id}`);
