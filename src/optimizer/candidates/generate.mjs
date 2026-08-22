/**
 * Generate an initial population of candidate teams from the imported set catalog.
 *
 * This intentionally does not encode ADV OU team archetypes. The first population
 * should explore the legal set space and let battle results teach us what works.
 */

const DEFAULTS = {
  populationSize: 1000,
  randomFraction: 0.5,
  roleBalancedFraction: 0.3,
  coreFraction: 0.2,
};

const unique = values => [...new Set(values)];

function shuffle(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function bySpecies(sets) {
  const map = new Map();
  for (const set of sets) {
    const species = set.species;
    if (!species) continue;
    if (!map.has(species)) map.set(species, []);
    map.get(species).push(set);
  }
  return map;
}

function randomTeam(sets, rng) {
  const species = shuffle(unique(sets.map(set => set.species)), rng).slice(0, 6);
  const groups = bySpecies(sets);
  return species.map(name => groups.get(name)[Math.floor(rng() * groups.get(name).length)]);
}

function scoreRoles(set) {
  const tags = new Set([
    ...(set.tags?.roles ?? []),
    ...(set.tags?.functions ?? []),
    ...(set.tags?.style ?? []),
  ]);

  const preferred = [
    'physical_offense', 'special_offense', 'physical_wall', 'special_wall',
    'setup_sweeper', 'hazard_setter', 'hazard_removal', 'phazer',
    'recovery', 'status_support', 'speed_control', 'weather', 'trapper',
  ];
  return preferred.reduce((score, role, index) => score + (tags.has(role) ? 1 + (preferred.length - index) / 100 : 0), 0);
}

function roleBalancedTeam(sets, rng) {
  const groups = bySpecies(sets);
  const candidates = shuffle([...sets], rng).sort((a, b) => scoreRoles(b) - scoreRoles(a));
  const team = [];
  const covered = new Set();

  for (const set of candidates) {
    if (team.some(member => member.species === set.species)) continue;
    const roles = [
      ...(set.tags?.roles ?? []),
      ...(set.tags?.functions ?? []),
      ...(set.tags?.style ?? []),
    ];
    const novel = roles.filter(role => !covered.has(role)).length;
    if (team.length < 3 || novel > 0) {
      team.push(set);
      roles.forEach(role => covered.add(role));
    }
    if (team.length === 6) break;
  }

  if (team.length < 6) {
    for (const species of shuffle([...groups.keys()], rng)) {
      if (team.length === 6) break;
      if (team.some(set => set.species === species)) continue;
      const options = groups.get(species);
      team.push(options[Math.floor(rng() * options.length)]);
    }
  }
  return team;
}

function coreTeam(sets, rng) {
  const groups = bySpecies(sets);
  const species = shuffle([...groups.keys()], rng);
  const coreSpecies = species.slice(0, 2);
  const team = coreSpecies.map(name => {
    const options = groups.get(name);
    return options[Math.floor(rng() * options.length)];
  });

  const remaining = shuffle(species.filter(name => !coreSpecies.includes(name)), rng);
  for (const name of remaining) {
    if (team.length === 6) break;
    const options = groups.get(name);
    team.push(options[Math.floor(rng() * options.length)]);
  }
  return team;
}

/**
 * @param {Array<object>} sets Imported, validated set records.
 * @param {object} options
 * @param {number} options.populationSize Number of teams to generate.
 * @param {number} options.randomFraction Fraction generated completely randomly.
 * @param {number} options.roleBalancedFraction Fraction generated with descriptive-role diversity.
 * @param {number} options.coreFraction Fraction seeded around a random two-Pokemon core.
 * @param {() => number} options.rng Injectable RNG for deterministic tests.
 */
export function generateCandidateTeams(sets, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const rng = config.rng ?? Math.random;
  const valid = sets.filter(set => set?.species);
  if (new Set(valid.map(set => set.species)).size < 6) {
    throw new Error('At least six distinct species are required to generate teams');
  }

  const teams = [];
  for (let i = 0; i < config.populationSize; i++) {
    const roll = i / config.populationSize;
    if (roll < config.randomFraction) teams.push(randomTeam(valid, rng));
    else if (roll < config.randomFraction + config.roleBalancedFraction) teams.push(roleBalancedTeam(valid, rng));
    else teams.push(coreTeam(valid, rng));
  }
  return teams;
}
