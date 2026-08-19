# ADV / Gen 3 + Foul Play Bridge POC

This extends the first POC with a **direct protocol bridge** from a local
Pokémon Showdown `BattleStream` into Foul Play's existing battle parser and MCTS search.

The bridge does NOT connect to the public Showdown server and does NOT require
an LLM.

Architecture:

    Node / Showdown BattleStream
             |
             | JSON lines containing Showdown protocol chunks
             v
    Python foul_play_bridge.py
             |
             v
    Foul Play Battle + protocol parser
             |
             v
    Foul Play `async_pick_move()`
             |
             v
    Foul Play MCTS / poke-engine
             |
             | JSON line containing recommendation
             v
    Node
             |
             v
    Showdown BattleStream

## Requirements

- Node.js 20+
- npm
- Python 3.11+
- git
- Rust/Cargo (required by Foul Play's poke-engine dependency)

## Setup

1. `npm install`
2. `./scripts/setup-foul-play.sh`
3. `npm run bridge`

The setup script clones the current Foul Play repository into
`foul-play-src/` and creates a Python virtual environment.

## What this POC proves

It uses Showdown as the authoritative Gen 3 simulator, while Foul Play
maintains a parallel view of the battle and supplies move recommendations.

The bridge is intentionally a separate process. This is the safest first
integration because Foul Play's public battle loop already consumes Showdown
protocol messages and calls `async_pick_move()` when a decision is required.

The bridge initializes Foul Play's `Battle` from the first Gen 3 request and
opponent switch, then feeds subsequent Showdown protocol messages through
Foul Play's `async_update_battle()`.

## Important limitation

This is a bridge POC, not the final optimizer.

It currently assumes a standard ADV battle with no team preview (`gen3ou`) and
uses the sample teams in `src/teams.mjs`. The next step is to make the bridge
accept arbitrary teams, arbitrary custom rules, and a serialized battle
position from the web application.

The bridge also intentionally does not copy Foul Play source into this
repository. It imports Foul Play from the separately cloned local checkout.

## Foul Play integration details

The current Foul Play code has:

- `Battle` in `fp.battle.state`
- `async_update_battle()` in `fp.battle.protocol`
- `async_pick_move()` in `fp.modes.base`
- `StandardBattleMode` for standard battles
- explicit Gen 3 mechanics
- MCTS through `poke_engine`

This POC uses those existing seams instead of modifying Foul Play itself.

## Troubleshooting

If `npm run bridge` says Foul Play is not installed, run:

    ./scripts/setup-foul-play.sh

If Rust compilation fails, install Rust/Cargo and rerun the setup.

If Foul Play's current API has changed, the bridge will fail loudly rather than
silently falling back to a fake recommendation.

## Verified 2025-08-19

- Confirmed every internal Foul Play API this bridge touches (`Battle`,
  `start_non_team_preview_battle`, `async_update_battle`, `process_battle_updates`,
  `async_pick_move`, `StandardBattleMode`, `FormatSpec`, `SmogonSets`/`TeamDatasets`,
  `FoulPlayConfig.smogon_stats`) against the real `pmariglia/foul-play` source. All present,
  signatures match exactly.
- **Fixed a real bug**: `pokemon-showdown` is CommonJS; `import { TeamValidator } from
  "pokemon-showdown"` crashes under Node's ESM interop. Both `validate.mjs` and
  `run-bridge.mjs` now use `import pkg from "pokemon-showdown"; const { TeamValidator } = pkg;`
  instead. `npm run validate` now runs and confirms both sample teams are legal `gen3ou` teams.
- Ran the setup script for real: clones correctly, pure-Python deps install fine, and
  `fp.battle.state.Battle` imports standalone with no issues. Installing `poke-engine` (Rust)
  requires Rust with the `edition2024` feature — i.e. genuinely current stable Rust via
  **rustup**, not an OS package manager. Ubuntu's apt-packaged `cargo`/`rustc` (1.75) is too
  old and will fail. Use https://rustup.rs, not `apt install cargo rustc`.
