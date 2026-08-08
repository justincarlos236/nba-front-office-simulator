import { formatCentsCompact } from "@/lib/money";
import { Artifact, ArtifactHead, ArtifactSignature } from "@/components/ui/Artifact";
import { Stamp } from "@/components/ui/Stamp";

/**
 * THE WIRE - Artifact. Ownership speaking to you, as a letter.
 *
 * A payroll directive and a financial mandate are the two moments the owner
 * makes a demand with your job attached to it. They rendered as two sentences
 * in the corner of a dashboard panel - the same weight as a roster count.
 *
 * They are letters from your boss, so they are rendered as letters. The
 * archetype the league already assigns (`OwnerArchetype`) decides the tone,
 * because a Penny-Pincher and a Win-Now Billionaire do not write the same
 * memo about the same payroll figure.
 */

export type OwnershipDemand =
  | { kind: "payroll"; targetCents: bigint; bySeason: number }
  | { kind: "profitability"; bySeason: number };

/**
 * Tone per archetype. Same demand, different voice - the difference between a
 * boss who is disappointed and one who is doing arithmetic at you.
 */
const VOICE: Record<string, { salutation: string; close: string }> = {
  WIN_NOW_BILLIONAIRE: {
    salutation: "I did not buy this team to wait.",
    close: "Get it done.",
  },
  PENNY_PINCHER: {
    salutation: "I have been through the books.",
    close: "The numbers are not a suggestion.",
  },
  PATIENT_BUILDER: {
    salutation: "I have backed your plan so far.",
    close: "I would like to keep backing it.",
  },
  ABSENTEE: {
    salutation: "My people flagged this for me.",
    close: "Handle it.",
  },
  MEDDLER: {
    salutation: "I have been following this closely.",
    close: "I will be watching how you handle it.",
  },
};

const FALLBACK_VOICE = {
  salutation: "We need to talk about the books.",
  close: "I trust you will take care of it.",
};

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
}

export function OwnershipLetter({
  demand,
  ownerArchetypeLabel,
  ownerArchetype,
  teamLabel,
  className = "",
}: {
  demand: OwnershipDemand;
  /** Human label, e.g. "Penny-Pincher". */
  ownerArchetypeLabel: string;
  /** Raw enum value, used to pick the voice. */
  ownerArchetype: string;
  teamLabel: string;
  className?: string;
}) {
  const voice = VOICE[ownerArchetype] ?? FALLBACK_VOICE;

  const body =
    demand.kind === "payroll" ? (
      <>
        Payroll comes down below{" "}
        <span className="font-mono tabular-nums text-ink">
          {formatCentsCompact(demand.targetCents)}
        </span>{" "}
        before the {seasonLabel(demand.bySeason)} season. I am not interested in how, only
        that it happens.
      </>
    ) : (
      <>
        This franchise returns to profitability before the {seasonLabel(demand.bySeason)}{" "}
        season. We are losing money on a team I am told is worth watching.
      </>
    );

  return (
    <Artifact tone="official" className={className}>
      <ArtifactHead
        issuer={`Office of the Owner · ${teamLabel}`}
        title={demand.kind === "payroll" ? "Payroll directive" : "Financial mandate"}
        reference={`Due ${seasonLabel(demand.bySeason)}`}
      />

      <div className="space-y-4 px-6 py-5 text-[15px] leading-relaxed text-ink-muted">
        <p className="text-ink">{voice.salutation}</p>
        <p>{body}</p>
        <p className="text-ink">{voice.close}</p>
      </div>

      <div className="flex justify-end px-6">
        <Stamp tone="signal" rotate={-7}>
          Job at risk
        </Stamp>
      </div>

      <ArtifactSignature lines={[{ role: ownerArchetypeLabel, name: "Ownership" }]} />
    </Artifact>
  );
}
