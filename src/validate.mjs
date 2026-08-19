import pkg from "pokemon-showdown";
const { TeamValidator } = pkg;
import { team1, team2 } from "./teams.mjs";

for (const [name, team] of [["Team 1", team1], ["Team 2", team2]]) {
  const problems = new TeamValidator("gen3ou").validateTeam(team);
  if (problems) {
    console.error(`${name} illegal:\n${problems.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`${name}: legal under gen3ou`);
  }
}
