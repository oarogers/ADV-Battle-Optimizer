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

## Existing Foul Play bridge

The original POC uses a direct protocol bridge from a local Pokémon Showdown `BattleStream` into Foul Play's existing battle parser and MCTS search.

The bridge does NOT connect to the public Showdown server and does NOT require an LLM.

The bridge is intentionally a separate process. Foul Play source is not copied into this repository; the setup script clones the external checkout into `foul-play-src/`.

## Important next step

The current Showdown adapter establishes the simulator contract but intentionally does not yet own battle decision-making. The next milestone should turn it into a reusable battle worker that can run arbitrary six-Pokémon teams, pass every Showdown request through the Foul Play adapter, capture the complete protocol/replay, and persist a completed `BattleResult`.

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
