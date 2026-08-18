/**
 * A club's mark, at a consistent optical weight.
 *
 * **Every logo used to be drawn into a square with `object-contain`**, which
 * sounds right and is not. Club marks do not share an aspect ratio: Boston's
 * is 0.90:1, Portland's 1.17:1, Utah's 1.47:1 and San Antonio's **2.21:1**. In
 * a 32x32 box the Spurs mark fits to width and renders 32x14 - less than half
 * the height of everything beside it - so a row of clubs read as though two of
 * the logos were broken. That is what was reported.
 *
 * Normalising on *height* instead fixes it: every mark is drawn the same
 * height and takes whatever width it needs, which is how these marks are used
 * everywhere else. `MAX_ASPECT` stops a very wide one from pushing the text
 * beside it out of the row - past that limit the mark scales down to fit,
 * which is still far closer in weight than the square gave it.
 *
 * Width is intentionally intrinsic rather than reserved. Fixing the box width
 * at the maximum would leave a near-square mark like Boston's sitting in a
 * pocket of dead space, and the labels beside each logo would no longer line
 * up with one another.
 */

/** Widest a mark may draw, relative to its height, before it is scaled down. */
const MAX_ASPECT = 1.6;

export function TeamLogo({
  logoUrl,
  size,
  className = "",
}: {
  logoUrl: string | null | undefined;
  /** The height every mark is drawn at, in pixels. */
  size: number;
  className?: string;
}) {
  if (!logoUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className={`shrink-0 object-contain ${className}`}
      style={{ height: size, width: "auto", maxWidth: size * MAX_ASPECT }}
    />
  );
}
