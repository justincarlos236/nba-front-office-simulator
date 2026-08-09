import { resolveTeamAccent } from "@/lib/design/teamAccent";
import { Label } from "@/components/ui/primitives";

/**
 * THE WIRE - Artifact. Championship banners in the rafters.
 *
 * Winning a title is the thing every save is played toward, and the record of
 * it was a row in a table. A banner is the object a franchise actually hangs,
 * and it is the one artifact that *accumulates*: a fifteen-season save with
 * three titles should look different from one with none, at a glance, before
 * any text is read.
 *
 * Empty rafters are deliberately shown rather than hidden. A franchise with no
 * banners is a fact about that franchise, and the empty ceiling is the whole
 * motivation for the next fifteen seasons.
 */

export interface Banner {
  season: number;
  /** Present when a rival won it - a banner in someone else's building. */
  teamLabel: string;
  isUserTeam: boolean;
}

export function BannerRafters({
  banners,
  primaryColor,
  secondaryColor,
  className = "",
}: {
  /** Oldest first; they hang left to right in the order they were won. */
  banners: Banner[];
  primaryColor: string | null;
  secondaryColor: string | null;
  className?: string;
}) {
  const accent = resolveTeamAccent(primaryColor, secondaryColor);
  const ours = banners.filter((b) => b.isUserTeam);

  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-3">
        <Label tone="ink">The rafters</Label>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
          {ours.length} {ours.length === 1 ? "championship" : "championships"}
        </span>
      </div>

      {ours.length === 0 ? (
        <div className="mt-8 border-t border-dashed border-rule pt-8 text-center">
          <p className="text-[clamp(1rem,1.8vw,1.25rem)] leading-snug text-ink-muted">
            Nothing hanging yet.
          </p>
          <p className="mx-auto mt-2 max-w-[45ch] text-[15px] leading-relaxed text-ink-muted">
            The ceiling is empty. That is the job.
          </p>
        </div>
      ) : (
        /* Banners hang from a rail, which is what makes them read as objects in
           a building rather than as cards in a grid. */
        <div className="mt-8 border-t-2 border-rule-strong">
          <div className="flex flex-wrap justify-center gap-6 pt-0">
            {ours.map((banner) => (
              <div key={banner.season} className="flex flex-col items-center">
                {/* The hanging cord. */}
                <div className="h-6 w-px bg-rule" aria-hidden="true" />
                <div
                  className="relative w-24 px-2 pt-4 pb-8 text-center sm:w-28"
                  style={{
                    backgroundColor: accent.hex,
                    color: accent.inkHex,
                    // The pennant point at the foot, cut rather than drawn.
                    clipPath: "polygon(0 0, 100% 0, 100% 82%, 50% 100%, 0 82%)",
                  }}
                >
                  <p
                    className="text-[11px] font-semibold tracking-[0.18em] uppercase"
                    style={{ opacity: 0.75 }}
                  >
                    Champions
                  </p>
                  <p className="mt-2 font-mono text-[15px] leading-none font-medium tabular-nums">
                    {banner.season}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
