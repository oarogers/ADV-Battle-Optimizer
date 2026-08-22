import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pkg from "pokemon-showdown";
import { normalizeSet } from "../src/optimizer/domain/types.mjs";
import { setId } from "../src/optimizer/domain/identity.mjs";
import { classifySet } from "../src/optimizer/sets/role-classifier.mjs";

const { Dex, TeamValidator } = pkg;

const DEFAULT_FORMAT = "gen3ou";
const DEFAULT_URL = `https://play.pokemonshowdown.com/data/sets/${DEFAULT_FORMAT}.json`;

const args = parseArgs(process.argv.slice(2));
const format = args.format ?? DEFAULT_FORMAT;
const source = args.source ?? "dex";
const url = args.url ?? `https://play.pokemonshowdown.com/data/sets/${format}.json`;
const output = args.output ?? `data/generated/smogon-${format}.json`;
const pool = args.pool ? await loadPool(args.pool) : null;

if (format !== "gen3ou") {
  throw new Error(`This importer currently targets ADV/Gen 3 data; got ${format}.`);
}

const response = await fetch(url);
if (!response.ok) throw new Error(`Unable to fetch ${url}: HTTP ${response.status}`);
const payload = await response.json();
const sourceData = payload?.[source] ?? payload;
if (!sourceData || typeof sourceData !== "object") {
  throw new Error(`No ${source} set source found in ${url}`);
}

const dex = Dex.forFormat(format);
const validator = new TeamValidator(format);
const records = [];
const rejected = [];

for (const [species, namedSets] of Object.entries(sourceData)) {
  if (pool && !pool.has(species)) continue;
  if (!namedSets || typeof namedSets !== "object") continue;

  const speciesData = dex.species.get(species);
  for (const [name, rawSet] of Object.entries(namedSets)) {
    try {
      const set = normalizeSet({
        ...rawSet,
        species,
        name,
        item: rawSet.item ?? "",
        ability: rawSet.ability ?? "",
        nature: rawSet.nature ?? "",
        moves: rawSet.moves ?? [],
        evs: rawSet.evs ?? {},
        ivs: rawSet.ivs ?? {},
        level: rawSet.level ?? 100,
      });

      const problems = validator.validateSet(set, {});
      if (problems?.length) {
        rejected.push({ species, name, problems });
        continue;
      }

      const tags = classifySet(set, speciesData);
      records.push({
        id: setId(set),
        ...set,
        source: {
          provider: "smogon",
          transport: "pokemon-showdown-set-data",
          sourceType: source,
          format,
          url,
        },
        tags,
      });
    } catch (error) {
      rejected.push({ species, name, problems: [error.message] });
    }
  }
}

const result = {
  schemaVersion: 1,
  importedAt: new Date().toISOString(),
  format,
  source,
  sourceUrl: url,
  pool: pool ? [...pool].sort() : null,
  count: records.length,
  rejectedCount: rejected.length,
  sets: records,
  rejected,
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`);

console.log(`Imported ${records.length} ${format} ${source} sets.`);
if (pool) console.log(`Pool filter: ${pool.size} species.`);
if (rejected.length) console.log(`Rejected ${rejected.length} sets during Showdown validation.`);
console.log(`Wrote ${output}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    parsed[key] = inline ?? argv[++i];
  }
  return parsed;
}

async function loadPool(filename) {
  const data = JSON.parse(await fs.readFile(filename, "utf8"));
  const species = Array.isArray(data) ? data : data.species;
  if (!Array.isArray(species) || !species.length) {
    throw new Error(`Pool file ${filename} must contain an array or {"species": [...]}.`);
  }
  return new Set(species.map(String));
}
