import type { LeaguePhase } from "@/lib/league/leaguePhase";

export interface NavSection {
  id: string;
  label: string;
  /** Appended to `/leagues/{id}` - callers build the full href themselves. */
  path: string;
}

/**
 * Every section always exists and is always routable (the pages themselves
 * already show their own "not yet" message outside their active window, e.g.
 * the draft page outside the draft phase) - only which subset is promoted to
 * a prominent "primary" tab vs tucked in the "More" list changes with the
 * league's phase. Nothing is ever hard-hidden.
 */
const ALL_SECTIONS: Record<string, NavSection> = {
  rotation: { id: "rotation", label: "Rotation", path: "/rotation" },
  schedule: { id: "schedule", label: "Schedule", path: "/schedule" },
  standings: { id: "standings", label: "Standings", path: "/standings" },
  playoffs: { id: "playoffs", label: "Playoffs", path: "/playoffs" },
  offseason: { id: "offseason", label: "Offseason", path: "/offseason" },
  draft: { id: "draft", label: "Draft", path: "/draft" },
  freeAgents: { id: "freeAgents", label: "Free agents", path: "/free-agents" },
  staff: { id: "staff", label: "Staff", path: "/staff" },
  fans: { id: "fans", label: "Fans", path: "/fans" },
  finances: { id: "finances", label: "Finances", path: "/finances" },
  leaders: { id: "leaders", label: "Leaders", path: "/leaders" },
  news: { id: "news", label: "News", path: "/transactions" },
  history: { id: "history", label: "History", path: "/history" },
};

const PRIMARY_BY_PHASE: Record<LeaguePhase, string[]> = {
  "regular-season": ["rotation", "schedule", "standings", "playoffs"],
  "playoffs-incomplete": ["playoffs", "standings", "rotation"],
  // Scouting Pillar Redesign (Phase 1) - during the pre-draft window the
  // draft class exists but the lottery hasn't run, so scouting is the
  // headline activity; offseason stays adjacent for re-signings.
  "pre-draft": ["draft", "offseason", "staff"],
  "draft-incomplete": ["draft", "offseason", "freeAgents"],
  ready: ["offseason", "freeAgents", "staff"],
};

export function getSubNavSections(phase: LeaguePhase): {
  primary: NavSection[];
  secondary: NavSection[];
} {
  const primaryIds = new Set(PRIMARY_BY_PHASE[phase]);
  const allIds = Object.keys(ALL_SECTIONS);
  return {
    primary: allIds.filter((id) => primaryIds.has(id)).map((id) => ALL_SECTIONS[id]),
    secondary: allIds.filter((id) => !primaryIds.has(id)).map((id) => ALL_SECTIONS[id]),
  };
}
