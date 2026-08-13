import type { CanonicalPlayerBio } from "./canonical";
import { nameAliases } from "./playerNameAliases";

/**
 * Merges a roster source (who is on which team *now*) with a bio-detail source
 * (everything that source knows better), joined by name.
 *
 * Needed because no single provider covers both. balldontlie knows the current
 * league - hoopR does not publish a season's rosters until it is underway - but
 * it carries no birth dates and only coarse G/F/C positions. hoopR carries both.
 *
 * **The join cannot use team as a guard.** `import-contracts.ts` resolves the
 * same two sources against each other and falls back to surname-plus-team,
 * which works there because it matches within one season. Here the whole point
 * is that players moved: measured on 2026-08-13, 177 of 585 actives were on a
 * different team than hoopR had them. Team is the thing being replaced, so it
 * cannot also be the thing that verifies a match.
 *
 * What is left is surname plus a first-name prefix test, applied league-wide
 * and only when it resolves to exactly one candidate. That is what recovers the
 * legal-vs-broadcast spellings the two sources disagree on - Nicolas/Nic
 * Claxton, Alexandre/Alex Sarr - while still refusing Nolan Traoré against
 * Armel Traoré, since neither first name prefixes the other.
 */

export interface EnrichBiosReport {
  /** Roster entries that found a bio-detail match. */
  matched: number;
  /** Matched by exact normalized name. */
  viaExactName: number;
  /** Matched by the guarded surname fallback. */
  viaSurname: number;
  /** Roster entries with no match - they keep the roster source's own bio. */
  unmatched: string[];
  /** Of the unmatched, those with no birth date AND no draft year: age is unknowable. */
  unknownAge: string[];
}

const surnameOf = (normalized: string) => normalized.split(" ").at(-1) ?? normalized;
const firstNameOf = (normalized: string) => normalized.split(" ")[0] ?? normalized;

function prefixCompatible(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * Fields the detail source owns when a match is found. Identity and roster
 * placement always stay with the roster source - that is the whole reason it
 * is the roster source.
 */
function enrichOne(roster: CanonicalPlayerBio, detail: CanonicalPlayerBio): CanonicalPlayerBio {
  return {
    ...roster,
    birthDate: detail.birthDate ?? roster.birthDate,
    // hoopR distinguishes PG from SG; balldontlie collapses both to "G" and
    // `mapPosition` has to guess. Prefer the source that actually knows.
    position: detail.position,
    heightInches: roster.heightInches ?? detail.heightInches,
    weightLbs: roster.weightLbs ?? detail.weightLbs,
    college: roster.college ?? detail.college,
    nationality: roster.nationality ?? detail.nationality,
    photoUrl: roster.photoUrl ?? detail.photoUrl,
    draftYear: roster.draftYear ?? detail.draftYear,
    draftRound: roster.draftRound ?? detail.draftRound,
    draftPick: roster.draftPick ?? detail.draftPick,
    // Both provenances, so the audit can see the join happened.
    refs: [...roster.refs, ...detail.refs],
  };
}

export function enrichBios(
  rosterBios: CanonicalPlayerBio[],
  detailBios: CanonicalPlayerBio[],
): { bios: CanonicalPlayerBio[]; report: EnrichBiosReport } {
  const byName = new Map<string, CanonicalPlayerBio[]>();
  const bySurname = new Map<string, CanonicalPlayerBio[]>();
  for (const detail of detailBios) {
    byName.set(detail.normalizedName, [...(byName.get(detail.normalizedName) ?? []), detail]);
    const key = surnameOf(detail.normalizedName);
    bySurname.set(key, [...(bySurname.get(key) ?? []), detail]);
  }

  // A detail bio is claimed once, so two roster entries can never be handed the
  // same birth date.
  const claimed = new Set<CanonicalPlayerBio>();
  const report: EnrichBiosReport = {
    matched: 0,
    viaExactName: 0,
    viaSurname: 0,
    unmatched: [],
    unknownAge: [],
  };

  const bios = rosterBios.map((roster) => {
    // Includes the hand-verified nickname aliases, which run the opposite way
    // here to how `import-contracts.ts` uses them: the roster source carries
    // the legal name and the detail source the broadcast one.
    const exact = nameAliases(roster.normalizedName)
      .flatMap((alias) => byName.get(alias) ?? [])
      .filter((d) => !claimed.has(d));
    if (exact.length === 1) {
      claimed.add(exact[0]);
      report.matched++;
      report.viaExactName++;
      return enrichOne(roster, exact[0]);
    }

    const candidates = (bySurname.get(surnameOf(roster.normalizedName)) ?? []).filter(
      (d) =>
        !claimed.has(d) &&
        prefixCompatible(firstNameOf(roster.normalizedName), firstNameOf(d.normalizedName)),
    );
    if (candidates.length === 1) {
      claimed.add(candidates[0]);
      report.matched++;
      report.viaSurname++;
      return enrichOne(roster, candidates[0]);
    }

    report.unmatched.push(
      `${roster.fullName} (${roster.currentTeamAbbreviation ?? "FA"}, draft ${roster.draftYear ?? "?"})`,
    );
    if (roster.birthDate === null && roster.draftYear === null) {
      report.unknownAge.push(roster.fullName);
    }
    return roster;
  });

  return { bios, report };
}
