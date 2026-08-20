import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

export class FoulPlayProcess {
  constructor({ root, side, timeoutMs = 60_000 }) {
    this.root = root;
    this.side = side;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.ready = false;
    this.waiters = [];
  }

  start({ format, userTeam, opponentTeam }) {
    const python = process.platform === "win32"
      ? path.join(this.root, ".venv", "Scripts", "python.exe")
      : path.join(this.root, ".venv", "bin", "python");
    const script = path.join(this.root, "bridge", "foul_play_bridge.py");
    this.child = spawn(python, [script], {
      cwd: this.root,
      env: {
        ...process.env,
        PYTHONPATH: [this.root, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.on("data", (chunk) => {
      if (process.env.DEBUG_FOUL_PLAY) process.stderr.write(`[foul-play ${this.side}] ${chunk}`);
    });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code) => {
      if (code !== 0) this.rejectAll(new Error(`Foul Play ${this.side} exited with code ${code}`));
    });
    const reader = createInterface({ input: this.child.stdout });
    reader.on("line", (line) => this.handleMessage(line));
    this.send({
      type: "init",
      format,
      user_side: this.side,
      opponent_side: this.side === "p1" ? "p2" : "p1",
      user_team: userTeam,
      opponent_team: opponentTeam,
    });
  }

  handleMessage(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.type === "ready") { this.ready = true; return; }
    if (msg.type === "error") {
      this.rejectAll(new Error(`Foul Play ${this.side}: ${msg.error}`));
      return;
    }
    if (msg.type === "recommendation") {
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(msg);
    }
  }

  send(message) {
    if (!this.child?.stdin.writable) throw new Error(`Foul Play ${this.side} is not running`);
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  update(chunk) { this.send({ type: "showdown", chunk }); }

  async waitForRecommendation() {
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (value) => { clearTimeout(waiter.timer); resolve(value); },
        reject: (error) => { clearTimeout(waiter.timer); reject(error); },
        timer: null,
      };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for Foul Play ${this.side} decision`));
      }, this.timeoutMs);
      this.waiters.push(waiter);
    });
  }

  rejectAll(error) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  stop() {
    if (!this.child) return;
    this.child.stdin.end();
    this.child.kill();
    this.child = null;
    this.ready = false;
  }
}

export function defaultFoulPlayRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../foul-play-src");
}
