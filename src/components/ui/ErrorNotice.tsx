import { toUserFacingError } from "@/lib/errors/userFacing";
import { IconCaution, IconRuling } from "./icons";
import { Artifact, ArtifactHead } from "./Artifact";
import { Stamp } from "./Stamp";

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

  // A league-office ruling is an Artifact: an authority outside the user has
  // decided something, and that is a document, not an inline red line. An
  // ordinary failure the user can simply redo stays a plain notice - promoting
  // every mistake to a formal ruling would drain the register of meaning.
  if (ruling) {
    return (
      <Artifact tone="official" role="alert">
        <ArtifactHead issuer="League Office" title="Transaction denied" />
        <div className="px-6 py-5">
          <p className="flex items-start gap-2 text-[15px] leading-snug font-semibold text-ink">
            <IconRuling className="mt-0.5 shrink-0 text-signal-red" />
            {summary}
          </p>
          {remedy && (
            <p className="mt-2 pl-6 text-[15px] leading-relaxed text-ink-muted">{remedy}</p>
          )}
        </div>
        <div className="flex justify-end px-6 pb-5">
          <Stamp tone="signal" rotate={-7}>
            Denied
          </Stamp>
        </div>
      </Artifact>
    );
  }

  return (
    <div role="alert" className="border-l-2 border-l-negative bg-field px-4 py-3">
      <span className="flex items-center gap-1.5 text-[11px] leading-none font-semibold tracking-[0.09em] text-negative uppercase">
        <IconCaution />
        Didn&apos;t go through
      </span>
      <p className="mt-2 text-[15px] leading-snug text-ink">{summary}</p>
      {remedy && <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{remedy}</p>}
    </div>
  );
}
