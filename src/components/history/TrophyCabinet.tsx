import { IconAward, IconTrophy } from "@/components/ui/icons";
import { Label } from "@/components/ui/primitives";

/**
 * THE WIRE - Artifact. Individual honours as objects in a case.
 *
 * MVPs, Rookies of the Year and Defensive Players of the Year were rows in a
 * table, which is the right shape for scanning a league-wide list and the
 * wrong shape for a franchise's own trophy case. A case shows what you have
 * won and, by the gaps, what you have not.
 *
 * Only the user's franchise appears. A league-wide award list already exists
 * on the history page; this is the shelf in your own building.
 */

const CATEGORY_LABEL: Record<string, string> = {
  MVP: "Most Valuable Player",
  ROOKIE_OF_THE_YEAR: "Rookie of the Year",
  MOST_IMPROVED_PLAYER: "Most Improved Player",
  DEFENSIVE_PLAYER_OF_THE_YEAR: "Defensive Player of the Year",
  SIXTH_MAN_OF_THE_YEAR: "Sixth Man of the Year",
};

/** Display order: the honours a franchise brags about, in the order it would. */
const CATEGORY_ORDER = [
  "MVP",
  "DEFENSIVE_PLAYER_OF_THE_YEAR",
  "ROOKIE_OF_THE_YEAR",
  "MOST_IMPROVED_PLAYER",
  "SIXTH_MAN_OF_THE_YEAR",
] as const;

export interface CabinetAward {
  season: number;
  category: string;
  playerName: string;
}

export function TrophyCabinet({
  awards,
  className = "",
}: {
  awards: CabinetAward[];
  className?: string;
}) {
  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category] ?? category,
    won: awards
      .filter((a) => a.category === category)
      .sort((a, b) => b.season - a.season),
  }));

  const total = awards.length;

  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-3">
        <Label tone="ink">The cabinet</Label>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
          {total} {total === 1 ? "honour" : "honours"}
        </span>
      </div>

      {/* Five identical "Never won" shelves reads as a broken grid rather than
          an empty case, and every save starts here. One honest line instead. */}
      {total === 0 ? (
        <div className="mt-8 border-t border-dashed border-rule pt-8 text-center">
          <p className="text-[clamp(1rem,1.8vw,1.25rem)] leading-snug text-ink-muted">
            The case is empty.
          </p>
          <p className="mx-auto mt-2 max-w-[45ch] text-[15px] leading-relaxed text-ink-muted">
            No player of yours has won a league award yet. MVP, Defensive Player, Rookie of the
            Year, Most Improved and Sixth Man all go on this shelf.
          </p>
        </div>
      ) : (
      <div className="mt-6 grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
        {byCategory.map((shelf) => {
          const empty = shelf.won.length === 0;
          return (
            <div
              key={shelf.category}
              className={`border-t bg-field p-5 ${
                empty ? "border-hairline" : "border-team-accent"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={empty ? "text-rule" : "text-team-accent"}>
                  {shelf.category === "MVP" ? <IconTrophy /> : <IconAward />}
                </span>
                <p
                  className={`text-[11px] font-semibold tracking-[0.09em] uppercase ${
                    empty ? "text-rule" : "text-ink-muted"
                  }`}
                >
                  {shelf.label}
                </p>
              </div>

              {empty ? (
                /* An empty shelf is information: it says what this franchise
                   has never won. Hiding it would flatter the record. */
                <p className="mt-4 text-[15px] text-rule">Never won</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {shelf.won.map((award) => (
                    <li
                      key={`${award.category}-${award.season}`}
                      className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2 last:border-b-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate text-[15px] font-semibold text-ink">
                        {award.playerName}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
                        {award.season}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
