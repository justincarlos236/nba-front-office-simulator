/**
 * Whether a playoff series is already won, and by whom.
 *
 * Extracted because the live-game page renders from a server component that
 * deliberately re-runs *after* a game resolves (it must not 404 mid-flight and
 * yank the UI out from under a game that just ended). That means the page can
 * legitimately render a series whose last game has already been played - and
 * without this check it derived the next game number as
 * `wins + wins + 1` unconditionally, producing "Game 8" of a best-of-seven
 * above a "You lead 4-3" line describing a series that was already over.
 *
 * The server action that plays a game is separately and correctly guarded (it
 * only matches series with `winnerTeamId: null`), so this is a display concern
 * rather than a rules one. It is still worth having as tested logic: "is this
 * series finished" is asked in more than one place, and getting it wrong shows
 * the user a game that cannot exist.
 */
export function isSeriesDecided(
  userWins: number,
  opponentWins: number,
  winsNeeded: number,
): boolean {
  return userWins >= winsNeeded || opponentWins >= winsNeeded;
}

/**
 * The game number that would be played next, or null when the series is over.
 *
 * Null is the point: a decided series has no next game, and returning a number
 * anyway is what put "Game 8" on screen.
 */
export function nextGameNumber(
  userWins: number,
  opponentWins: number,
  winsNeeded: number,
): number | null {
  if (isSeriesDecided(userWins, opponentWins, winsNeeded)) return null;
  return userWins + opponentWins + 1;
}
