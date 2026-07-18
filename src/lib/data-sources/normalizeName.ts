/**
 * Normalizes a player's full name for joining across data sources that
 * spell the same person slightly differently (accents, suffixes,
 * punctuation) - e.g. matching balldontlie bios against the box-score
 * dataset's `personName` field.
 */
export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (Doncic <- Dončić)
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
