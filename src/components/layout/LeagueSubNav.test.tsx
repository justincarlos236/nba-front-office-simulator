import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LeagueSubNav } from "./LeagueSubNav";
import type { NavGroup, NavSection } from "@/lib/league/subNavSections";

/**
 * The nav is a client component and reads `usePathname` to decide what is
 * active, so the router has to be stubbed. Held in a mutable box rather than
 * baked into the factory so each test can place the user on a different page.
 */
const route = { pathname: "/leagues/L1" };
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

const LEAGUE_ID = "L1";

const section = (id: string, label: string, path: string): NavSection => ({
  id,
  label,
  path,
});

/** The regular-season primary row, which is the one carrying glyphs. */
const REGULAR_SEASON: NavSection[] = [
  section("rotation", "Roster", "/rotation"),
  section("schedule", "Schedule", "/schedule"),
  section("standings", "Standings", "/standings"),
  section("playoffs", "Playoffs", "/playoffs"),
];

/** The `ready` phase primary row - none of these four carry a glyph. */
const OFFSEASON_PRIMARY: NavSection[] = [
  section("offseason", "Offseason", "/offseason"),
  section("freeAgents", "Free agents", "/free-agents"),
  section("staff", "Staff", "/staff"),
];

/**
 * Deliberately a section that appears in no primary row used here. Reusing one
 * (Staff sits in the `ready` phase primary) makes every `getByRole` for that
 * label ambiguous, and the ambiguity reads as a component bug rather than a
 * fixture one.
 */
const GROUPS: NavGroup[] = [
  {
    id: "league",
    label: "League",
    sections: [section("history", "History", "/history")],
  },
];

function renderNav(primary: NavSection[] = REGULAR_SEASON, attention = {}) {
  return render(
    <LeagueSubNav
      leagueId={LEAGUE_ID}
      primary={primary}
      groups={GROUPS}
      primaryAction={{ label: "Propose a trade", path: "/trades/new" }}
      attention={attention}
    />,
  );
}

/** The glyph, if this link has one. Icons are `aria-hidden`, so query the DOM. */
function iconIn(name: string): SVGElement | null {
  return screen.getByRole("link", { name: new RegExp(name, "i") }).querySelector("svg");
}

describe("LeagueSubNav", () => {
  describe("sections and links", () => {
    it("renders every primary section as a link to its own path", () => {
      renderNav();
      for (const s of REGULAR_SEASON) {
        expect(screen.getByRole("link", { name: new RegExp(s.label, "i") })).toHaveAttribute(
          "href",
          `/leagues/${LEAGUE_ID}${s.path}`,
        );
      }
    });

    it("renders the phase's primary action", () => {
      renderNav();
      expect(screen.getByRole("link", { name: /propose a trade/i })).toHaveAttribute(
        "href",
        `/leagues/${LEAGUE_ID}/trades/new`,
      );
    });

    it("keeps secondary sections directly clickable rather than hidden", () => {
      // The component's own docstring: never hard-hide a section, only
      // de-emphasize it. An earlier version broke flows by collapsing these.
      renderNav();
      expect(screen.getByRole("link", { name: /history/i })).toHaveAttribute(
        "href",
        `/leagues/${LEAGUE_ID}/history`,
      );
    });
  });

  describe("the four primary glyphs", () => {
    it.each([["Roster"], ["Schedule"], ["Standings"], ["Playoffs"]])(
      "gives %s an icon",
      (label) => {
        renderNav();
        expect(iconIn(label)).not.toBeNull();
      },
    );

    it("leaves primary sections outside the four without one", () => {
      // Deliberately partial: icons on everything flatten the row back into
      // noise, which is what the map is guarding against.
      //
      // Tested against the `ready` phase's primary row rather than a secondary
      // link. Secondary sections never consult the map at all, so asserting on
      // one passes no matter what the map says - it cannot catch an icon added
      // where it does not belong.
      renderNav(OFFSEASON_PRIMARY);
      for (const s of OFFSEASON_PRIMARY) {
        expect(iconIn(s.label)).toBeNull();
      }
      expect(iconIn("Propose a trade")).toBeNull();
    });

    it("hides the glyph from assistive tech, since the label already says it", () => {
      renderNav();
      expect(iconIn("Schedule")).toHaveAttribute("aria-hidden", "true");
    });

    it("draws in currentColor so icon and label move together", () => {
      // The active/hover rules only set a text colour. If an icon ever carried
      // its own, it would stay put while its label changed.
      renderNav();
      expect(iconIn("Standings")).toHaveAttribute("stroke", "currentColor");
    });

    it("sizes the glyph below the 11px label", () => {
      renderNav();
      expect(iconIn("Roster")).toHaveAttribute("width", "12");
    });
  });

  describe("active state", () => {
    it("marks the section the user is on, and only that one", () => {
      route.pathname = `/leagues/${LEAGUE_ID}/standings`;
      renderNav();

      const active = screen.getByRole("link", { name: /standings/i });
      const other = screen.getByRole("link", { name: /schedule/i });
      expect(active.className).toContain("bg-team-accent");
      expect(other.className).not.toContain("bg-team-accent");

      route.pathname = `/leagues/${LEAGUE_ID}`;
    });

    it("treats a nested page as still inside its section", () => {
      route.pathname = `/leagues/${LEAGUE_ID}/playoffs/live/series-9`;
      renderNav();
      expect(screen.getByRole("link", { name: /playoffs/i }).className).toContain("bg-team-accent");
      route.pathname = `/leagues/${LEAGUE_ID}`;
    });

    it("brings the glyph to full emphasis with its label", () => {
      route.pathname = `/leagues/${LEAGUE_ID}/schedule`;
      renderNav();
      expect(iconIn("Schedule")?.getAttribute("class")).toContain("opacity-100");
      route.pathname = `/leagues/${LEAGUE_ID}`;
    });

    it("holds the glyph secondary when its section is not active", () => {
      renderNav();
      expect(iconIn("Schedule")?.getAttribute("class")).toContain("opacity-60");
    });
  });

  describe("attention counts", () => {
    it("shows a pending count on an inactive section", () => {
      renderNav(REGULAR_SEASON, { rotation: 3 });
      expect(within(screen.getByRole("link", { name: /roster/i })).getByText("3")).toBeVisible();
    });

    it("drops the count once the user is already in that section", () => {
      route.pathname = `/leagues/${LEAGUE_ID}/rotation`;
      renderNav(REGULAR_SEASON, { rotation: 3 });
      expect(within(screen.getByRole("link", { name: /roster/i })).queryByText("3")).toBeNull();
      route.pathname = `/leagues/${LEAGUE_ID}`;
    });
  });
});
