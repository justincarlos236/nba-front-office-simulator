import type { LeaguePhase } from "@/lib/league/leaguePhase";

export interface NavSection {
  id: string;
  label: string;
  /** Appended to `/leagues/{id}` - callers build the full href themselves. */
  path: string;
}

export type NavGroupId = "team" | "league" | "business";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  sections: NavSection[];
}

/**
 * Every section always exists and is always routable (the pages themselves
 * already show their own "not yet" message outside their active window, e.g.
 * the draft page outside the draft phase) - only which subset is promoted to
 * a prominent "primary" tab changes with the league's phase. Nothing is ever
 * hard-hidden; an earlier version collapsed sections behind a "More"
 * disclosure and that broke real flows.
 *
 * THE WIRE: the audit found 14 targets in one wrapping row in every phase,
 * 9-10 of them an undifferentiated muted list. Sections now belong to a
 * drawer - Team / League / Business - so the secondary tier has structure
 * instead of being a footer's worth of links pretending to be navigation.
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
  // The label said "News" while the page title said "Transactions & News" and
  // the URL said /transactions. All three now agree.
  transactions: { id: "transactions", label: "Transactions", path: "/transactions" },
  history: { id: "history", label: "History", path: "/history" },
  // Was reachable from no navigation at all, despite being a hard block on
  // season simulation - the worst orphan the audit found.
  allStar: { id: "allStar", label: "All-Star", path: "/all-star" },
};

/** Which drawer each section belongs to. */
const GROUP_MEMBERS: Record<NavGroupId, string[]> = {
  team: ["rotation", "freeAgents", "draft", "staff"],
  league: ["schedule", "standings", "playoffs", "allStar", "leaders", "transactions", "history"],
  business: ["finances", "fans", "offseason"],
};

const GROUP_LABEL: Record<NavGroupId, string> = {
  team: "Team",
  league: "League",
  business: "Business",
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

/**
 * The nav's one loud action, per phase.
 *
 * The audit found "Propose a trade" pinned to the right of every league page
 * in every phase - during the lottery, during All-Star weekend, during a
 * playoff series. `PRIMARY_BY_PHASE` correctly reordered everything except the
 * element that shouts. Trading is not always the right next move, so the CTA
 * now follows the phase like everything else.
 */
export const PRIMARY_ACTION_BY_PHASE: Record<LeaguePhase, { label: string; path: string }> = {
  "regular-season": { label: "Propose a trade", path: "/trades/new" },
  "playoffs-incomplete": { label: "Go to the playoffs", path: "/playoffs" },
  "pre-draft": { label: "Scout the class", path: "/draft" },
  "draft-incomplete": { label: "Go to the draft", path: "/draft" },
  ready: { label: "Work the offseason", path: "/offseason" },
};

export function getSubNavSections(phase: LeaguePhase): {
  primary: NavSection[];
  groups: NavGroup[];
} {
  const primaryIds = new Set(PRIMARY_BY_PHASE[phase]);
  const allIds = Object.keys(ALL_SECTIONS);

  return {
    primary: allIds.filter((id) => primaryIds.has(id)).map((id) => ALL_SECTIONS[id]),
    groups: (Object.keys(GROUP_MEMBERS) as NavGroupId[]).map((groupId) => ({
      id: groupId,
      label: GROUP_LABEL[groupId],
      sections: GROUP_MEMBERS[groupId]
        .filter((id) => !primaryIds.has(id))
        .map((id) => ALL_SECTIONS[id]),
    })),
  };
}
