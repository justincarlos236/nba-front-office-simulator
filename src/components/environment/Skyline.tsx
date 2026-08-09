import { CITIES, GENERIC, type CityComposition } from "@/components/environment/cities";

/**
 * THE WIRE - the franchise skyline. See DESIGN.md, "One Landmark, Two
 * Companions", and `cities.ts` for the compositions themselves.
 *
 * Renders a city as three layers rather than one flat silhouette, so the view
 * has depth: the Field sits furthest back and lightest, the Signature nearest
 * and darkest. That ordering is what stops a landmark reading as a logo pasted
 * onto a row of boxes.
 */

/**
 * Resolves the composition a franchise should show. Relocation wins over the
 * original city, since after a move the front office genuinely looks out at
 * somewhere else.
 */
export function cityFor(abbreviation: string, relocatedCityName?: string | null): CityComposition {
  if (relocatedCityName && CITIES[relocatedCityName]) return CITIES[relocatedCityName];
  return CITIES[abbreviation] ?? GENERIC;
}

/** The landmark path alone, for callers that need it without the composition. */
export function signaturePathFor(abbreviation: string, relocatedCityName?: string | null): string {
  return cityFor(abbreviation, relocatedCityName).signature;
}

export function Skyline({
  abbreviation,
  relocatedCityName,
  className = "",
}: {
  abbreviation: string;
  relocatedCityName?: string | null;
  className?: string;
}) {
  const city = cityFor(abbreviation, relocatedCityName);

  return (
    <svg
      viewBox="0 0 400 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none h-full w-full ${className}`}
    >
      {/* FIELD - furthest back, lightest. Gives the Signature something to
          rise out of; without it a landmark floats and reads as an icon. */}
      <path d={city.field} fill="currentColor" opacity={0.55} />

      {/* SUPPORT - corroborating forms, placing the Signature in a real
          skyline rather than isolating it. */}
      {city.support.map((d, i) => (
        <path key={i} d={d} fill="currentColor" opacity={0.78} />
      ))}

      {/* SIGNATURE - nearest and darkest. The form the city is recognised by. */}
      <path d={city.signature} fill="currentColor" />
    </svg>
  );
}
