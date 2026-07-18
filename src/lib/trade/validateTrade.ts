import { ApronLevel } from "../cap/apron";
import { getSeasonCapRules } from "../cap/constants";
import { canAggregateSalaries, isUnderCapSpace, maxIncomingSalaryCents } from "./salaryMatching";

export type TradeAssetInput =
  | {
      type: "PLAYER";
      fromTeamId: string;
      toTeamId: string;
      playerId: string;
      salaryCents: bigint;
      noTradeClause?: boolean;
    }
  | {
      type: "DRAFT_PICK";
      fromTeamId: string;
      toTeamId: string;
      pickId: string;
      season: number;
      round: 1 | 2;
    }
  | { type: "CASH"; fromTeamId: string; toTeamId: string; amountCents: bigint };

export interface TradeTeamCapState {
  apronLevel: ApronLevel;
  capSpaceCents: bigint;
  /** Future seasons (e.g. [2027, 2028, ...]) this team currently owns its own first-round pick for, before this trade. */
  ownedFutureFirstRoundPickSeasons: number[];
}

export interface TradeValidationInput {
  season: number;
  assets: TradeAssetInput[];
  teamCapStates: Record<string, TradeTeamCapState>;
}

export interface TradeViolation {
  rule:
    | "SALARY_MATCHING"
    | "NO_AGGREGATION_AT_SECOND_APRON"
    | "NO_TRADE_CLAUSE"
    | "STEPIEN_RULE"
    | "MISSING_TEAM_CAP_STATE"
    | "INVALID_STRUCTURE";
  teamId?: string;
  message: string;
}

export interface TradeValidationResult {
  isValid: boolean;
  violations: TradeViolation[];
}

function teamIdsInTrade(assets: TradeAssetInput[]): string[] {
  const ids = new Set<string>();
  for (const asset of assets) {
    ids.add(asset.fromTeamId);
    ids.add(asset.toTeamId);
  }
  return [...ids];
}

/**
 * Validates a proposed multi-team trade against a simplified model of the
 * 2023 CBA: salary matching bands (cap-space rooms vs. the tiered
 * over-the-cap formula), the second apron's no-aggregation rule, no-trade
 * clauses, and a "Stepien-lite" check against leaving a team without a
 * first-round pick in back-to-back future years.
 *
 * Operates entirely on plain input (no Prisma), so it's usable from a
 * server action, the trade-builder UI's live-preview endpoint, and the AI
 * assistant's tools without any of them needing DB access themselves.
 */
export function validateTrade(input: TradeValidationInput): TradeValidationResult {
  const violations: TradeViolation[] = [];
  const rules = getSeasonCapRules(input.season);
  const teamIds = teamIdsInTrade(input.assets);

  if (teamIds.length < 2) {
    violations.push({
      rule: "INVALID_STRUCTURE",
      message: "A trade must involve at least two teams.",
    });
    return { isValid: false, violations };
  }

  for (const teamId of teamIds) {
    if (!input.teamCapStates[teamId]) {
      violations.push({
        rule: "MISSING_TEAM_CAP_STATE",
        teamId,
        message: `No cap state provided for team ${teamId}.`,
      });
    }
  }
  if (violations.length > 0) return { isValid: false, violations };

  for (const asset of input.assets) {
    if (asset.type === "PLAYER" && asset.noTradeClause) {
      violations.push({
        rule: "NO_TRADE_CLAUSE",
        teamId: asset.fromTeamId,
        message: `Player ${asset.playerId} has a no-trade clause and has not consented to this deal.`,
      });
    }
  }

  for (const teamId of teamIds) {
    const capState = input.teamCapStates[teamId];
    const outgoingPlayers = input.assets.filter(
      (a): a is Extract<TradeAssetInput, { type: "PLAYER" }> =>
        a.type === "PLAYER" && a.fromTeamId === teamId,
    );
    const incomingPlayers = input.assets.filter(
      (a): a is Extract<TradeAssetInput, { type: "PLAYER" }> =>
        a.type === "PLAYER" && a.toTeamId === teamId,
    );

    const outgoingSalaryCents = outgoingPlayers.reduce((sum, p) => sum + p.salaryCents, 0n);
    const incomingSalaryCents = incomingPlayers.reduce((sum, p) => sum + p.salaryCents, 0n);

    if (incomingSalaryCents === 0n) continue;

    if (isUnderCapSpace(capState.apronLevel)) {
      const availableRoomCents = capState.capSpaceCents + outgoingSalaryCents;
      if (incomingSalaryCents > availableRoomCents) {
        violations.push({
          rule: "SALARY_MATCHING",
          teamId,
          message: `Team has cap space of ${availableRoomCents} cents (including outgoing salary) but is taking on ${incomingSalaryCents} cents.`,
        });
      }
      continue;
    }

    if (
      capState.apronLevel === ApronLevel.SECOND_APRON &&
      outgoingPlayers.length > 1 &&
      incomingPlayers.length < outgoingPlayers.length &&
      !canAggregateSalaries(capState.apronLevel)
    ) {
      violations.push({
        rule: "NO_AGGREGATION_AT_SECOND_APRON",
        teamId,
        message: "Second-apron teams cannot aggregate multiple outgoing salaries in a trade.",
      });
    }

    const maxIncoming = maxIncomingSalaryCents(outgoingSalaryCents, capState.apronLevel, rules);
    if (incomingSalaryCents > maxIncoming) {
      violations.push({
        rule: "SALARY_MATCHING",
        teamId,
        message: `Team can take back at most ${maxIncoming} cents against ${outgoingSalaryCents} cents outgoing, but this trade sends back ${incomingSalaryCents} cents.`,
      });
    }
  }

  for (const teamId of teamIds) {
    const capState = input.teamCapStates[teamId];
    const seasonsLosingPick = new Set(
      input.assets
        .filter(
          (a): a is Extract<TradeAssetInput, { type: "DRAFT_PICK" }> =>
            a.type === "DRAFT_PICK" && a.fromTeamId === teamId && a.round === 1,
        )
        .map((a) => a.season),
    );
    if (seasonsLosingPick.size === 0) continue;

    const remainingOwnedSeasons = new Set(
      capState.ownedFutureFirstRoundPickSeasons.filter((s) => !seasonsLosingPick.has(s)),
    );
    for (const season of seasonsLosingPick) {
      const hasNextYear = remainingOwnedSeasons.has(season + 1);
      const hasPriorYear = remainingOwnedSeasons.has(season - 1);
      if (!hasNextYear && !hasPriorYear) {
        violations.push({
          rule: "STEPIEN_RULE",
          teamId,
          message: `Trading the ${season} first-round pick would leave the team without a first-round pick in consecutive future years.`,
        });
      }
    }
  }

  return { isValid: violations.length === 0, violations };
}
