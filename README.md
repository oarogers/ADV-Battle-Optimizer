# ADV / Gen 3 + Foul Play Battle Optimizer

This project uses local Pokémon Showdown simulation as the authoritative ADV/Gen 3 battle engine and Foul Play as the battle decision engine. The long-term goal is a search/optimization system that can evaluate teams for tournament robustness, optimize leads and sets, and discover useful new sets and thresholds.

## Current architecture

    Web / optimizer
          |
          v
    Battle Worker
       /       \
      v         v
 Showdown    Foul Play
 simulator     AI
      \         /
       v       v
       Battle Result
             |
             v
       Persistence / knowledge

The optimizer domain is deliberately separated from both engines. See `src/optimizer/` for the domain identities, battle contracts, persistence schema, and worker orchestration.

## Milestone 1 — data and battle foundation

Implemented:

- Canonical, stable IDs for Pokémon sets, teams, opponents, and battle evaluations.
- Normalized ADV team/set domain types with explicit EV/IV/stat representation.
- Persistence schema covering sets, teams, opponents, battle runs/results, thresholds, and discoveries.
- In-memory repository used for tests and local development.
- Engine-independent `BattleEngine` contract.
- Showdown adapter boundary using the local `BattleStream` and `TeamValidator`.
- Foul Play adapter boundary for the existing JSON-lines bridge.
- `BattleWorker` orchestration with result caching and failure recording.
- Optimizer milestone validation script.

Run the existing bridge with:

    npm install
    ./scripts/setup-foul-play.sh
    npm run bridge

Run the optimizer foundation validation with:

    npm run validate:optimizer

## Battle correctness harness

`test-battle.mjs` now accepts normal Pokémon Showdown team export, packed, or JSON files. Showdown is authoritative for legality and battle state; a Foul Play recommendation is rejected before submission if it is not compatible with the current Showdown request. Any Showdown `|error|` or Foul Play bridge error aborts the battle instead of being silently ignored.

Example:

    npm run test:battle -- \
      --our-team ./teams/my-team.txt \
      --opponent-team ./teams/opponent.txt \
      --battles 100 \
      --save-interesting ./battle-logs

Useful options:

    --battles N                 Number of deterministic seeded battles (default 10)
    --our-team FILE             Showdown-format team for the optimizer side
    --opponent-team FILE        Showdown-format team for the opponent side
    --save-interesting DIR      Save protocol + decision JSON for draws, incomplete games, errors, and long games
    --interestingTurns N        Long-game threshold (default 80)
    --decisionTimeoutMs N       Foul Play recommendation timeout (default 15000)
    --battleTimeoutMs N         Whole-battle timeout (default 120000)

The harness prints per-battle outcomes and a final win/loss/draw summary, including average turns and decision count. Protocol events are stored in chronological arrival order rather than concatenating the two player streams afterward.

## Existing Foul Play bridge

The original POC uses a direct protocol bridge from a local Pokémon Showdown `BattleStream` into Foul Play's existing battle parser and MCTS search.

The bridge does NOT connect to the public Showdown server and does NOT require an LLM.

The bridge is intentionally a separate process. Foul Play source is not copied into this repository; the setup script clones the external checkout into `foul-play-src/`.

The bridge now passes the complete Showdown team set information it receives into Foul Play rather than reducing each set to only species/nature/EVs. It also treats battle-state parsing errors as fatal. This is important because silently continuing after a protocol update fails can leave Foul Play's internal state out of sync with Showdown.

## Important next step

The current battle harness is intended to make the Showdown/Foul Play loop auditable before using it for optimizer data. The next correctness work should add targeted regression teams for status, weather, Spikes, phazing, forced switches, and other state transitions, then compare the resulting Showdown protocol against the Foul Play state after each transition.

After that foundation is stable, the optimizer can be built on top of matchup aggregation, lead testing, threshold mining, and progressively more expensive team/set search.

## Requirements

- Node.js 20+
- npm
- Python 3.11+
- git
- Rust/Cargo (required by Foul Play's poke-engine dependency)

## Troubleshooting

If `npm run bridge` says Foul Play is not installed, run:

    ./scripts/setup-foul-play.sh

If Rust compilation fails, install current stable Rust through rustup rather than an old OS package-manager version.
