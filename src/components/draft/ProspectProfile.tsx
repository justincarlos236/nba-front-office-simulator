"use client";

import {
  deriveScoutingProfile,
  computeScoutingConfidence,
  generateScoutingReport,
  SCOUTING_CONFIDENCE_LABEL,
  BUST_RISK_LABEL,
  TRAJECTORY_LABEL,
  WORK_ETHIC_LABEL,
  READINESS_LABEL,
  INJURY_OUTLOOK_LABEL,
  SCOUTING_REPORT_CONFIDENCE_LABEL,
  type ResolvableHiddenAxis,
} from "@/lib/draft/scoutingProfile";
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
  /** Scouting Pillar Redesign (Phase 3) - this prospect's rank on the public Big Board, 1-indexed. Null if the board hasn't been computed by the caller (e.g. the compare view, which doesn't show it). */
  bigBoardRank: number | null;
  classSize: number;
}) {
  const profile = deriveScoutingProfile(prospect);
  // Scouting Pillar Redesign (Phase 2) - reliability now comes from this
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
            <span className="text-ink">
              {prospect.isInternational ? "Club:" : "Program:"}
            </span>{" "}
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
            <span className="text-ink">Pathway:</span>{" "}
            {PROSPECT_PATHWAY_LABEL[prospect.pathway]}
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

      <div className="mt-4 border-t border-rule pt-4">
        <div className="flex items-baseline justify-between">
          <p className="text-xs tracking-wide text-ink-muted uppercase">Scouting Report</p>
          <span className="text-xs text-ink-muted">
            {SCOUTING_REPORT_CONFIDENCE_LABEL[scoutingReport.confidence]}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
          <p>
            <span className="text-ink-muted">Ceiling:</span>{" "}
            <span className="text-ink">{scoutingReport.ceilingRangeLabel}</span>
          </p>
          <p>
            <span className="text-ink-muted">Bust risk:</span>{" "}
            <span className="text-ink">{BUST_RISK_LABEL[scoutingReport.bustRisk]}</span>
          </p>
          <p>
            <span className="text-ink-muted">Trajectory:</span>{" "}
            <span className="text-ink">{TRAJECTORY_LABEL[scoutingReport.trajectory]}</span>
          </p>
          <p>
            <span className="text-ink-muted">Work ethic:</span>{" "}
            <span className="text-ink">{WORK_ETHIC_LABEL[scoutingReport.workEthic]}</span>
          </p>
          <p>
            <span className="text-ink-muted">Readiness:</span>{" "}
            <span className="text-ink">{READINESS_LABEL[scoutingReport.readiness]}</span>
          </p>
          <p>
            <span className="text-ink-muted">Injury outlook:</span>{" "}
            <span className="text-ink">
              {INJURY_OUTLOOK_LABEL[scoutingReport.injuryOutlook]}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5 border-t border-rule pt-4">
        {attributes.map(([label, value]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-ink-muted">{label}</span>
            <div className="h-1.5 flex-1 rounded-full bg-raised">
              <div className="h-1.5 rounded-full bg-team-accent" style={{ width: `${value}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-ink-muted">{value}</span>
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
