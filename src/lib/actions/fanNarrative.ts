import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  buildIconDepartureFalloutOpening,
  shouldCloseIconDepartureFallout,
  buildIconDepartureFalloutResolution,
  trajectoryNarrativeConditionHolds,
  buildRebuildProgressWatchOpening,
  buildRebuildProgressWatchResolution,
  buildChampionshipWindowWatchOpening,
  buildChampionshipWindowWatchResolution,
  FAN_NARRATIVE_MAX_OPEN_PER_TEAM,
} from "@/lib/fans/fanNarrative";
import type { FanMandateKind } from "@/lib/fans/fanMandate";

/**
 * Fans Page Redesign (Phase 5) - the thin DB shell around
 * src/lib/fans/fanNarrative.ts's pure open/close logic.
 */

// ---------------------------------------------------------------------------
// ICON_DEPARTURE_FALLOUT - event-driven, opened immediately in trade.ts
// ---------------------------------------------------------------------------

export interface IconDepartureNarrativeInput {
  leagueId: string;
  leagueTeamId: string;
  season: number;
  dayIndex: number;
  playerName: string;
  leaguePlayerId: string;
  isTrade: boolean;
  /** fanHappiness right after the departure's own hit has been applied - the recovery baseline. */
  fanHappinessAfterDeparture: number;
}

/**
 * Opens an ICON_DEPARTURE_FALLOUT narrative if the team isn't already at
 * the volume cap and doesn't already have one OPEN for this exact departing
 * player. Takes a Prisma client (a `tx` from the caller's own interactive
 * transaction, or the top-level `prisma` client) so this always runs as
 * part of the same transaction the trade itself commits in - a narrative
 * that survived a rolled-back trade would be actively misleading, the same
 * reasoning recordFanSentimentManyTx already established in Phase 1.
 */
export async function openIconDepartureFalloutIfEligible(
  tx: Pick<typeof prisma, "fanNarrative">,
  input: IconDepartureNarrativeInput,
): Promise<void> {
  const [openCount, existing] = await Promise.all([
    tx.fanNarrative.count({
      where: { leagueTeamId: input.leagueTeamId, status: "OPEN" },
    }),
    tx.fanNarrative.findFirst({
      where: {
        leagueTeamId: input.leagueTeamId,
        kind: "ICON_DEPARTURE_FALLOUT",
        leaguePlayerId: input.leaguePlayerId,
        status: "OPEN",
      },
      select: { id: true },
    }),
  ]);
  if (existing || openCount >= FAN_NARRATIVE_MAX_OPEN_PER_TEAM) return;

  const { headline, body } = buildIconDepartureFalloutOpening(input.playerName, input.isTrade);
  await tx.fanNarrative.create({
    data: {
      leagueId: input.leagueId,
      leagueTeamId: input.leagueTeamId,
      kind: "ICON_DEPARTURE_FALLOUT",
      headline,
      body,
      openedSeason: input.season,
      openedDayIndex: input.dayIndex,
      leaguePlayerId: input.leaguePlayerId,
      openedFanHappiness: input.fanHappinessAfterDeparture,
    },
  });
}

// ---------------------------------------------------------------------------
// All narrative lifecycle progression at the season boundary - closing
// event-driven narratives whose condition no longer holds, plus opening/
// updating/closing the trajectory kinds. Called once per team from
// advanceSeasonAction, alongside recomputeFanMandates.
// ---------------------------------------------------------------------------

export interface TeamNarrativeContext {
  leagueTeamId: string;
  season: number;
  /** This season's fanHappiness. */
  fanHappiness: number;
  primaryMandate: FanMandateKind;
  /** Whether the trajectory mandate that opened CHAMPIONSHIP_WINDOW_WATCH just resulted in a title this season. */
  wonChampionshipThisSeason: boolean;
}

export async function progressFanNarratives(
  leagueId: string,
  teams: TeamNarrativeContext[],
): Promise<void> {
  if (teams.length === 0) return;
  const teamIds = teams.map((t) => t.leagueTeamId);

  const openNarratives = await prisma.fanNarrative.findMany({
    where: { leagueTeamId: { in: teamIds }, status: "OPEN" },
    include: { leaguePlayer: { include: { player: true } } },
  });
  const openByTeam = new Map<string, typeof openNarratives>();
  for (const n of openNarratives) {
    const list = openByTeam.get(n.leagueTeamId) ?? [];
    list.push(n);
    openByTeam.set(n.leagueTeamId, list);
  }

  const closeOps: Prisma.PrismaPromise<unknown>[] = [];
  const createOps: Prisma.PrismaPromise<unknown>[] = [];

  for (const team of teams) {
    const openForTeam = openByTeam.get(team.leagueTeamId) ?? [];
    let openCountAfterCloses = openForTeam.length;

    // --- Close ICON_DEPARTURE_FALLOUT narratives whose condition no longer holds ---
    for (const n of openForTeam.filter((n) => n.kind === "ICON_DEPARTURE_FALLOUT")) {
      const seasonsOpen = team.season - n.openedSeason;
      // Genuine recovery: how far current happiness has climbed back above
      // where it stood right when this narrative opened (stored on the row
      // itself at open time - see openedFanHappiness on FanNarrative).
      const happinessRecoveryDelta =
        team.fanHappiness - (n.openedFanHappiness ?? team.fanHappiness);
      const check = { seasonsOpen, happinessRecoveryDelta };
      if (shouldCloseIconDepartureFallout(check)) {
        const playerName = n.leaguePlayer?.player.fullName ?? "that player";
        closeOps.push(
          prisma.fanNarrative.update({
            where: { id: n.id },
            data: {
              status: "RESOLVED",
              resolvedSeason: team.season,
              resolutionBeat: buildIconDepartureFalloutResolution(playerName, check),
            },
          }),
        );
        openCountAfterCloses -= 1;
      }
    }

    // --- Trajectory narratives: open/close based on the current mandate ---
    for (const kind of ["REBUILD_PROGRESS_WATCH", "CHAMPIONSHIP_WINDOW_WATCH"] as const) {
      const existing = openForTeam.find((n) => n.kind === kind);
      const conditionHolds = trajectoryNarrativeConditionHolds(kind, team.primaryMandate);

      if (existing && !conditionHolds) {
        const resolutionBeat =
          kind === "REBUILD_PROGRESS_WATCH"
            ? buildRebuildProgressWatchResolution(
                team.primaryMandate !== "GIVE_US_A_REASON_TO_CARE",
              )
            : buildChampionshipWindowWatchResolution(team.wonChampionshipThisSeason);
        closeOps.push(
          prisma.fanNarrative.update({
            where: { id: existing.id },
            data: { status: "RESOLVED", resolvedSeason: team.season, resolutionBeat },
          }),
        );
        openCountAfterCloses -= 1;
      } else if (
        !existing &&
        conditionHolds &&
        openCountAfterCloses < FAN_NARRATIVE_MAX_OPEN_PER_TEAM
      ) {
        const { headline, body } =
          kind === "REBUILD_PROGRESS_WATCH"
            ? buildRebuildProgressWatchOpening()
            : buildChampionshipWindowWatchOpening();
        createOps.push(
          prisma.fanNarrative.create({
            data: {
              leagueId,
              leagueTeamId: team.leagueTeamId,
              kind,
              headline,
              body,
              openedSeason: team.season,
            },
          }),
        );
        openCountAfterCloses += 1;
      }
    }
  }

  await prisma.$transaction([...closeOps, ...createOps]);
}
