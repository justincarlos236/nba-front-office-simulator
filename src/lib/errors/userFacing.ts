/**
 * Server-action errors, translated for the person who hit them.
 *
 * The audit found the same pattern on every action surface: a thrown
 * `Error` from a server action rendered straight into the UI as
 * `{submitError}`. Those strings are written for developers - they name the
 * rule that failed, not what the user should do about it, and they arrive with
 * no next step at the exact moment one is needed.
 *
 * This maps the failures the engine actually produces onto a cause and a
 * remedy, and falls back to a plain sentence rather than an engine string.
 */

export interface UserFacingError {
  /** What happened, in the user's terms. */
  summary: string;
  /** What they can do about it. Omitted when there genuinely is no next step. */
  remedy?: string;
  /** True when the league office refused, rather than the user making a mistake. */
  ruling?: boolean;
}

/**
 * Matched against the message a server action threw. Order matters: the first
 * match wins, so specific rules precede general ones.
 */
const PATTERNS: { test: RegExp; error: UserFacingError }[] = [
  {
    // The engine throws both prose ("second apron rule") and constants
    // ("SECOND_APRON_AGGREGATION_PROHIBITED"), so separators are optional.
    test: /second[ _-]?apron/i,
    error: {
      summary: "The second apron blocks this deal.",
      remedy:
        "Teams over the second apron can't aggregate salaries in a trade. Send one player whose salary alone covers the return, or shed salary first.",
      ruling: true,
    },
  },
  {
    test: /salary[ _-]?match|match[ _-]?salary/i,
    error: {
      summary: "The salaries don't match closely enough.",
      remedy:
        "Over the cap, incoming salary has to stay within a set percentage of outgoing. Add a contract to the lighter side or remove one from the heavier side.",
      ruling: true,
    },
  },
  {
    test: /no[ _-]?trade[ _-]?clause/i,
    error: {
      summary: "That player holds a no-trade clause.",
      remedy: "They can't be moved without waiving it. Build the deal around someone else.",
      ruling: true,
    },
  },
  {
    test: /stepien/i,
    error: {
      summary: "This would leave you without a first-round pick in consecutive years.",
      remedy:
        "The Stepien rule blocks it. Swap in a different pick year, or send players instead.",
      ruling: true,
    },
  },
  {
    test: /cap[ _-]?space|exception|mid[ _-]?level/i,
    error: {
      summary: "You don't have the cap room or exception for this offer.",
      remedy:
        "Lower the salary, use a minimum contract, or free up space before making this offer.",
      ruling: true,
    },
  },
  {
    test: /roster[ _-]?(is[ _-]?)?full|max(imum)?[ _-]?roster/i,
    error: {
      summary: "Your roster is full.",
      remedy: "Trade or release a player before adding another.",
    },
  },
  {
    test: /only trade away players from your own team/i,
    error: {
      summary: "You can only trade players from your own team.",
      remedy: "Reload the trade builder and rebuild the deal from your roster.",
    },
  },
  {
    test: /league not found|not found/i,
    error: {
      summary: "That save couldn't be found.",
      remedy: "It may have been deleted. Head back to your leagues.",
    },
  },
  {
    test: /already (been )?(signed|traded|selected|drafted)/i,
    error: {
      summary: "Someone got there first.",
      remedy: "That player is no longer available. Refresh to see the current state.",
    },
  },
];

const FALLBACK: UserFacingError = {
  summary: "That didn't go through.",
  remedy: "Nothing was changed. Try again, and reload the page if it keeps failing.",
};

/**
 * Translate a caught error. Never returns the raw engine message as the
 * summary; an unmatched failure gets the plain fallback instead.
 */
export function toUserFacingError(error: unknown): UserFacingError {
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Next's redirect() throws internally on success - never an error to show.
  if (message === "NEXT_REDIRECT") return FALLBACK;
  for (const { test, error: mapped } of PATTERNS) {
    if (test.test(message)) return mapped;
  }
  return FALLBACK;
}
