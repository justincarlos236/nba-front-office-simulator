/**
 * The finances section's own tab bar, one level below the league sub-nav.
 *
 * Ordered the way a GM actually thinks about the business: what needs my
 * response right now (Overview -> Inbox), then how did we do (Report), then
 * the levers I pull (Operations), then the long-horizon bets (Arena).
 */
export interface FinancesTab {
  id: string;
  label: string;
  /** Appended to /leagues/[id]/finances - empty string is the index route. */
  path: string;
  /** One-line "what lives here," rendered as the subhead on each tab page. */
  blurb: string;
}

export const FINANCES_TABS: FinancesTab[] = [
  {
    id: "overview",
    label: "Overview",
    path: "",
    blurb: "What needs your attention, and where the franchise stands right now.",
  },
  {
    id: "inbox",
    label: "Inbox",
    path: "/inbox",
    blurb:
      "Sponsorship offers, crises, and opportunities the business side throws at you as the season plays out - every option costs something.",
  },
  {
    id: "report",
    label: "Report",
    path: "/report",
    blurb: "Where the money came from and where it went, season by season.",
  },
  {
    id: "operations",
    label: "Operations",
    path: "/operations",
    blurb:
      "The levers you pull every season: ticket pricing, department budgets, and the season-ticket base underneath it all.",
  },
  {
    id: "arena",
    label: "Arena & Capital",
    path: "/arena",
    blurb: "Long-horizon bets - the building itself, business expansion, and how you pay for them.",
  },
];

export function financesTabById(id: string): FinancesTab {
  const tab = FINANCES_TABS.find((t) => t.id === id);
  if (!tab) throw new Error(`Unknown finances tab: ${id}`);
  return tab;
}
