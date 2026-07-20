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
