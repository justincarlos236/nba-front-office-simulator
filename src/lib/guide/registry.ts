/**
 * The single canonical registry of every /guide article and topic anchor
 * (Onboarding Philosophy Phase 1 - docs/ONBOARDING_DESIGN.md Part 4.1/4B.3,
 * "one concept, one home, one link"). Both the `/guide` index page and the
 * `HowDoesThisWork` link primitive read from this - a topic id that isn't
 * registered here is a compile error at every call site, not a silent
 * broken link discovered later.
 */
export interface GuideTopic {
  /** Stable id used by `HowDoesThisWork` and Action Center items - never the raw href. */
  id: string;
  label: string;
  /** Full path, including the article's own hash anchor when the topic is a section within it. */
  href: string;
}

export interface GuideArticle {
  slug: string;
  title: string;
  summary: string;
}

export const GUIDE_ARTICLES: GuideArticle[] = [
  {
    slug: "finances",
    title: "How the finances work",
    summary:
      "The salary cap, trades, free agency, and what ownership expects from you - no NBA CBA knowledge required.",
  },
  {
    slug: "roster",
    title: "How your roster works",
    summary: "Rotation minutes, player morale, and what your coaching staff actually does.",
  },
  {
    slug: "season-flow",
    title: "How a season plays out",
    summary: "The playoffs, the draft lottery, and how the calendar moves your franchise forward.",
  },
  {
    slug: "scouting",
    title: "How scouting works",
    summary:
      "Spending assignments, the Big Board, delegating to your staff, and what Draft Night actually resolves.",
  },
];

export const GUIDE_TOPICS: Record<string, GuideTopic> = {
  "financial-status": {
    id: "financial-status",
    label: "Financial Status",
    href: "/guide/finances#financial-status",
  },
  "value-tiers": {
    id: "value-tiers",
    label: "Player Value Tiers",
    href: "/guide/finances#value-tiers",
  },
  trades: { id: "trades", label: "Trade Financial Check", href: "/guide/finances#trades" },
  "cpu-trade-decisions": {
    id: "cpu-trade-decisions",
    label: "CPU Trade Decisions",
    href: "/guide/finances#cpu-trade-decisions",
  },
  "re-signing-rights": {
    id: "re-signing-rights",
    label: "Re-Signing Rights",
    href: "/guide/finances#re-signing-rights",
  },
  "signing-exception": {
    id: "signing-exception",
    label: "Signing Exception",
    href: "/guide/finances#signing-exception",
  },
  "financial-flexibility": {
    id: "financial-flexibility",
    label: "Financial Flexibility Grade",
    href: "/guide/finances#financial-flexibility",
  },
  "owner-confidence": {
    id: "owner-confidence",
    label: "Owner Confidence & Job Security",
    href: "/guide/finances#owner-confidence",
  },

  rotation: { id: "rotation", label: "Rotation & Minutes", href: "/guide/roster#rotation" },
  morale: { id: "morale", label: "Player Morale & Trade Requests", href: "/guide/roster#morale" },
  staff: { id: "staff", label: "Coaching Staff", href: "/guide/roster#staff" },

  playoffs: { id: "playoffs", label: "The Playoffs", href: "/guide/season-flow#playoffs" },
  "all-star": { id: "all-star", label: "All-Star Weekend", href: "/guide/season-flow#all-star" },
  "draft-lottery": {
    id: "draft-lottery",
    label: "The Draft Lottery",
    href: "/guide/season-flow#draft-lottery",
  },
  offseason: { id: "offseason", label: "The Offseason", href: "/guide/season-flow#offseason" },

  scouting: { id: "scouting", label: "Scouting the Class", href: "/guide/scouting#scouting" },
  "class-character": {
    id: "class-character",
    label: "Class Character",
    href: "/guide/scouting#class-character",
  },
  "big-board": { id: "big-board", label: "The Big Board", href: "/guide/scouting#big-board" },
  "scouting-delegation": {
    id: "scouting-delegation",
    label: "Letting Your Staff Handle It",
    href: "/guide/scouting#delegation",
  },
  "draft-resolution": {
    id: "draft-resolution",
    label: "What Draft Night Actually Resolves",
    href: "/guide/scouting#resolution",
  },
  "scouting-long-tail": {
    id: "scouting-long-tail",
    label: "The Long Game",
    href: "/guide/scouting#long-tail",
  },
};
