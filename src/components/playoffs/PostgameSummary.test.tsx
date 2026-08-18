import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PostgameSummary } from "./PostgameSummary";
import type { LiveGameResult } from "./LiveGameExperience";

/**
 * Every club's players must sit under that club's own heading.
 *
 * **This is a regression test for a real defect.** `PostgameSummary` used to
 * label the panels from `homeTeam`/`awayTeam` props while filtering their rows
 * by `result.homeTeamId`/`result.awayTeamId`. Home court alternates between
 * games of a playoff series, so once the page advanced to the next fixture
 * those props were the reverse of the game being rendered - each club's
 * players appeared under the other club's name, and the final line printed the
 * winner's score beside the loser's name. A user who had just lost read it as
 * a win and concluded the series record was broken. The record was right.
 *
 * The fixture below is deliberately built the way the bug needed: the higher
 * seed is the *away* team, so anything that assumes home means higher seed, or
 * that reaches for a fixture other than the one in `result`, comes apart here.
 *
 * Typed rather than cast, so a field added to the action's return makes this
 * fail to compile instead of silently testing a shape the product no longer
 * has.
 */

const HOME_TEAM_ID = "team-home";
const AWAY_TEAM_ID = "team-away";
const HOME_PLAYERS = ["Home Guard", "Home Center"];
const AWAY_PLAYERS = ["Away Guard", "Away Forward"];

function boxLine(leagueTeamId: string, playerName: string, points: number) {
  return {
    leaguePlayerId: `${leagueTeamId}-${playerName}`,
    leagueTeamId,
    playerName,
    points,
    rebounds: 4,
    assists: 3,
    steals: 1,
    blocks: 1,
    turnovers: 2,
    minutesPlayed: 32,
    fgMade: 8,
    fgAttempted: 15,
    fg3Made: 2,
    fg3Attempted: 5,
    ftMade: 2,
    ftAttempted: 2,
  };
}

function result(over: Partial<LiveGameResult> = {}): LiveGameResult {
  return {
    seriesId: "series-1",
    homeTeamId: HOME_TEAM_ID,
    awayTeamId: AWAY_TEAM_ID,
    homeTeamLabel: "Home Club",
    awayTeamLabel: "Away Club",
    homeTeamLogoUrl: null,
    awayTeamLogoUrl: null,
    quarters: [],
    overtimes: [],
    perPeriodStats: [],
    finalHomeScore: 101,
    finalAwayScore: 115,
    homeWon: false,
    boxScore: [
      ...HOME_PLAYERS.map((n, i) => boxLine(HOME_TEAM_ID, n, 20 - i)),
      ...AWAY_PLAYERS.map((n, i) => boxLine(AWAY_TEAM_ID, n, 30 - i)),
    ],
    seriesHigherSeedWins: 3,
    seriesLowerSeedWins: 1,
    // The higher seed is the AWAY side here, on purpose.
    higherSeedTeamId: AWAY_TEAM_ID,
    lowerSeedTeamId: HOME_TEAM_ID,
    seriesWinnerTeamId: null,
    champion: null,
    news: [],
    ...over,
  };
}

function renderSummary(over: Partial<LiveGameResult> = {}) {
  return render(
    <PostgameSummary
      leagueId="L1"
      seriesId="series-1"
      result={result(over)}
      userTeamId={HOME_TEAM_ID}
    />,
  );
}

/** The table whose heading is `label`. */
function panel(label: string): HTMLElement {
  const heading = screen.getByText(label, { selector: "p,h2,h3,th,caption,div" });
  const table = heading.closest("div")?.querySelector("table");
  if (!table) throw new Error(`no table under the heading "${label}"`);
  return table;
}

describe("PostgameSummary", () => {
  describe("each panel holds only its own club's players", () => {
    it("puts the home club's players under the home club's name", () => {
      renderSummary();
      const home = panel("Home Club");
      for (const name of HOME_PLAYERS) expect(within(home).getByText(name)).toBeVisible();
      for (const name of AWAY_PLAYERS) expect(within(home).queryByText(name)).toBeNull();
    });

    it("puts the away club's players under the away club's name", () => {
      renderSummary();
      const away = panel("Away Club");
      for (const name of AWAY_PLAYERS) expect(within(away).getByText(name)).toBeVisible();
      for (const name of HOME_PLAYERS) expect(within(away).queryByText(name)).toBeNull();
    });
  });

  describe("the final line", () => {
    it("names the winner first, with the winning score", () => {
      renderSummary();
      // Away won 115-101, and away is not the user's club.
      expect(screen.getByText(/Away Club 115 - 101 Home Club/)).toBeVisible();
    });

    it("still names the winner first when the home side wins", () => {
      renderSummary({ homeWon: true, finalHomeScore: 120, finalAwayScore: 99 });
      expect(screen.getByText(/Home Club 120 - 99 Away Club/)).toBeVisible();
    });
  });

  describe("series wording", () => {
    it("names the series winner from the result, not from home/away", () => {
      renderSummary({ seriesWinnerTeamId: AWAY_TEAM_ID, seriesHigherSeedWins: 4 });
      expect(screen.getByText(/Away Club wins the series 4-1/)).toBeVisible();
    });

    it("names the opponent from the result when the user is trailing", () => {
      // User is the home club and the lower seed, trailing 1-3. The opponent
      // is resolved by comparing userTeamId against result.homeTeamId - the
      // props that used to answer this were the ones that went stale.
      renderSummary();
      expect(screen.getByText(/Away Club leads 3-1/)).toBeVisible();
    });

    it("orders the seed line by seed, not by home and away", () => {
      // The away side is the higher seed in this fixture, so a component that
      // conflated home with higher seed would print these the other way round.
      renderSummary();
      expect(screen.getByText("Away Club vs Home Club")).toBeVisible();
    });
  });
});
