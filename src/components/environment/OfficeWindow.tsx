import { Skyline } from "@/components/environment/Skyline";
import { phaseLight } from "@/lib/design/phaseLight";
import type { LeaguePhase } from "@/lib/league/leaguePhase";

/**
 * THE WIRE - the front-office window. See DESIGN.md, Phase D.
 *
 * The single place the environmental layer is allowed to exist: behind the
 * franchise header on the dashboard, and nowhere else. Everything about this
 * component is a decision to *not* let it spread.
 *
 * What it is: your city, seen through the window of the office you work in,
 * under the light of the phase the save is actually in. Three elements -
 * sky, skyline, mullions - composited under the header's own team-accent
 * field, which continues to carry the franchise identity. The window is the
 * depth behind that field, not a replacement for it.
 *
 * Why mullions: without them this is a decorative gradient with a skyline in
 * it. The vertical divisions are what make it read as a view *from a room*,
 * and the room is the entire premise of the redesign. They are two thin
 * lines, not a lattice - a modern office tower, not a farmhouse.
 *
 * ACCESSIBILITY: entirely decorative and `aria-hidden`. The header's text
 * contrast is unaffected - the accent field sits above this layer at full
 * opacity in the region the text occupies.
 */
export function OfficeWindow({
  abbreviation,
  relocatedCityName,
  phase,
  className = "",
}: {
  abbreviation: string;
  relocatedCityName?: string | null;
  phase: LeaguePhase;
  className?: string;
}) {
  const light = phaseLight(phase);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {/* SKY. The phase's light, and the only place phase colour appears. */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, ${light.skyFrom}, ${light.skyTo})` }}
      />

      {/* SKYLINE. Anchored to the bottom of the frame, since a horizon that
          floats is the fastest way to make this read as clip-art. Sized in
          `vh`-independent terms so it holds at every header height. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[62%] text-ground"
        style={{ opacity: light.skylineOpacity }}
      >
        <Skyline abbreviation={abbreviation} relocatedCityName={relocatedCityName} />
      </div>

      {/* MULLIONS. Two verticals and a head rail. Deliberately off-centre
          (38% / 72%) - a symmetrical pair reads as a picture frame, an
          asymmetrical one reads as a building. */}
      <div className="absolute inset-y-0 left-[38%] w-px bg-ground/25" />
      <div className="absolute inset-y-0 left-[72%] w-px bg-ground/25" />
      <div className="absolute inset-x-0 top-[18%] h-px bg-ground/15" />

      {/* GLASS. A single directional sheen, obeying One Lamp: light in this
          system comes from the top-left and only ever from there. */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(115deg, oklch(1 0 0 / 0.05) 0%, oklch(1 0 0 / 0) 42%)",
        }}
      />
    </div>
  );
}
