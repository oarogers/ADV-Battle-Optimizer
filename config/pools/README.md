# Optimizer Pokémon pools

Pool membership is deliberately separate from imported Smogon data. This lets seasonal/custom formats enable or disable species without changing the source catalog.

## Simple pool

A pool can be a JSON array or an object with a `species` array:

```json
{
  "name": "Example Pool",
  "species": ["Swampert", "Metagross", "Gardevoir"]
}
```

## Emerald-derived pool

`emerald-base.json` defines the initial Emerald-derived availability rules. It starts from the Gen 3 National Dex, removes Pokémon that require other games and event-only Pokémon, then adds trade evolutions whose pre-evolutions are available.

The current MMO season inherits that base and adds its limited-distribution Pokémon:

```json
{
  "id": "mmo-season-1",
  "extends": "emerald-base.json",
  "addSpecies": ["Eevee", "Vaporeon", "Jolteon", "Flareon", "Espeon", "Umbreon", "Charmander", "Charmeleon", "Charizard"],
  "metadata": {
    "Eevee": {"availability": "limited", "origin": "mmo_gift"}
  }
}
```

Supported metadata availability values are intentionally small:

- `standard` — ordinary pool member
- `limited` — introduced through a limited MMO distribution/gift
- `event` — special-event-only access

Availability metadata is informational. It does **not** affect optimizer scoring; it can later be used to surface more accessible alternative teams without turning the optimizer into an MMO economy simulator.

## Importing

```bash
npm run import:smogon -- --pool config/pools/season-1.json
```

The generated catalog records the pool ID and per-species availability metadata alongside each imported set.
