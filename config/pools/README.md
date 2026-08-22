# Optimizer Pokémon pools

A pool file is a JSON array of species names, or an object with a `species` array.

Example:

```json
{
  "name": "MMO Season 1",
  "species": [
    "Swampert",
    "Metagross",
    "Gardevoir"
  ]
}
```

The Smogon importer accepts a pool file with:

```bash
npm run import:smogon -- --pool config/pools/season-1.json
```

Pool membership is deliberately separate from the imported Smogon data. A future season can therefore enable or disable species without changing the source catalog.
