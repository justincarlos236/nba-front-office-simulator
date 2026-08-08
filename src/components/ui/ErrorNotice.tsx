import { toUserFacingError } from "@/lib/errors/userFacing";
import { IconCaution, IconRuling } from "./icons";

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
      <span
        className={`flex items-center gap-1.5 text-[11px] leading-none font-semibold tracking-[0.09em] uppercase ${
          ruling ? "text-signal-red" : "text-negative"
        }`}
      >
        {ruling ? <IconRuling /> : <IconCaution />}
        {ruling ? "Blocked by the rules" : "Didn't go through"}
      </span>
      <p className="mt-2 text-[15px] leading-snug text-ink">{summary}</p>
      {remedy && <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{remedy}</p>}
    </div>
  );
}
