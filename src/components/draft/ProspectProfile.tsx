"use client";

import {
  deriveScoutingProfile,
  computeScoutingConfidence,
  generateScoutingReport,
  SCOUTING_CONFIDENCE_LABEL,
  type ResolvableHiddenAxis,
} from "@/lib/draft/scoutingProfile";
import { ScoutingReportSheet } from "./ScoutingReportSheet";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { DraftProspectInfo } from "./types";
import { formatHeight } from "./types";
import { SCOUTING_DEPTH_LABEL } from "@/lib/draft/scoutingAssignments";
import { PROSPECT_PATHWAY_LABEL, PROSPECT_PATHWAY_DESCRIPTION } from "@/lib/draft/prospectBio";
import { classCharacterModifiers } from "@/lib/draft/classCharacter";

/** The full rich scouting profile for one prospect - shared by the profile modal and the compare view. */
export function ProspectProfile({
  prospect,
  bigBoardRank,
  classSize,
}: {
  prospect: DraftProspectInfo;
  /** Scouting Pillar Redesign - this prospect's rank on the public Big Board, 1-indexed. Null if the board hasn't been computed by the caller (e.g. the compare view, which doesn't show it). */
  bigBoardRank: number | null;
  classSize: number;
}) {
  const profile = deriveScoutingProfile(prospect);
  // reliability now comes from this
  // specific prospect's own Scouting Depth, not a flat department level.
  // Phase 4: resolvedHiddenTraits (from a Private Workout) and this class's
  // injuryRiskDelta (from its character) both feed the same report.
  const scoutingReport = generateScoutingReport(
    prospect,
    prospect.scoutingDepth,
    prospect.resolvedHiddenTraits as ResolvableHiddenAxis[],
    classCharacterModifiers(prospect.classCharacter).injuryRiskDelta,
  );
  const attributes: [string, number][] = [
    ["Scoring", profile.scoring],
    ["Playmaking", profile.playmaking],
    ["Defense", profile.defense],
    ["Rebounding", profile.rebounding],
    ["Athleticism", profile.athleticism],
  ];
  const height = formatHeight(prospect.heightInches);
  const confidence = computeScoutingConfidence(prospect.age);

  return (
    <div>
      <div className="flex items-center gap-4">
        <PlayerAvatar photoUrl={null} fullName={prospect.fullName} size="lg" />
        <div>
          <p className="text-xl font-bold text-ink">{prospect.fullName}</p>
          <p className="text-sm text-ink-muted">
            {prospect.position} &middot; Age {prospect.age} &middot; Rating {prospect.overallRating}{" "}
            &middot; Potential {prospect.potentialRating}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-rule pt-4 text-sm text-ink-muted sm:grid-cols-3">
        {height && (
          <p>
            <span className="text-ink">Height:</span> {height}
          </p>
        )}
        {prospect.weightLbs != null && (
          <p>
            <span className="text-ink">Weight:</span> {prospect.weightLbs} lbs
          </p>
        )}
        {prospect.collegeOrTeam && (
          <p>
            <span className="text-ink">{prospect.isInternational ? "Club:" : "Program:"}</span>{" "}
            {prospect.collegeOrTeam}
          </p>
        )}
        {prospect.nationality && (
          <p>
            <span className="text-ink">Nationality:</span> {prospect.nationality}
          </p>
        )}
        {prospect.pathway && (
          <p title={PROSPECT_PATHWAY_DESCRIPTION[prospect.pathway]}>
            <span className="text-ink">Pathway:</span> {PROSPECT_PATHWAY_LABEL[prospect.pathway]}
          </p>
        )}
        {bigBoardRank != null && (
          <p>
            <span className="text-ink">Big Board rank:</span> #{bigBoardRank} of {classSize}
          </p>
        )}
        <p>
          <span className="text-ink">Scouting confidence:</span>{" "}
          {SCOUTING_CONFIDENCE_LABEL[confidence]}
        </p>
        <p>
          <span className="text-ink">Scouting Depth:</span>{" "}
          {SCOUTING_DEPTH_LABEL[prospect.scoutingDepth] ?? "Unknown"}
        </p>
      </div>

      {prospect.comparisonPlayerName && (
        <p className="mt-3 text-sm text-caution">
          Scouts compare his game to{" "}
          <span className="font-medium">{prospect.comparisonPlayerName}</span>
        </p>
      )}

      {/* The report is a document the scouting department produced, so it is
          rendered as one. Six identical grey lines stated the findings without
          ever conveying how much of the file is actually filled in - which is
          the whole substance of a draft decision. */}
      <ScoutingReportSheet
        report={scoutingReport}
        prospectName={prospect.fullName}
        className="mt-5"
      />

      {/* Square, not `rounded-full`: the document world has cut edges. */}
      <div className="mt-5 space-y-2 border-t border-rule pt-4">
        {attributes.map(([label, value]) => (
          <div key={label} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
              {label}
            </span>
            <div className="h-1.5 flex-1 bg-raised">
              <div className="h-1.5 bg-team-accent" style={{ width: `${value}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right font-mono tabular-nums text-ink-muted">
              {value}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        <span className="text-ink">Strengths:</span> {profile.strengths.join(", ")}
        <br />
        <span className="text-ink">Weaknesses:</span> {profile.weaknesses.join(", ")}
      </p>
    </div>
  );
}
