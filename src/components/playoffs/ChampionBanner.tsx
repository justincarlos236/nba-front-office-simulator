import { resolveTeamAccent } from "@/lib/design/teamAccent";
import { ButtonLink } from "@/components/ui/primitives";

/**
 * THE WIRE - Broadcast. The inverse of the career end.
 *
 * The audit found winning a title rendered as a 24px line inside a card, and
 * generated a news row. It is the thing every save is played toward. Where
 * being fired drains the colour out of the interface, this floods the frame
 * with it: the champion's own accent, edge to edge, at display scale.
 *
 * Winning it yourself and watching someone else win are deliberately different
 * - a rival's title is real news, but it is not your celebration.
 */
export function ChampionBanner({
  leagueId,
  teamLabel,
  primaryColor,
  secondaryColor,
  season,
  isUserTeam,
}: {
  leagueId: string;
  teamLabel: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  season: number;
  isUserTeam: boolean;
}) {
  const accent = resolveTeamAccent(primaryColor, secondaryColor);
  const seasonLabel = `${season}-${(season + 1).toString().slice(-2)}`;

  return (
    <section
      className="-mx-6 mt-8 px-6 py-16 text-center sm:-mx-8 sm:px-8 sm:py-24"
      style={{ backgroundColor: accent.hex, color: accent.inkHex }}
    >
      <p
        className="text-[11px] font-semibold tracking-[0.18em] uppercase"
        style={{ opacity: 0.75 }}
      >
        {seasonLabel} NBA Champions
      </p>
      <h2 className="mx-auto mt-6 max-w-[16ch] text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.9] font-bold tracking-[-0.02em]">
        {teamLabel}
      </h2>
      {isUserTeam && (
        <p className="mx-auto mt-8 max-w-[45ch] text-[clamp(1.125rem,2.2vw,1.5rem)] leading-snug">
          You built this. Banner raised.
        </p>
      )}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink
          variant="secondary"
          href={`/leagues/${leagueId}/offseason`}
          className="!border-current !text-current"
        >
          Continue to the offseason
        </ButtonLink>
        <ButtonLink
          variant="secondary"
          href={`/leagues/${leagueId}/history`}
          className="!border-current !text-current"
        >
          League history
        </ButtonLink>
      </div>
    </section>
  );
}
