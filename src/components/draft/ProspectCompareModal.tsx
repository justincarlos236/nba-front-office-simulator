"use client";

import { deriveScoutingProfile } from "@/lib/draft/scoutingProfile";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { DraftProspectInfo } from "./types";
import { formatHeight } from "./types";

interface Row {
  label: string;
  render: (p: DraftProspectInfo) => string;
}

const ROWS: Row[] = [
  { label: "Position", render: (p) => p.position },
  { label: "Age", render: (p) => String(p.age) },
  { label: "Overall", render: (p) => String(p.overallRating) },
  { label: "Potential", render: (p) => String(p.potentialRating) },
  { label: "Height", render: (p) => formatHeight(p.heightInches) ?? "—" },
  { label: "Weight", render: (p) => (p.weightLbs != null ? `${p.weightLbs} lbs` : "—") },
  { label: "College / Team", render: (p) => p.collegeOrTeam ?? "—" },
  { label: "Nationality", render: (p) => p.nationality ?? "—" },
  { label: "Comparison", render: (p) => p.comparisonPlayerName ?? "—" },
  { label: "Scoring", render: (p) => String(deriveScoutingProfile(p).scoring) },
  { label: "Playmaking", render: (p) => String(deriveScoutingProfile(p).playmaking) },
  { label: "Defense", render: (p) => String(deriveScoutingProfile(p).defense) },
  { label: "Rebounding", render: (p) => String(deriveScoutingProfile(p).rebounding) },
  { label: "Athleticism", render: (p) => String(deriveScoutingProfile(p).athleticism) },
];

export function ProspectCompareModal({
  prospects,
  onClose,
}: {
  prospects: DraftProspectInfo[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-[2px] border border-rule bg-field p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">Compare Prospects</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted transition hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[500px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 shrink-0 text-left text-xs text-ink-muted"></th>
                {prospects.map((p) => (
                  <th key={p.id} className="p-2 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <PlayerAvatar photoUrl={null} fullName={p.fullName} size="md" />
                      <span className="font-medium text-ink">{p.fullName}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-rule">
                  <td className="py-2 pr-3 text-xs font-medium text-ink-muted">{row.label}</td>
                  {prospects.map((p) => (
                    <td key={p.id} className="p-2 text-center text-ink">
                      {row.render(p)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
