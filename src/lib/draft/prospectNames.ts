/**
 * Fictional name pools for generated draft prospects. No future real-world
 * draft class data exists, so these are explicitly not real people -
 * random first/last name combinations, same principle as everywhere else
 * in this project that avoids presenting a guess as fact.
 */
const FIRST_NAMES = [
  "Marcus",
  "Jalen",
  "Devon",
  "Isaiah",
  "Malik",
  "Trey",
  "Xavier",
  "Cameron",
  "Elijah",
  "Kobe",
  "Darius",
  "Amir",
  "Jaxon",
  "Tyrell",
  "Bryce",
  "Kaden",
  "Zion",
  "Mekhi",
  "Andre",
  "Terrence",
  "Aaron",
  "Julian",
  "Deshawn",
  "Nasir",
  "Reggie",
  "Wesley",
  "Cole",
  "Omar",
  "Sekou",
  "Miles",
];

const LAST_NAMES = [
  "Carter",
  "Boston",
  "Whitfield",
  "Rollins",
  "Okafor",
  "Reeves",
  "Sinclair",
  "Marsh",
  "Danforth",
  "Hollis",
  "Kessler",
  "Vance",
  "Ashby",
  "Truman",
  "Ledbetter",
  "Marchetti",
  "Osei",
  "Beaumont",
  "Kincaid",
  "Ferro",
  "Nakamura",
  "Delgado",
  "Winslow",
  "Abara",
  "Castellano",
  "Bruno",
  "Okonkwo",
  "Prather",
  "Solomon",
  "Vickers",
];

export function generateProspectName(rng: () => number): string {
  const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

// 30 first names x 30 last names = 900 combinations; a 60-prospect class
// draws enough of those that plain collisions are common (birthday
// paradox), not a rare edge case - a full class reliably produced 2-4
// duplicate names before this. Retries within the same rng stream rather
// than reseeding, so class generation stays fully deterministic.
const MAX_UNIQUE_NAME_ATTEMPTS = 20;

export function generateUniqueProspectName(rng: () => number, taken: Set<string>): string {
  let name = generateProspectName(rng);
  for (let attempt = 0; attempt < MAX_UNIQUE_NAME_ATTEMPTS && taken.has(name); attempt++) {
    name = generateProspectName(rng);
  }
  taken.add(name);
  return name;
}
