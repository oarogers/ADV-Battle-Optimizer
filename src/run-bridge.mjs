import pkg from "pokemon-showdown";
const { BattleStream, getPlayerStreams, Teams, TeamValidator } = pkg;
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { team1, team2 } from "./teams.mjs";

const validator = new TeamValidator("gen3ou");
for (const [name, team] of [["Team 1", team1], ["Team 2", team2]]) {
  const problems = validator.validateTeam(team);
  if (problems) throw new Error(`${name} illegal:\n${problems.join("\n")}`);
}

const foulPlayDir = new URL("../foul-play-src/", import.meta.url);
const python = process.platform === "win32"
  ? new URL("../foul-play-src/.venv/Scripts/python.exe", import.meta.url).pathname
  : new URL("../foul-play-src/.venv/bin/python", import.meta.url).pathname;

const bridge = spawn(python, ["bridge/foul_play_bridge.py"], {
  cwd: foulPlayDir,
  stdio: ["pipe", "pipe", "inherit"],
});

const bridgeReader = createInterface({ input: bridge.stdout });

let pendingRecommendation = null;
let bridgeReady = false;

bridgeReader.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === "ready") {
      bridgeReady = true;
      console.log("[bridge] Foul Play initialized");
    } else if (msg.type === "recommendation") {
      pendingRecommendation = msg;
      console.log(`[Foul Play] recommended: ${msg.decision} ` +
                  `(search ${msg.elapsed_ms} ms)`);
    } else if (msg.type === "error") {
      console.error("[Foul Play error]", msg.error);
    }
  } catch {
    console.error("[bridge raw]", line);
  }
});

function bridgeSend(obj) {
  bridge.stdin.write(JSON.stringify(obj) + "\n");
}

const stream = new BattleStream();
const streams = getPlayerStreams(stream);

async function consumePlayer(playerStream, playerName) {
  for await (const chunk of playerStream) {
    if (playerName === "p1" && bridgeReady) {
      bridgeSend({ type: "showdown", chunk });
    }

    if (chunk.includes("|teampreview|")) {
      stream.write(`>${playerName} team 123456`);
      continue;
    }

    if (playerName === "p2") {
      for (const line of chunk.split("\n")) {
        const i = line.indexOf("|request|");
        if (i >= 0) {
          try {
            const req = JSON.parse(line.slice(i + "|request|".length));
            if (req.forceSwitch?.[0]) stream.write(">p2 switch 1");
            else if (req.active?.[0]?.moves?.length) stream.write(">p2 move 1");
          } catch {}
        }
      }
    }
  }
}

async function main() {
  const packed1 = Teams.pack(team1);
  const packed2 = Teams.pack(team2);

  bridgeSend({
    type: "init",
    format: "gen3ou",
    user_side: "p1",
    opponent_side: "p2",
    user_team: team1,
    opponent_team: team2
  });

  await new Promise(r => setTimeout(r, 1000));

  stream.write(`>start ${JSON.stringify({
    formatid: "gen3ou",
    seed: [1, 2, 3, 4]
  })}`);
  stream.write(`>player p1 ${JSON.stringify({name: "FoulPlayPOC", team: packed1})}`);
  stream.write(`>player p2 ${JSON.stringify({name: "DummyPOC", team: packed2})}`);

  await Promise.all([
    consumePlayer(streams.p1, "p1"),
    consumePlayer(streams.p2, "p2"),
  ]);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
