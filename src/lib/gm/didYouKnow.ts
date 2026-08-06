import { GUIDE_TOPICS } from "@/lib/guide/registry";

/**
 * The quiet-state guide pointer (Onboarding Philosophy Phase 2 - see
 * docs/ONBOARDING_DESIGN.md Part 4B.5). Shown only when the Action Center
 * has nothing urgent to say - "Nothing urgent right now" is exactly the
 * moment a new player is most likely to feel adrift, so it's the one
 * non-intrusive place left to point at the Guide without ever competing
 * with a real recommendation.
 */
export interface DidYouKnowTip {
  id: string;
  text: string;
  href: string;
}

export const DID_YOU_KNOW_TIPS: DidYouKnowTip[] = [
  {
    id: "lottery-odds",
    text: "The three worst records in the league get identical draft lottery odds at the very top pick - bottoming out to be the single worst team doesn't meaningfully help your odds.",
    href: GUIDE_TOPICS["draft-lottery"].href,
  },
  {
    id: "re-signing-rights",
    text: "When your own player's contract expires, you keep Re-Signing Rights - letting you offer more than an outside team can, even over the cap.",
    href: GUIDE_TOPICS["re-signing-rights"].href,
  },
  {
    id: "medical-staff",
    text: "Your Medical Staff isn't cosmetic - a higher-quality hire genuinely lowers how often your players get hurt and shortens recovery time when they do.",
    href: GUIDE_TOPICS.staff.href,
  },
  {
    id: "morale",
    text: "Player morale is driven by real events, not randomness - playing time, winning, and roster moves all move it, and it can escalate all the way to a formal trade demand.",
    href: GUIDE_TOPICS.morale.href,
  },
  {
    id: "financial-flexibility",
    text: "A big long-term contract keeps costing you years after you sign it - your Financial Flexibility Grade summarizes exactly how locked-in your future payroll already is.",
    href: GUIDE_TOPICS["financial-flexibility"].href,
  },
  {
    id: "coach-style",
    text: "Your Head Coach's style (Pace & Space, Balanced, Grind It Out) shifts how often your team shoots threes, on top of their quality nudging your win probability.",
    href: GUIDE_TOPICS.staff.href,
  },
];

/**
 * Deterministic within a given real-world calendar day for a given league -
 * stable across re-renders and refreshes within a session, without a new
 * query or a DB write just to track "which tip was shown last." Rotates
 * naturally as real days pass, and varies league to league so multi-save
 * players don't see the same tip on every dashboard.
 */
export function pickDidYouKnowTip(leagueId: string, now: Date = new Date()): DidYouKnowTip {
  let hash = 0;
  for (let i = 0; i < leagueId.length; i++) {
    hash = (hash * 31 + leagueId.charCodeAt(i)) | 0;
  }
  const dayNumber = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  const index = Math.abs(hash + dayNumber) % DID_YOU_KNOW_TIPS.length;
  return DID_YOU_KNOW_TIPS[index];
}
