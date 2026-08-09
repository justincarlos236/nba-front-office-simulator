/**
 * Resolves a franchise's real brand colour into an accent that is actually
 * usable as the interface's primary colour for a whole save.
 *
 * The naive version of this - "use `Team.primaryColor`" - fails on more than
 * half the league. Measured against The Wire's ground (#0B0F14), **16 of 30
 * team primaries fall below 3.0:1**, and Minnesota and Dallas fail on both
 * primary and secondary. Brooklyn and San Antonio are literally #000000.
 *
 * So the accent is resolved through a documented cascade instead, and every
 * team lands at 4.5:1 or better. The outcomes are recognisable rather than
 * arbitrary: the Lakers resolve to gold, the Nets to white, the Celtics to
 * gold - the colour a fan associates with the team anyway.
 *
 * See DESIGN.md "Team accent intake".
 */

/** WCAG AA for normal text. Deliberately stricter than the 3.0:1 non-text floor. */
const TARGET_CONTRAST = 4.5;

/** The Wire's page ground; the accent must be legible against it. */
const GROUND = "#0b0f14";

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => srgbToLinear(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const parts = full.match(/../g);
  if (!parts || parts.length < 3) return [0, 0, 0];
  return [parseInt(parts[0], 16), parseInt(parts[1], 16), parseInt(parts[2], 16)];
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

interface Oklch {
  L: number;
  C: number;
  h: number;
}

function hexToOklch(hex: string): Oklch {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = srgbToLinear(r8 / 255);
  const g = srgbToLinear(g8 / 255);
  const b = srgbToLinear(b8 / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function oklchToHex({ L, C, h }: Oklch): string {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.round(Math.min(1, Math.max(0, linearToSrgb(c))) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export interface TeamAccent {
  /** The colour to paint. Always clears 4.5:1 against the ground. */
  hex: string;
  /** Text colour to sit on top of `hex` - whichever of ink/ground wins. */
  inkHex: string;
  /** Which cascade step produced this, for debugging and documentation. */
  via: "primary" | "secondary" | "lightened" | "monochrome";
}

/**
 * Lightens in OKLCH, preserving hue and chroma, so a darkened navy stays navy
 * rather than drifting toward grey the way an sRGB lighten would.
 */
function lightenUntilLegible(hex: string): string | null {
  const base = hexToOklch(hex);
  for (let L = base.L; L <= 0.99; L += 0.01) {
    const candidate = oklchToHex({ ...base, L });
    if (contrastRatio(candidate, GROUND) >= TARGET_CONTRAST) return candidate;
  }
  return null;
}

/**
 * Minimum OKLCH chroma for a colour to work as a full-bleed field.
 *
 * Contrast alone is not sufficient. Brooklyn's colours are #000000 and
 * #FFFFFF: black fails contrast, white passes it at 19:1 - and paints the
 * franchise header as a blinding white slab while every other team gets a real
 * colour. San Antonio (silver) and Milwaukee (cream) have the same problem.
 * A near-neutral is legible and still not an identity.
 */
const MIN_CHROMA = 0.04;

function hasRealColour(hex: string): boolean {
  return hexToOklch(hex).C >= MIN_CHROMA;
}

/**
 * The OKLCH hue of a resolved accent, for the environmental layer to build a
 * sky in the same colour family as the franchise (see `skyStops`).
 *
 * Returns `null` when the accent carries no meaningful hue - a monochrome
 * franchise resolved to the slate fallback. Hue is meaningless below
 * MIN_CHROMA, and reading one off a near-neutral yields an arbitrary angle
 * that would tint the sky at random.
 */
export function accentHue(hex: string): number | null {
  const { C, h } = hexToOklch(hex);
  return C >= MIN_CHROMA ? h : null;
}

/**
 * The cascade. Order matters: a team's own primary is preferred, then its
 * secondary (which is usually the colour fans pair with it anyway), and only
 * then a synthesised lightening.
 *
 * Each candidate must clear both bars - legible against the ground *and*
 * chromatic enough to read as a franchise colour rather than a grey field.
 */
export function resolveTeamAccent(
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined,
): TeamAccent {
  const withInk = (hex: string, via: TeamAccent["via"]): TeamAccent => ({
    hex,
    // Whichever of the two neutrals is more readable on this accent. A gold
    // accent takes ground-coloured text; a deep blue accent takes ink.
    inkHex: contrastRatio(hex, "#0b0f14") >= contrastRatio(hex, "#f2f5f7") ? "#0b0f14" : "#f2f5f7",
    via,
  });

  if (
    primaryColor &&
    contrastRatio(primaryColor, GROUND) >= TARGET_CONTRAST &&
    hasRealColour(primaryColor)
  ) {
    return withInk(primaryColor, "primary");
  }
  if (
    secondaryColor &&
    contrastRatio(secondaryColor, GROUND) >= TARGET_CONTRAST &&
    hasRealColour(secondaryColor)
  ) {
    return withInk(secondaryColor, "secondary");
  }
  // Lighten whichever brand colour actually carries chroma. For a monochrome
  // identity like Brooklyn's, neither does.
  for (const candidate of [primaryColor, secondaryColor]) {
    if (!candidate || !hasRealColour(candidate)) continue;
    const lightened = lightenUntilLegible(candidate);
    if (lightened) return withInk(lightened, "lightened");
  }

  // A genuinely monochrome franchise (Brooklyn is black and white; San Antonio
  // black and silver). Rather than paint a blinding white slab, use the
  // system's strong rule value as a muted slate field: legible against the
  // ground (5.19:1), takes dark ink at 5.19:1, and reads as a stated neutral
  // rather than a washed-out attempt at a team colour. Their identity carries
  // through the logo and wordmark instead.
  return withInk("#748799", "monochrome");
}

/**
 * The CSS custom properties a league shell sets so every descendant inherits
 * the franchise's accent. Applied as an inline style on the league layout.
 */
export function teamAccentStyle(
  primaryColor: string | null | undefined,
  secondaryColor: string | null | undefined,
): React.CSSProperties {
  const accent = resolveTeamAccent(primaryColor, secondaryColor);
  return {
    "--team-accent": accent.hex,
    "--team-accent-ink": accent.inkHex,
  } as React.CSSProperties;
}
