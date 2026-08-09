/**
 * THE WIRE - material textures. See DESIGN.md, Phase D.
 *
 * Three surface treatments, all authored as inline SVG filters rather than
 * sourced images: they are resolution-independent, weigh nothing, inherit
 * `currentColor` where useful, and cannot break from a dead external link.
 *
 * All three are deliberately near the threshold of perception. The point is
 * that a surface stops reading as a flat fill - not that anyone notices a
 * texture. If you can see the grain as grain, it is too strong.
 *
 * Rendered once at the app root; every consumer references the filter by id.
 */

export const TEXTURE_IDS = {
  paperGrain: "wire-paper-grain",
  halftone: "wire-halftone",
  inkBleed: "wire-ink-bleed",
} as const;

/**
 * The single <defs> block, mounted once in the root layout. SVG filter ids are
 * document-global, so defining them per-component would duplicate them on
 * every render.
 */
export function TextureDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
    >
      <defs>
        {/* PAPER GRAIN - fine, irregular, achromatic. The tooth of a sheet
            under desk light. Fractal noise at high frequency reads as fibre
            rather than as digital dither. */}
        <filter id={TEXTURE_IDS.paperGrain} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="4"
            stitchTiles="stitch"
            result="noise"
          />
          {/* Desaturate: paper fibre has tone, not colour. */}
          <feColorMatrix type="saturate" values="0" in="noise" result="mono" />
          {/* Compress to a narrow band around mid-grey so the overlay reads as
              texture rather than as static. */}
          <feComponentTransfer in="mono">
            <feFuncA type="linear" slope="0.06" intercept="0" />
          </feComponentTransfer>
        </filter>

        {/* HALFTONE - the dot screen of a printed photograph. Used over
            Broadcast imagery so a photograph reads as reproduced in a
            document rather than pasted into a webpage. */}
        <filter id={TEXTURE_IDS.halftone} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="turbulence" baseFrequency="0.55" numOctaves="1" result="dots" />
          <feColorMatrix type="saturate" values="0" in="dots" result="monoDots" />
          <feComponentTransfer in="monoDots">
            <feFuncA type="discrete" tableValues="0 0.08 0 0.05" />
          </feComponentTransfer>
        </filter>

        {/* INK BLEED - the slight irregularity of a rubber stamp pressed onto
            paper: edges displaced by a fraction, never a clean vector line. */}
        <filter id={TEXTURE_IDS.inkBleed} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" result="bleed" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="bleed"
            scale="1.1"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * A grain wash for a surface. Absolutely positioned, so the consumer only
 * needs `relative`; never intercepts pointer events.
 *
 * Deliberately not a component prop on Field/Artifact - grain belongs to
 * *material* surfaces (Artifacts, Broadcast frames), and making it available
 * everywhere by default is how an environmental layer leaks into a Ledger.
 */
export function PaperGrain({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <rect
        width="100%"
        height="100%"
        filter={`url(#${TEXTURE_IDS.paperGrain})`}
        className="text-ink"
        fill="currentColor"
      />
    </svg>
  );
}

/** A halftone screen over Broadcast imagery. Stronger than grain, still low. */
export function HalftoneScreen({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <rect
        width="100%"
        height="100%"
        filter={`url(#${TEXTURE_IDS.halftone})`}
        fill="currentColor"
      />
    </svg>
  );
}
