import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NewsFeed, type NewsItem } from "./NewsFeed";
import type { LeaguePulse } from "@/lib/news/leaguePulse";

const MY_TEAM = "team-mine";

let seq = 0;
function item(over: Partial<NewsItem> = {}): NewsItem {
  seq += 1;
  return {
    id: `n${seq}`,
    type: "GAME_RESULT",
    description: `Story number ${seq}`,
    importance: "STANDARD",
    season: 2025,
    teamIds: [],
    dayIndex: 12,
    ...over,
  };
}

const pulse: LeaguePulse = {
  hottest: { leagueTeamId: "h", label: "Lakers", wins: 15, losses: 3, currentStreak: 9 },
  coldest: null,
  best: { leagueTeamId: "h", label: "Lakers", wins: 15, losses: 3, currentStreak: 9 },
  keyInjury: null,
  injuredCount: 0,
};

function renderFeed(transactions: NewsItem[]) {
  return render(
    <NewsFeed transactions={transactions} userTeamId={MY_TEAM} leagueId="league-1" pulse={pulse} />,
  );
}

const stories = [
  item({ type: "TRADE", importance: "BREAKING", description: "Jokic traded to Boston" }),
  item({ type: "TRADE", importance: "MAJOR", description: "Jamal Murray moves west" }),
  item({ type: "INJURY", importance: "MINOR", teamIds: [MY_TEAM] }),
  item({ type: "PLAYER_MORALE", importance: "MINOR" }),
  item({ type: "PLAYER_MORALE", importance: "MINOR" }),
];

describe("NewsFeed search box", () => {
  /**
   * The regression this exists for: browsing and finding used to be two
   * separate `return`s, so the first keystroke swapped the whole subtree.
   * React unmounted the input and mounted a different one, focus was lost
   * after exactly one character, and the box had to be re-clicked for every
   * letter typed.
   */
  it("keeps focus while typing, across the switch into results", () => {
    renderFeed(stories);
    const input = screen.getByPlaceholderText("Any name or phrase");
    input.focus();
    expect(document.activeElement).toBe(input);

    // The first character is what flips the page into finding mode.
    fireEvent.change(input, { target: { value: "j" } });

    expect(document.activeElement).toBe(input);
    // Same DOM node, not a replacement that merely looks the same.
    expect(screen.getByPlaceholderText("Any name or phrase")).toBe(input);
  });

  it("keeps the caret through several characters", () => {
    renderFeed(stories);
    const input = screen.getByPlaceholderText("Any name or phrase") as HTMLInputElement;
    input.focus();
    for (const value of ["j", "ja", "jam", "jama"]) {
      fireEvent.change(input, { target: { value } });
      expect(document.activeElement).toBe(input);
    }
    expect(input.value).toBe("jama");
  });

  it("actually filters once a query is entered", () => {
    renderFeed(stories);
    const input = screen.getByPlaceholderText("Any name or phrase");
    fireEvent.change(input, { target: { value: "Murray" } });
    expect(screen.getByText(/Jamal Murray moves west/)).toBeInTheDocument();
    expect(screen.queryByText(/Jokic traded to Boston/)).not.toBeInTheDocument();
  });

  it("drops the editorial furniture while searching and restores it after", () => {
    renderFeed(stories);
    const input = screen.getByPlaceholderText("Any name or phrase");
    expect(screen.getByText("Around the league")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Murray" } });
    expect(screen.queryByText("Around the league")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Around the league")).toBeInTheDocument();
  });

  it("says so plainly when nothing matches", () => {
    renderFeed(stories);
    fireEvent.change(screen.getByPlaceholderText("Any name or phrase"), {
      target: { value: "zzzzzz" },
    });
    expect(screen.getByText("No stories match these filters.")).toBeInTheDocument();
  });
});
