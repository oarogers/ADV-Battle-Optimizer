-- Persistent schema for optimizer milestone 1.
-- SQLite/PostgreSQL-compatible core SQL; the application layer supplies the adapter.

CREATE TABLE IF NOT EXISTS pokemon_sets (
  id TEXT PRIMARY KEY,
  species TEXT NOT NULL,
  name TEXT NOT NULL,
  item TEXT NOT NULL DEFAULT '',
  ability TEXT NOT NULL DEFAULT '',
  nature TEXT NOT NULL DEFAULT '',
  moves_json TEXT NOT NULL,
  evs_json TEXT NOT NULL,
  ivs_json TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 100,
  origin TEXT NOT NULL DEFAULT 'user',
  parent_set_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (parent_set_id) REFERENCES pokemon_sets(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT,
  format TEXT NOT NULL DEFAULT 'gen3ou',
  set_ids_json TEXT NOT NULL,
  lead_set_id TEXT,
  origin TEXT NOT NULL DEFAULT 'user',
  parent_team_ids_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opponents (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  archetype TEXT,
  source TEXT,
  popularity REAL,
  confidence REAL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS battle_runs (
  id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  our_team_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  our_lead TEXT,
  opponent_lead TEXT,
  seed_json TEXT,
  winner TEXT,
  turns INTEGER,
  remaining_pokemon INTEGER,
  engine_version TEXT,
  foul_play_version TEXT,
  purpose TEXT,
  status TEXT NOT NULL,
  error TEXT,
  protocol_log TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (our_team_id) REFERENCES teams(id),
  FOREIGN KEY (opponent_id) REFERENCES opponents(id)
);

CREATE TABLE IF NOT EXISTS battle_results (
  battle_id TEXT PRIMARY KEY,
  winner TEXT,
  loser TEXT,
  turns INTEGER,
  our_remaining INTEGER,
  opponent_remaining INTEGER,
  result_json TEXT NOT NULL,
  FOREIGN KEY (battle_id) REFERENCES battle_runs(id)
);

CREATE TABLE IF NOT EXISTS thresholds (
  id TEXT PRIMARY KEY,
  species TEXT NOT NULL,
  move TEXT,
  target_species TEXT,
  threshold_type TEXT NOT NULL,
  value_json TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '{}',
  source_battle_id TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discoveries (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  parent_entity_id TEXT,
  novelty_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_battles_matchup ON battle_runs(our_team_id, opponent_id);
CREATE INDEX IF NOT EXISTS idx_battles_status ON battle_runs(status);
CREATE INDEX IF NOT EXISTS idx_thresholds_lookup ON thresholds(species, target_species, threshold_type);
CREATE INDEX IF NOT EXISTS idx_discoveries_entity ON discoveries(entity_type, entity_id);
