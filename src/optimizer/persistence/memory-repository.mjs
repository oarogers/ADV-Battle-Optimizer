export class MemoryRepository {
  constructor() {
    this.battles = new Map();
    this.sets = new Map();
    this.teams = new Map();
    this.thresholds = new Map();
    this.discoveries = new Map();
  }

  async getBattle(id) { return this.battles.get(id) ?? null; }

  async beginBattle(record) {
    this.battles.set(record.id, { ...record, status: "running" });
  }

  async completeBattle(id, result) {
    const existing = this.battles.get(id) ?? { id };
    const completed = { ...existing, ...result, status: "completed" };
    this.battles.set(id, completed);
    return completed;
  }

  async failBattle(id, result) {
    const existing = this.battles.get(id) ?? { id };
    const failed = { ...existing, ...result, status: "failed" };
    this.battles.set(id, failed);
    return failed;
  }

  async putSet(set) { this.sets.set(set.id, set); return set; }
  async getSet(id) { return this.sets.get(id) ?? null; }
  async putTeam(team) { this.teams.set(team.id, team); return team; }
  async getTeam(id) { return this.teams.get(id) ?? null; }
  async putThreshold(threshold) { this.thresholds.set(threshold.id, threshold); return threshold; }
  async putDiscovery(discovery) { this.discoveries.set(discovery.id, discovery); return discovery; }
}
