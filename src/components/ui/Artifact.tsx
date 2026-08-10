import type { ReactNode } from "react";
import { PaperGrain } from "@/components/environment/textures";

/**
 * THE WIRE - the Artifact archetype's shell. See DESIGN.md.
 *
 * The other five archetypes describe ways of presenting information. This one
 * renders the object itself: the thing a real front office would file. A
 * contract shown as a form is a UI; a contract shown as a contract is the
 * world, and that difference is most of what separates a management game from
 * a database viewer.
 *
 * The Artifact Exception in DESIGN.md permits material here and nowhere else -
 * a paper tone distinct from the field, a cut edge, a stamp, rules printed *on*
 * the sheet. Every other surface stays flat.
 */

export type ArtifactTone = "paper" | "official" | "carbon";

const TONE: Record<ArtifactTone, { surface: string; edge: string }> = {
  /** The standard front-office sheet. */
  paper: { surface: "bg-raised", edge: "border-rule" },
  /** A league-office document: heavier stock, a harder edge. */
  official: { surface: "bg-raised", edge: "border-rule-strong" },
  /** A duplicate/file copy - dimmer, for archived or historical records. */
  carbon: { surface: "bg-field", edge: "border-hairline" },
};

export function Artifact({
  children,
  tone = "paper",
  className = "",
  role,
}: {
  children: ReactNode;
  tone?: ArtifactTone;
  className?: string;
  /** For an Artifact that is also a live announcement, e.g. a denial notice. */
  role?: string;
}) {
  const { surface, edge } = TONE[tone];
  return (
    <article
      role={role}
      className={`relative border ${edge} ${surface} ${className}`}
      // The one place depth is allowed: this is a sheet resting on the desk,
      // not a panel floating in an interface. Kept tight and hard-edged so it
      // reads as paper rather than as a card with a drop shadow.
      style={{ boxShadow: "0 1px 0 0 var(--ground), 0 2px 0 0 var(--hairline)" }}
    >
      {/* Phase D: the tooth of the stock. The Artifact Exception is the only
          licence for material in this system, so grain lives here and is
          deliberately not exposed as a prop on Field - a Workbench or Ledger
          surface that acquires texture is the failure mode this rule exists
          to prevent. Sits under the content, never over it. */}
      <PaperGrain />
      <div className="relative">{children}</div>
    </article>
  );
}

/**
 * The letterhead band at the top of a document: who issued it, and what it is.
 * Ruled off from the body the way a real form separates its header block.
 */
export function ArtifactHead({
  issuer,
  title,
  reference,
  accented = false,
}: {
  /** Who produced this - the league office, ownership, the franchise. */
  issuer: string;
  title: string;
  /** A file/reference line. Real documents carry one; it sells the object. */
  reference?: string;
  /**
   * Rules the header in the franchise's accent. A document issued *by the
   * franchise* should look like the franchise issued it; a league-office
   * ruling deliberately does not, because the league is not your team.
   */
  accented?: boolean;
}) {
  return (
    <header
      className={`border-b px-6 py-4 ${
        accented ? "border-b-rule border-t-2 border-t-team-accent" : "border-rule"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p
          className={`text-[11px] font-semibold tracking-[0.18em] uppercase ${
            accented ? "text-team-accent" : "text-ink-muted"
          }`}
        >
          {issuer}
        </p>
        {reference && (
          <p className="font-mono text-[11px] tabular-nums text-ink-muted">{reference}</p>
        )}
      </div>
      <h2 className="mt-2 text-[clamp(1.125rem,2vw,1.5rem)] leading-tight font-bold tracking-[-0.01em] text-ink">
        {title}
      </h2>
    </header>
  );
}

/** A numbered clause, the way a contract or ruling actually enumerates terms. */
export function ArtifactClause({
  number,
  label,
  children,
}: {
  number: number | string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 border-b border-hairline px-6 py-3 last:border-b-0">
      <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
        {typeof number === "number" ? `${number}.` : number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
          {label}
        </p>
        <div className="mt-1 text-[15px] leading-relaxed text-ink">{children}</div>
      </div>
    </div>
  );
}

/**
 * The signature block. A document is executed by someone; saying so is what
 * makes it read as a document rather than a summary panel.
 */
export function ArtifactSignature({ lines }: { lines: { role: string; name: string }[] }) {
  return (
    <footer className="grid grid-cols-1 gap-6 border-t border-rule px-6 py-5 sm:grid-cols-2">
      {lines.map((line) => (
        <div key={line.role}>
          {/* The rule is the signature line itself - signed above it, as on
              paper, rather than a label with a value beside it. */}
          <p className="truncate pb-1 text-[15px] text-ink italic">{line.name}</p>
          <div className="border-t border-rule pt-1">
            <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
              {line.role}
            </p>
          </div>
        </div>
      ))}
    </footer>
  );
}
