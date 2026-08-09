import { Skyline } from "@/components/environment/Skyline";
import { phaseLight, skyStops } from "@/lib/design/phaseLight";
import type { LeaguePhase } from "@/lib/league/leaguePhase";

/**
 * THE WIRE - the front-office window. See DESIGN.md, Phase D.
 *
 * The single place the environmental layer is allowed to exist: behind the
 * franchise header on the dashboard, and nowhere else. Everything about this
 * component is a decision to *not* let it spread.
 *
 * What it is: your city, seen through the window of the office you work in,
 * under the light of the phase the save is actually in.
 *
 * THE DISSOLVE IS THE WHOLE COMPONENT.
 *
 * The first version faded only the left edge, leaving hard boundaries at the
 * top, right and bottom. It read as a pasted rectangle - a broken image tile
 * on the accent field - and was worse than the flat header it replaced. The
 * fix is that this layer has *no edges at all*: a radial mask takes it to
 * fully transparent on every side, so there is nowhere for a seam to form.
 *
 * Paired with `skyStops` deriving the sky from the franchise's own accent hue,
 * the window is now a darkening *within* the header rather than a foreign
 * object placed on top of it.
 *
 * ACCESSIBILITY: entirely decorative and `aria-hidden`. It never overlaps the
 * header text, and the accent field beneath the text stays fully opaque - see
 * the Window Rule in DESIGN.md for why that is a hard requirement.
 */
export function OfficeWindow({
  abbreviation,
  relocatedCityName,
  phase,
  accentHue,
  className = "",
}: {
  abbreviation: string;
  relocatedCityName?: string | null;
  phase: LeaguePhase;
  /** OKLCH hue of the team accent; null for a monochrome franchise. */
  accentHue: number | null;
  className?: string;
}) {
  const light = phaseLight(phase);
  const sky = skyStops(phase, accentHue);

  // Feathered on every side, and the falloff MUST reach zero before the
  // element's own edges - otherwise the boundary clips the gradient back into
  // a hard line, which is precisely the seam this mask exists to prevent.
  //
  // Two masks composited, because one radial cannot do both jobs:
  //   - a radial centred right-of-frame, so the view is densest where the city
  //     is and thins outward in every direction
  //   - a horizontal ramp guaranteeing the *left* edge specifically is fully
  //     transparent, since that is the edge that meets the header text and the
  //     one where a seam is most visible
  const dissolve = [
    "radial-gradient(105% 130% at 88% 45%, #000 0%, #000 22%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0) 82%)",
    "linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 26%, #000 58%)",
  ].join(", ");

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{
        maskImage: dissolve,
        WebkitMaskImage: dissolve,
        // Intersect, not the default add: the layer is visible only where
        // BOTH masks are opaque, so either one reaching zero guarantees a
        // transparent edge. With the default compositing they would union and
        // the ramp would fill in exactly the falloff the radial just created.
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      {/* SKY. Built from the franchise's own hue, so it can never clash with
          the accent field it sits inside. */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, ${sky.from}, ${sky.to})` }}
      />

      {/* SKYLINE. Taller than the first pass (62% -> 78%) and anchored to the
          bottom, so it reads as a horizon rather than a bump in the corner.
          Drawn in the page ground, the darkest value in the system, so the
          silhouette holds against every sky. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[78%] text-ground"
        style={{ opacity: light.skylineOpacity }}
      >
        <Skyline abbreviation={abbreviation} relocatedCityName={relocatedCityName} />
      </div>

      {/* MULLIONS. Calibrated twice: at 15% opacity they vanished entirely and
          the window read as a plain gradient; at 45% they read as panel
          dividers chopping the header into rectangles. The target is a glazing
          bar noticed only on second look.

          Two verticals, deliberately asymmetric - a symmetrical pair reads as a
          picture frame, an off-centre one as a building. No horizontal head
          rail: with the vertical seam gone, a full-width line was the single
          strongest cue that this was a flat panel rather than a view. */}
      <Mullion className="left-[46%]" />
      <Mullion className="left-[77%]" />

      {/* GLASS. A single directional sheen, obeying One Lamp: light in this
          system comes from the top-left and only ever from there. */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(115deg, oklch(1 0 0 / 0.06) 0%, oklch(1 0 0 / 0) 45%)",
        }}
      />
    </div>
  );
}

/**
 * A glazing bar. Dark edge plus a faint highlight so it survives any sky, but
 * at roughly half the previous weight - and faded out top and bottom, so it
 * never terminates in a hard stop against the header edge.
 */
function Mullion({ className }: { className: string }) {
  const fade = "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)";
  return (
    <div
      className={`absolute inset-y-0 w-px ${className}`}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      <div className="absolute inset-y-0 left-0 w-px bg-ground/22" />
      <div className="absolute inset-y-0 -right-px w-px bg-white/6" />
    </div>
  );
}
