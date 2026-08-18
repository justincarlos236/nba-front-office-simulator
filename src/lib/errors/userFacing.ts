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
      remedy: "The Stepien rule blocks it. Swap in a different pick year, or send players instead.",
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
    // The deadline is a hard date, not something a different package fixes -
    // so the remedy says when it reopens rather than suggesting a rebuild.
    test: /trade deadline/i,
    error: {
      summary: "The trade deadline has passed.",
      remedy: "No trades can be made until the regular season ends. Sim to the playoffs to reopen.",
      ruling: true,
    },
  },
  {
    // Ordered before the "full" pattern: a trade that empties a roster and one
    // that overfills it are opposite problems, and both mention a man-count.
    test: /man minimum|under the \d+-man/i,
    error: {
      summary: "That would leave the roster too thin.",
      remedy:
        "A team has to finish a trade with at least 13 players. Send fewer, or take more back.",
    },
  },
  {
    test: /roster[ _-]?(is[ _-]?)?full|max(imum)?[ _-]?roster|man limit|over the \d+-man/i,
    error: {
      summary: "That would put a roster over the limit.",
      remedy: "A team can carry 15 players. Take fewer back, or send more out.",
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
 * True when a value is already written for the user and needs no translation.
 *
 * **Server actions cannot report by throwing.** Next.js redacts the message of
 * any error thrown out of a server action in a production build, replacing it
 * with a generic string carrying only a digest. Every pattern above therefore
 * matched nothing once deployed, and every failure - a cap ruling, a full
 * roster, a player refusing an offer - reached the user as the fallback
 * "That didn't go through." It read as a broken feature rather than a rule.
 *
 * The fix is for an action to *return* its failure rather than throw it, since
 * a returned value crosses the boundary intact. This guard lets `ErrorNotice`
 * accept either form, so a caught `Error` and a returned failure render the
 * same way.
 */
export function isUserFacingError(value: unknown): value is UserFacingError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as UserFacingError).summary === "string"
  );
}

/**
 * Translate a caught error. Never returns the raw engine message as the
 * summary; an unmatched failure gets the plain fallback instead.
 */
export function toUserFacingError(error: unknown): UserFacingError {
  if (isUserFacingError(error)) return error;
  const message = error instanceof Error ? error.message : String(error ?? "");
  // Next's redirect() throws internally on success - never an error to show.
  if (message === "NEXT_REDIRECT") return FALLBACK;
  for (const { test, error: mapped } of PATTERNS) {
    if (test.test(message)) return mapped;
  }
  return FALLBACK;
}
