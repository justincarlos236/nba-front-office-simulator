/**
 * THE WIRE - the filing stamp.
 *
 * The transactions page is literally the league transaction wire, and its rows
 * carried no filing marks at all. A stamp is the most on-metaphor graphic
 * device this product has available: it is what a real front office actually
 * puts on a document when the league office rules on it.
 *
 * Drawn, not photographed - an outlined rotated block with a double rule, the
 * way a rubber stamp reads once the ink has taken unevenly. Kept as pure type
 * and borders so it inherits any semantic tone and costs nothing to render.
 *
 * Used sparingly by design: on a full save, BREAKING is 11 rows out of ~5,500.
 * A stamp on every row would be wallpaper.
 */

export type StampTone = "accent" | "signal" | "positive" | "neutral";

const TONE_CLASS: Record<StampTone, string> = {
  accent: "border-team-accent text-team-accent",
  signal: "border-signal-red text-signal-red",
  positive: "border-positive text-positive",
  neutral: "border-rule text-ink-muted",
};

export function Stamp({
  children,
  tone = "neutral",
  /** Rotation in degrees; a stamp is never applied perfectly square. */
  rotate = -6,
  className = "",
}: {
  children: React.ReactNode;
  tone?: StampTone;
  rotate?: number;
  className?: string;
}) {
  return (
    <span
      style={{ transform: `rotate(${rotate}deg)` }}
      className={`inline-flex shrink-0 items-center border-2 px-2.5 py-1 text-[11px] font-bold tracking-[0.18em] uppercase opacity-90 ${TONE_CLASS[tone]} ${className}`}
    >
      <span className="border-y border-current py-0.5">{children}</span>
    </span>
  );
}
