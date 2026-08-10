import { formatCentsCompact } from "@/lib/money";
import {
  Artifact,
  ArtifactClause,
  ArtifactHead,
  ArtifactSignature,
} from "@/components/ui/Artifact";
import { Stamp } from "@/components/ui/Stamp";

/**
 * THE WIRE - Artifact. A player contract, rendered as the document it is.
 *
 * Signing a player is one of the two or three most consequential things a GM
 * does, and it resolved as a form submit followed by a redirect to the
 * dashboard - the same "computes the consequence, then steps over it" failure
 * the trade outcome had.
 *
 * Every field here is real: `signedSeason`, `startSeason`, `endSeason`,
 * `noTradeClause` and `signedUsing` are columns on Contract, and the salary
 * schedule is the actual ContractYear rows. Nothing is decorative except the
 * arrangement, which is the point - this is what the front office would file.
 */

/** Keyed to the real `ExceptionUsed` enum, in the CBA's own vocabulary. */
const EXCEPTION_LABEL: Record<string, string> = {
  NONE: "Cap space",
  MAX: "Maximum salary",
  MID_LEVEL_NON_TAXPAYER: "Non-taxpayer mid-level exception",
  MID_LEVEL_TAXPAYER: "Taxpayer mid-level exception",
  MID_LEVEL_ROOM: "Room mid-level exception",
  BI_ANNUAL: "Bi-annual exception",
  ROOKIE_SCALE: "Rookie scale",
  VETERAN_MINIMUM: "Veteran minimum",
  BIRD_RIGHTS: "Bird rights",
  EARLY_BIRD_RIGHTS: "Early Bird rights",
  NON_BIRD_RIGHTS: "Non-Bird rights",
};

export interface ContractSheetYear {
  season: number;
  salaryCents: bigint;
}

export function ContractSheet({
  playerName,
  teamLabel,
  gmName,
  signedSeason,
  startSeason,
  endSeason,
  noTradeClause,
  signedUsing,
  years,
  className = "",
}: {
  playerName: string;
  teamLabel: string;
  /** Who signed on the franchise's behalf - the user. */
  gmName: string;
  signedSeason: number;
  startSeason: number;
  endSeason: number;
  noTradeClause: boolean;
  signedUsing: string;
  years: ContractSheetYear[];
  className?: string;
}) {
  const total = years.reduce((sum, y) => sum + y.salaryCents, 0n);
  const term = endSeason - startSeason + 1;
  const seasonLabel = (s: number) => `${s}-${(s + 1).toString().slice(-2)}`;

  return (
    <Artifact tone="paper" className={className}>
      {/* Issued by the franchise, so it carries the franchise's accent. */}
      <ArtifactHead
        accented
        issuer={teamLabel}
        title={playerName}
        reference={`Uniform Player Contract · Filed ${seasonLabel(signedSeason)}`}
      />

      <ArtifactClause number={1} label="Term">
        {term} {term === 1 ? "season" : "seasons"}, {seasonLabel(startSeason)} through{" "}
        {seasonLabel(endSeason)}.
      </ArtifactClause>

      <ArtifactClause number={2} label="Compensation">
        <table className="w-full border-collapse">
          <tbody>
            {years.map((y) => (
              <tr key={y.season}>
                <td className="py-1 pr-4 font-mono text-[15px] tabular-nums text-ink-muted">
                  {seasonLabel(y.season)}
                </td>
                <td className="py-1 text-right font-mono text-[15px] tabular-nums text-ink">
                  {formatCentsCompact(y.salaryCents)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-rule">
              <td className="pt-2 pr-4 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
                Total
              </td>
              <td className="pt-2 text-right font-mono text-[15px] font-medium tabular-nums text-ink">
                {formatCentsCompact(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </ArtifactClause>

      <ArtifactClause number={3} label="Cap mechanism">
        {EXCEPTION_LABEL[signedUsing] ?? signedUsing}
      </ArtifactClause>

      <ArtifactClause number={4} label="No-trade clause">
        {noTradeClause
          ? "Granted. This player may not be traded without waiving it."
          : "None. This contract is tradeable subject to league rules."}
      </ArtifactClause>

      {/* The stamp lands across the signature block, the way it does on a
          real filed document - not in an empty band of its own. */}
      <div className="relative">
        <ArtifactSignature
          lines={[
            { role: "Player", name: playerName },
            { role: "General Manager", name: gmName },
          ]}
        />
        <Stamp tone="positive" rotate={-8} className="pointer-events-none absolute -top-3 right-6">
          Executed
        </Stamp>
      </div>
    </Artifact>
  );
}
