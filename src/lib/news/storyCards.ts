/**
 * AROUND THE LEAGUE - the four to six things worth knowing beneath the lead.
 *
 * Deliberately *not* a fixed set of slots that always need filling. A card is
 * emitted only when the league actually produced one, so a quiet stretch
 * shows three cards rather than six, two of them empty. Categories that
 * always demand content are how a news page starts lying.
 *
 * Two sources, on purpose:
 *   - **Event cards** (deal, performance, injury, your franchise) come from
 *     the highest-importance recent story of that kind. Importance is already
 *     derived from real context at write time - trade player tier, injury
 *     duration, points scored - so this reads the engine's judgement rather
 *     than inventing one.
 *   - **State cards** (hot, cold) come from `LeagueTeam.currentStreak`, not
 *     from streak *news*. A team is hot because of its record, not because a
 *     row was written.
 *
 * Anything already used as the lead is excluded, so the same headline never
 * appears twice on one screen.
 */

import type { LeaguePulse } from "./leaguePulse";
import { recordLabel, streakLabel } from "./leaguePulse";
import type { RankableStory } from "./storyRank";

export interface StoryCard {
  key: string;
  /** Short kicker: what kind of story this is. */
  kicker: string;
  /** The headline itself. */
  headline: string;
  /** Optional supporting line - a record, a return date. */
  detail: string | null;
  /** Drives the icon and the type tag. */
  type: string;
  /** True when this concerns the franchise the user runs. */
  isMine: boolean;
  /** Set when the card can link to an executed trade's receipt. */
  tradeId?: string | null;
}

const IMPORTANCE_RANK: Record<string, number> = {
  BREAKING: 4,
  MAJOR: 3,
  STANDARD: 2,
  MINOR: 1,
};

/** The best story of a given kind, or null when nothing qualifies. */
function bestOf(
  stories: RankableStory[],
  types: string[],
  minImportance: number,
  excludeIds: Set<string>,
): RankableStory | null {
  let best: RankableStory | null = null;
  let bestRank = -1;
  for (const s of stories) {
    if (excludeIds.has(s.id) || !types.includes(s.type)) continue;
    const rank = IMPORTANCE_RANK[s.importance] ?? 0;
    if (rank < minImportance) continue;
    // Ties go to the earlier row, which is the more recent one.
    if (rank > bestRank) {
      best = s;
      bestRank = rank;
    }
  }
  return best;
}

export function buildStoryCards(args: {
  stories: RankableStory[];
  pulse: LeaguePulse;
  userTeamId: string | null;
  excludeIds?: Set<string>;
  max?: number;
}): StoryCard[] {
  const { stories, pulse, userTeamId, excludeIds = new Set(), max = 6 } = args;
  const cards: StoryCard[] = [];
  const used = new Set(excludeIds);

  const isMine = (s: RankableStory) => Boolean(userTeamId && s.teamIds.includes(userTeamId));

  const push = (story: RankableStory | null, kicker: string) => {
    if (!story) return;
    used.add(story.id);
    cards.push({
      key: story.id,
      kicker,
      headline: story.description,
      detail: null,
      type: story.type,
      isMine: isMine(story),
      tradeId: story.tradeId ?? null,
    });
  };

  // STANDARD is the floor for a deal because a trade is a roster change worth
  // knowing about even when nobody in it is a star.
  push(bestOf(stories, ["TRADE"], IMPORTANCE_RANK.STANDARD, used), "Deal");
  // Performances and injuries have to be genuinely big - the feed is full of
  // ordinary ones and a card is expensive real estate.
  push(bestOf(stories, ["GAME_MILESTONE"], IMPORTANCE_RANK.MAJOR, used), "Performance");
  push(bestOf(stories, ["INJURY"], IMPORTANCE_RANK.MAJOR, used), "Injury");
  push(
    bestOf(stories, ["SIGNING", "RETIREMENT", "AWARD"], IMPORTANCE_RANK.MAJOR, used),
    "Around the league",
  );

  if (pulse.hottest) {
    cards.push({
      key: `hot-${pulse.hottest.leagueTeamId}`,
      kicker: "Hot",
      headline: `${pulse.hottest.label} are rolling`,
      detail: `${streakLabel(pulse.hottest.currentStreak)} · ${recordLabel(pulse.hottest)}`,
      type: "WIN_STREAK",
      isMine: pulse.hottest.leagueTeamId === userTeamId,
    });
  }
  if (pulse.coldest) {
    cards.push({
      key: `cold-${pulse.coldest.leagueTeamId}`,
      kicker: "Cold",
      headline: `${pulse.coldest.label} are sliding`,
      detail: `${streakLabel(pulse.coldest.currentStreak)} · ${recordLabel(pulse.coldest)}`,
      type: "WIN_STREAK",
      isMine: pulse.coldest.leagueTeamId === userTeamId,
    });
  }

  // The user's own franchise earns a card only if something of theirs is not
  // already on this screen.
  if (userTeamId) {
    const mine = stories.find(
      (s) =>
        !used.has(s.id) &&
        s.teamIds.includes(userTeamId) &&
        (IMPORTANCE_RANK[s.importance] ?? 0) >= IMPORTANCE_RANK.STANDARD,
    );
    push(mine ?? null, "Your franchise");
  }

  return cards.slice(0, max);
}
