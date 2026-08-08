import { toUserFacingError } from "@/lib/errors/userFacing";
import { Label } from "./primitives";

/**
 * The one way this product shows a failed action.
 *
 * Replaces `{submitError}` rendering a raw engine string. A ruling by the
 * league office (an apron block, a Stepien violation) reads in signal red -
 * per DESIGN.md that colour belongs to an authority outside the user. A
 * mistake the user can simply redo reads as an ordinary negative.
 */
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const { summary, remedy, ruling } = toUserFacingError(error);

  return (
    <div
      role="alert"
      className={`border-l-2 bg-field px-4 py-3 ${ruling ? "border-l-signal-red" : "border-l-negative"}`}
    >
      <Label className={ruling ? "text-signal-red" : "text-negative"}>
        {ruling ? "Blocked by the rules" : "Didn't go through"}
      </Label>
      <p className="mt-2 text-[15px] leading-snug text-ink">{summary}</p>
      {remedy && <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{remedy}</p>}
    </div>
  );
}
