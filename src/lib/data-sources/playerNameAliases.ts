import { normalizePlayerName } from "./normalizeName";

/**
 * Nicknames no rule can derive - a player known by something unrelated to his
 * legal first name.
 *
 * Keyed broadcast-name -> legal-name, both normalized. hoopR spells a player
 * the way broadcasts do; balldontlie uses the name on the contract. Every other
 * disagreement between the two (Nic/Nicolas, Alex/Alexandre) is a prefix and is
 * handled by a rule rather than a line here.
 *
 * Verified by hand against the roster, one line each, and deliberately tiny:
 * anything that grows here is a sign the surname fallback needs work rather
 * than that it needs more exceptions.
 */
const BROADCAST_TO_LEGAL: Record<string, string> = {
  "ace bailey": "airious bailey",
  "bub carrington": "carlton carrington",
  "bones hyland": "nahshon hyland",
};

const LEGAL_TO_BROADCAST: Record<string, string> = Object.fromEntries(
  Object.entries(BROADCAST_TO_LEGAL).map(([broadcast, legal]) => [legal, broadcast]),
);

/**
 * Every normalized spelling this player might appear under, including the one
 * passed in. Direction-agnostic on purpose: `import-contracts.ts` looks up a
 * hoopR name expecting a balldontlie one, while the roster merge in
 * `enrichBios.ts` does exactly the reverse.
 */
export function nameAliases(name: string): string[] {
  const key = normalizePlayerName(name);
  const aliases = [key];
  const legal = BROADCAST_TO_LEGAL[key];
  if (legal) aliases.push(legal);
  const broadcast = LEGAL_TO_BROADCAST[key];
  if (broadcast) aliases.push(broadcast);
  return aliases;
}
