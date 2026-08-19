/**
 * Foul Play integration boundary.
 *
 * The existing POC speaks to Foul Play over JSONL. This interface keeps that
 * process-specific protocol out of the optimizer and lets us replace it with
 * a persistent worker later.
 */
export class FoulPlayAdapter {
  async start(_request) {
    throw new Error("FoulPlayAdapter.start() must be implemented");
  }

  async update(_battleProtocolChunk) {
    throw new Error("FoulPlayAdapter.update() must be implemented");
  }

  async getDecision(_request) {
    throw new Error("FoulPlayAdapter.getDecision() must be implemented");
  }

  async stop() {}
}

export class JsonlFoulPlayAdapter extends FoulPlayAdapter {
  constructor({ send, timeoutMs = 30_000 } = {}) {
    super();
    if (typeof send !== "function") throw new TypeError("JsonlFoulPlayAdapter requires send()");
    this.send = send;
    this.timeoutMs = timeoutMs;
  }

  async start(request) {
    this.send({ type: "init", ...request });
  }

  async update(chunk) {
    this.send({ type: "showdown", chunk });
  }

  async getDecision(request) {
    this.send({ type: "decision", ...request });
    // The process owner resolves decisions. Keeping this method abstract at
    // the transport level avoids coupling the optimizer to stdout handling.
    return { status: "pending", timeoutMs: this.timeoutMs };
  }
}
