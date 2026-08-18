"use client";

import { isActionFailure } from "@/lib/errors/actionResult";
import { useMemo, useState, useTransition } from "react";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";
import { formatCentsCompact } from "@/lib/money";
import { executeTradeAction } from "@/lib/actions/trade";
import { ApronLevel } from "@/lib/cap/apron";
import { validateTrade, type TradeAssetInput } from "@/lib/trade/validateTrade";
import {
  describeTradeFeasibility,
  type TeamTradeFinancials,
} from "@/lib/trade/describeTradeFeasibility";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import { evaluateTradeOffer, type TradeAssetForEvaluation } from "@/lib/trade/evaluateTradeOffer";
import { describeTradeReasons } from "@/lib/trade/tradeReasonMessages";
import { suggestCounterOffer, type IdentifiedTradeAsset } from "@/lib/trade/suggestCounterOffer";
import { TEAM_IDENTITY_LABEL, type TeamIdentity } from "@/lib/gm/teamIdentity";
import { TEAM_NEED_LABEL, type TeamNeed } from "@/lib/gm/teamNeeds";
import { GM_PERSONALITY_LABEL, type GmPersonality } from "@/lib/gm/gmPersonality";
import { PlayerChip } from "@/components/players/PlayerChip";
import type { DepartmentLevel } from "@/generated/prisma/client";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { Stamp } from "@/components/ui/Stamp";
import { IconRuling } from "@/components/ui/icons";

interface RosterPlayerDTO {
  leaguePlayerId: string;
  fullName: string;
  photoUrl: string | null;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  overallRating: number;
  potentialRating: number;
  age: number;
  salaryCents: string;
  noTradeClause: boolean;
  injuryStatus: "HEALTHY" | "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
  careerGamesMissedToInjury: number;
  /** Finances as a Gameplay Pillar (Phase 2) - an active sponsorship deal's "star clause" names this player. Trading him away voids the deal with a real buyout cost - warned here, never blocked (cap/CBA legality is untouched). */
  hasSponsorshipClause: boolean;
}

interface DraftPickDTO {
  draftPickId: string;
  season: number;
  round: number;
  overallPickNumber: number | null;
  originalTeamCompetitivenessPercentile: number;
  /** Set when this isn't the team's own original pick (acquired via an earlier trade). */
  originalTeamLabel: string | null;
}

interface TeamSideDTO {
  leagueTeamId: string;
  name: string;
  primaryColor: string;
  apronLevel: string;
  capSpaceCents: string;
  players: RosterPlayerDTO[];
  picks: DraftPickDTO[];
  /** Future seasons this team currently owns its own round-1 pick for - the Stepien-rule input. */
  ownedFutureFirstRoundPickSeasons: number[];
  identity: TeamIdentity;
  needs: TeamNeed[];
  personality: GmPersonality;
  /** Full active roster ratings/ages - the untouchable-player check's input. */
  roster: { overallRating: number; age: number }[];
  /** Finances as a Gameplay Pillar (Phase 4) - only meaningful for myTeam (the user's own Analytics investment); undefined for theirTeam. HIGH/MAXIMUM reveals evaluateTradeOffer's precise fair-value score instead of just the ACCEPT/COUNTER/REJECT bucket. */
  analyticsLevel?: DepartmentLevel;
}

function pickLabel(pick: DraftPickDTO): string {
  const roundLabel = pick.round === 1 ? "1st" : "2nd";
  const base = `${pick.season} ${roundLabel} Round Pick`;
  return pick.originalTeamLabel ? `${base} (via ${pick.originalTeamLabel})` : base;
}

function toPlayerAsset(p: RosterPlayerDTO): TradeAssetForEvaluation {
  return {
    type: "PLAYER",
    overallRating: p.overallRating,
    potentialRating: p.potentialRating,
    age: p.age,
    position: p.position,
    currentSalaryCents: BigInt(p.salaryCents),
    injuryStatus: p.injuryStatus,
    careerGamesMissedToInjury: p.careerGamesMissedToInjury,
  };
}

function toPickAsset(p: DraftPickDTO): TradeAssetForEvaluation {
  return {
    type: "DRAFT_PICK",
    pickSeason: p.season,
    round: p.round as 1 | 2,
    overallPickNumber: p.overallPickNumber,
    originalTeamCompetitivenessPercentile: p.originalTeamCompetitivenessPercentile,
  };
}

function identifiedPlayer(p: RosterPlayerDTO): IdentifiedTradeAsset {
  return { id: p.leaguePlayerId, label: p.fullName, asset: toPlayerAsset(p) };
}

function identifiedPick(p: DraftPickDTO): IdentifiedTradeAsset {
  return { id: p.draftPickId, label: pickLabel(p), asset: toPickAsset(p) };
}

export function TradeBuilder({
  season,
  leagueId,
  myTeam,
  theirTeam,
  deadlinePassed = false,
}: {
  season: number;
  leagueId: string;
  myTeam: TeamSideDTO;
  theirTeam: TeamSideDTO;
  /** Whether the in-season trade deadline has passed - see `seasonCalendar.ts`. */
  deadlinePassed?: boolean;
}) {
  const [mySelected, setMySelected] = useState<Set<string>>(new Set());
  const [theirSelected, setTheirSelected] = useState<Set<string>>(new Set());
  const [mySelectedPicks, setMySelectedPicks] = useState<Set<string>>(new Set());
  const [theirSelectedPicks, setTheirSelectedPicks] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  // `unknown` because it holds either a returned failure or a caught Error;
  // `ErrorNotice` accepts both.
  const [submitError, setSubmitError] = useState<unknown>(null);

  const result = useMemo(() => {
    if (
      mySelected.size === 0 &&
      theirSelected.size === 0 &&
      mySelectedPicks.size === 0 &&
      theirSelectedPicks.size === 0
    )
      return null;

    const assets: TradeAssetInput[] = [
      ...myTeam.players
        .filter((p) => mySelected.has(p.leaguePlayerId))
        .map((p): TradeAssetInput => ({
          type: "PLAYER",
          fromTeamId: myTeam.leagueTeamId,
          toTeamId: theirTeam.leagueTeamId,
          playerId: p.leaguePlayerId,
          salaryCents: BigInt(p.salaryCents),
          noTradeClause: p.noTradeClause,
        })),
      ...theirTeam.players
        .filter((p) => theirSelected.has(p.leaguePlayerId))
        .map((p): TradeAssetInput => ({
          type: "PLAYER",
          fromTeamId: theirTeam.leagueTeamId,
          toTeamId: myTeam.leagueTeamId,
          playerId: p.leaguePlayerId,
          salaryCents: BigInt(p.salaryCents),
          noTradeClause: p.noTradeClause,
        })),
      ...myTeam.picks
        .filter((p) => mySelectedPicks.has(p.draftPickId))
        .map((p): TradeAssetInput => ({
          type: "DRAFT_PICK",
          fromTeamId: myTeam.leagueTeamId,
          toTeamId: theirTeam.leagueTeamId,
          pickId: p.draftPickId,
          season: p.season,
          round: p.round as 1 | 2,
        })),
      ...theirTeam.picks
        .filter((p) => theirSelectedPicks.has(p.draftPickId))
        .map((p): TradeAssetInput => ({
          type: "DRAFT_PICK",
          fromTeamId: theirTeam.leagueTeamId,
          toTeamId: myTeam.leagueTeamId,
          pickId: p.draftPickId,
          season: p.season,
          round: p.round as 1 | 2,
        })),
    ];

    return validateTrade({
      season,
      assets,
      // The live preview has to know about the deadline too. Without it the
      // client-side check reported "Valid - likely to accept" on a trade the
      // server would then refuse, which is worse than saying nothing: it
      // actively tells the user the deal is fine.
      isAfterTradeDeadline: deadlinePassed,
      teamCapStates: {
        [myTeam.leagueTeamId]: {
          // ApronLevel is a string enum, so the plain string that crossed
          // the server/client boundary is already a valid member value.
          apronLevel: myTeam.apronLevel as ApronLevel,
          capSpaceCents: BigInt(myTeam.capSpaceCents),
          ownedFutureFirstRoundPickSeasons: myTeam.ownedFutureFirstRoundPickSeasons,
        },
        [theirTeam.leagueTeamId]: {
          apronLevel: theirTeam.apronLevel as ApronLevel,
          capSpaceCents: BigInt(theirTeam.capSpaceCents),
          ownedFutureFirstRoundPickSeasons: theirTeam.ownedFutureFirstRoundPickSeasons,
        },
      },
    });
  }, [
    mySelected,
    theirSelected,
    mySelectedPicks,
    theirSelectedPicks,
    myTeam,
    theirTeam,
    season,
    deadlinePassed,
  ]);

  const feasibility = useMemo(() => {
    if (result === null) return null;

    const mySalaryOut = myTeam.players
      .filter((p) => mySelected.has(p.leaguePlayerId))
      .reduce((sum, p) => sum + BigInt(p.salaryCents), 0n);
    const theirSalaryOut = theirTeam.players
      .filter((p) => theirSelected.has(p.leaguePlayerId))
      .reduce((sum, p) => sum + BigInt(p.salaryCents), 0n);

    const teams: TeamTradeFinancials[] = [
      {
        teamLabel: myTeam.name,
        apronLevel: myTeam.apronLevel as ApronLevel,
        capSpaceCents: BigInt(myTeam.capSpaceCents),
        outgoingSalaryCents: mySalaryOut,
        incomingSalaryCents: theirSalaryOut,
      },
      {
        teamLabel: theirTeam.name,
        apronLevel: theirTeam.apronLevel as ApronLevel,
        capSpaceCents: BigInt(theirTeam.capSpaceCents),
        outgoingSalaryCents: theirSalaryOut,
        incomingSalaryCents: mySalaryOut,
      },
    ];

    return describeTradeFeasibility(result, teams, season);
  }, [result, mySelected, theirSelected, myTeam, theirTeam, season]);

  // Trade-AI preview (Phase 11c) - the same evaluation executeTradeAction
  // runs server-side as the authoritative gate, previewed here purely for
  // UX (like validateTrade's own live preview). Only meaningful once the
  // deal is at least financially legal.
  const aiPreview = useMemo(() => {
    if (result === null || !result.isValid) return null;
    if (mySelected.size === 0 && mySelectedPicks.size === 0) return null;

    return evaluateTradeOffer({
      respondingTeam: {
        identity: theirTeam.identity,
        needs: theirTeam.needs,
        personality: theirTeam.personality,
        roster: theirTeam.roster,
      },
      currentSeason: season,
      incoming: [
        ...myTeam.players.filter((p) => mySelected.has(p.leaguePlayerId)).map(toPlayerAsset),
        ...myTeam.picks.filter((p) => mySelectedPicks.has(p.draftPickId)).map(toPickAsset),
      ],
      outgoing: [
        ...theirTeam.players.filter((p) => theirSelected.has(p.leaguePlayerId)).map(toPlayerAsset),
        ...theirTeam.picks.filter((p) => theirSelectedPicks.has(p.draftPickId)).map(toPickAsset),
      ],
    });
  }, [
    result,
    mySelected,
    theirSelected,
    mySelectedPicks,
    theirSelectedPicks,
    myTeam,
    theirTeam,
    season,
  ]);

  // Counter-offer suggestion (Phase 11d) - only worth computing once we
  // already know the deal isn't an accept as proposed.
  const counterSuggestion = useMemo(() => {
    if (!aiPreview || aiPreview.decision === "ACCEPT") return null;

    return suggestCounterOffer({
      respondingTeam: {
        identity: theirTeam.identity,
        needs: theirTeam.needs,
        personality: theirTeam.personality,
        roster: theirTeam.roster,
      },
      currentSeason: season,
      incoming: [
        ...myTeam.players.filter((p) => mySelected.has(p.leaguePlayerId)).map(identifiedPlayer),
        ...myTeam.picks.filter((p) => mySelectedPicks.has(p.draftPickId)).map(identifiedPick),
      ],
      outgoing: [
        ...theirTeam.players
          .filter((p) => theirSelected.has(p.leaguePlayerId))
          .map(identifiedPlayer),
        ...theirTeam.picks.filter((p) => theirSelectedPicks.has(p.draftPickId)).map(identifiedPick),
      ],
      availableToAdd: [
        ...myTeam.players.filter((p) => !mySelected.has(p.leaguePlayerId)).map(identifiedPlayer),
        ...myTeam.picks.filter((p) => !mySelectedPicks.has(p.draftPickId)).map(identifiedPick),
      ],
    });
  }, [
    aiPreview,
    mySelected,
    theirSelected,
    mySelectedPicks,
    theirSelectedPicks,
    myTeam,
    theirTeam,
    season,
  ]);

  const canSubmit = result !== null && result.isValid && !isPending;

  function applyCounterSuggestion() {
    if (!counterSuggestion || counterSuggestion.action === "NONE") return;
    const id = counterSuggestion.asset.id;
    if (counterSuggestion.action === "ADD_ASSET") {
      if (myTeam.players.some((p) => p.leaguePlayerId === id)) {
        toggle(mySelected, setMySelected, id);
      } else {
        toggle(mySelectedPicks, setMySelectedPicks, id);
      }
    } else {
      toggle(theirSelected, setTheirSelected, id);
    }
  }

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  }

  // Finances as a Gameplay Pillar (Phase 2) - a non-blocking warning, never
  // a hard stop (cap/CBA legality is the only thing validateTrade governs).
  const clausePlayersSelected = myTeam.players.filter(
    (p) => mySelected.has(p.leaguePlayerId) && p.hasSponsorshipClause,
  );

  /** Plain-language sides, so the confirmation names what actually moves. */
  function describeSide(
    players: RosterPlayerDTO[],
    selectedPlayers: Set<string>,
    picks: DraftPickDTO[],
    selectedPicks: Set<string>,
  ): string {
    const names = [
      ...players.filter((p) => selectedPlayers.has(p.leaguePlayerId)).map((p) => p.fullName),
      ...picks.filter((p) => selectedPicks.has(p.draftPickId)).map(pickLabel),
    ];
    if (names.length === 0) return "nothing";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  const outgoingLabel = describeSide(myTeam.players, mySelected, myTeam.picks, mySelectedPicks);
  const incomingLabel = describeSide(
    theirTeam.players,
    theirSelected,
    theirTeam.picks,
    theirSelectedPicks,
  );

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      try {
        const result = await executeTradeAction({
          leagueId,
          fromTeamId: myTeam.leagueTeamId,
          toTeamId: theirTeam.leagueTeamId,
          myPlayerIds: [...mySelected],
          theirPlayerIds: [...theirSelected],
          myPickIds: [...mySelectedPicks],
          theirPickIds: [...theirSelectedPicks],
        });
        if (isActionFailure(result)) setSubmitError(result.error);
      } catch (error) {
        // redirect() throws internally on success - only real errors land here
        if (error instanceof Error && error.message !== "NEXT_REDIRECT") {
          setSubmitError(error);
        }
      }
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TeamIdentityCard team={myTeam} />
        <TeamIdentityCard team={theirTeam} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RosterColumn
          title={`Send from ${myTeam.name}`}
          leagueId={leagueId}
          players={myTeam.players}
          teamPrimaryColor={myTeam.primaryColor}
          selected={mySelected}
          onToggle={(id) => toggle(mySelected, setMySelected, id)}
          picks={myTeam.picks}
          selectedPicks={mySelectedPicks}
          onTogglePick={(id) => toggle(mySelectedPicks, setMySelectedPicks, id)}
        />
        <RosterColumn
          title={`Receive from ${theirTeam.name}`}
          leagueId={leagueId}
          players={theirTeam.players}
          teamPrimaryColor={theirTeam.primaryColor}
          selected={theirSelected}
          onToggle={(id) => toggle(theirSelected, setTheirSelected, id)}
          picks={theirTeam.picks}
          selectedPicks={theirSelectedPicks}
          onTogglePick={(id) => toggle(theirSelectedPicks, setTheirSelectedPicks, id)}
        />
      </div>

      {clausePlayersSelected.length > 0 && (
        <div className="mt-6 rounded-[2px] border border-caution/30 bg-caution/5 p-3 text-sm">
          <span className="text-ink">
            {clausePlayersSelected.map((p) => p.fullName).join(", ")}{" "}
            {clausePlayersSelected.length === 1 ? "holds" : "hold"} an active sponsorship clause.
          </span>{" "}
          <span className="text-ink-muted">
            Trading {clausePlayersSelected.length === 1 ? "him" : "them"} away voids the deal and
            triggers a real buyout penalty - the trade itself is still allowed.
          </span>
        </div>
      )}

      {/* THE WIRE - Workbench. The verdict is the whole point of this surface,
          so it sticks to the bottom of the viewport rather than scrolling away
          below two long roster columns while the user is still selecting. */}
      <div
        className={`sticky bottom-0 z-10 mt-6 relative border-t-2 bg-field p-6 ${
          feasibility && !feasibility.isValid ? "border-t-signal-red" : "border-t-team-accent"
        }`}
      >
        {/* Inside the panel, not straddling its top edge - anchored above it
            the stamp cut through the draft-pick lists behind. */}
        {feasibility && !feasibility.isValid && (
          <Stamp tone="signal" rotate={-8} className="absolute top-5 right-6">
            Denied
          </Stamp>
        )}
        {feasibility === null ? (
          <p className="text-[15px] text-ink-muted">
            Select at least one player or pick on either side.
          </p>
        ) : (
          <div>
            {/* An illegal offer is the league office refusing it, and that is
                the register it should read in - the live check is where a
                block is actually seen, since Execute is disabled before the
                server ever gets the chance to reject it. */}
            <p
              className={`flex items-start gap-2 text-[clamp(1rem,1.6vw,1.25rem)] leading-snug font-semibold ${
                feasibility.isValid ? "text-ink" : "text-signal-red"
              }`}
            >
              {!feasibility.isValid && <IconRuling className="mt-1 shrink-0" />}
              {feasibility.isValid ? feasibility.headline : "The league office would reject this"}
            </p>
            {feasibility.detail && (
              <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">
                {feasibility.detail}
              </p>
            )}
          </div>
        )}

        {aiPreview && (
          <div className="mt-4 border-t border-hairline pt-4">
            <p
              className={`text-[15px] font-semibold ${
                aiPreview.decision === "ACCEPT"
                  ? "text-positive"
                  : aiPreview.decision === "COUNTER"
                    ? "text-caution"
                    : "text-negative"
              }`}
            >
              {theirTeam.name}:{" "}
              {aiPreview.decision === "ACCEPT"
                ? "Likely to accept"
                : aiPreview.decision === "COUNTER"
                  ? "Wants a better offer"
                  : "Likely to reject"}
            </p>
            {describeTradeReasons(
              aiPreview.reasons,
              `${theirTeam.leagueTeamId}-${aiPreview.decision}-${aiPreview.reasons.join(",")}-${Math.round(aiPreview.score * 1000)}`,
            ).map((message, i) => (
              <p key={i} className="mt-1 text-sm text-ink-muted">
                {message}
              </p>
            ))}

            {/* Finances as a Gameplay Pillar (Phase 4) - Analytics reveals
                the precise fair-value number instead of just the bucket
                above. Real information, not better luck. */}
            {(myTeam.analyticsLevel === "HIGH" || myTeam.analyticsLevel === "MAXIMUM") &&
              Number.isFinite(aiPreview.score) && (
                <p className="mt-1 text-xs text-caution">
                  Analytics read: {Math.round(aiPreview.score * 100)}% of fair value
                </p>
              )}

            {counterSuggestion && counterSuggestion.action !== "NONE" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[2px] border border-rule bg-raised p-3">
                <p className="text-sm text-ink">
                  {counterSuggestion.action === "ADD_ASSET" ? (
                    <>
                      Try sweetening the deal with{" "}
                      <span className="font-semibold">{counterSuggestion.asset.label}</span>.
                    </>
                  ) : (
                    <>
                      They probably won&apos;t give up{" "}
                      <span className="font-semibold">{counterSuggestion.asset.label}</span> in this
                      deal - try building around someone else.
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={applyCounterSuggestion}
                  className="rounded-[2px] border border-team-accent/40 px-3 py-1 text-xs font-semibold text-team-accent transition hover:bg-team-accent/10"
                >
                  {counterSuggestion.action === "ADD_ASSET" ? "Add it" : "Remove it"}
                </button>
              </div>
            )}

            <HowDoesThisWork
              topic="cpu-trade-decisions"
              openInNewTab
              className="mt-2 block w-fit text-xs text-ink-muted underline hover:text-ink"
            >
              How do CPU trade decisions work?
            </HowDoesThisWork>
          </div>
        )}

        <HowDoesThisWork
          topic="trades"
          openInNewTab
          className="mt-2 block w-fit text-xs text-ink-muted underline hover:text-ink"
        />

        {submitError != null && (
          <div className="mt-3">
            <ErrorNotice error={submitError} />
          </div>
        )}

        {/* Executing a trade is permanent and reshapes the save. It was the
            only irreversible action in the product with no confirmation, while
            deleting a league - recoverable by starting another - had a
            deliberate two-step guard. */}
        <div className="mt-4">
          <ConfirmAction
            label={isPending ? "Executing trade..." : "Execute trade"}
            confirmLabel="Execute the trade"
            pendingLabel="Executing trade..."
            pending={isPending}
            disabled={!canSubmit}
            question={`Send ${outgoingLabel} to ${theirTeam.name} for ${incomingLabel}?`}
            consequence="Players and picks change hands immediately, contracts move with them, and the deal is recorded permanently. This cannot be undone."
            onConfirm={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}

function TeamIdentityCard({ team }: { team: TeamSideDTO }) {
  return (
    <div className="rounded-[2px] border border-rule bg-field p-4">
      <p className="font-semibold text-ink">{team.name}</p>
      <p className="mt-1 text-sm text-ink-muted">
        <span className="text-ink">{TEAM_IDENTITY_LABEL[team.identity]}</span>
        {" · "}
        {GM_PERSONALITY_LABEL[team.personality]} front office
      </p>
      {team.needs.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          Needs: {team.needs.map((n) => TEAM_NEED_LABEL[n]).join(", ")}
        </p>
      )}
    </div>
  );
}

function RosterColumn({
  title,
  leagueId,
  players,
  teamPrimaryColor,
  selected,
  onToggle,
  picks,
  selectedPicks,
  onTogglePick,
}: {
  title: string;
  leagueId: string;
  players: RosterPlayerDTO[];
  teamPrimaryColor: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  picks: DraftPickDTO[];
  selectedPicks: Set<string>;
  onTogglePick: (id: string) => void;
}) {
  return (
    <div className="rounded-[2px] border border-rule bg-field p-4">
      <h2 className="mb-3 font-semibold text-ink">{title}</h2>
      <div className="max-h-[480px] space-y-1 overflow-y-auto">
        {players.map((p) => (
          // A plain row (not <label>) so the PlayerChip (a nested <button>)
          // can stop its click from also toggling selection - clicking the
          // avatar/name opens the profile, clicking anywhere else on the row
          // (or the checkbox itself) toggles this player for the trade.
          <div
            key={p.leaguePlayerId}
            onClick={() => onToggle(p.leaguePlayerId)}
            className="flex cursor-pointer items-center justify-between rounded-[2px] px-3 py-2 text-sm hover:bg-raised"
          >
            <span className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected.has(p.leaguePlayerId)}
                onChange={() => onToggle(p.leaguePlayerId)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${p.fullName} for this trade`}
                className="accent-[var(--team-accent)]"
              />
              <span onClick={(e) => e.stopPropagation()}>
                <PlayerChip
                  identity={{ kind: "league", leagueId, leaguePlayerId: p.leaguePlayerId }}
                  fullName={p.fullName}
                  photoUrl={p.photoUrl}
                  teamPrimaryColor={teamPrimaryColor}
                  size="sm"
                />
              </span>
              <span className="text-xs text-ink-muted">{p.position}</span>
              <span className="font-mono text-xs text-team-accent">{p.overallRating}</span>
              <span className="text-xs text-ink-muted">
                {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(p.overallRating)]}
              </span>
            </span>
            <span className="font-mono text-xs text-ink-muted">
              {formatCentsCompact(BigInt(p.salaryCents))}
            </span>
          </div>
        ))}
      </div>

      {picks.length > 0 && (
        <div className="mt-3 border-t border-rule pt-3">
          <h3 className="mb-2 text-xs tracking-wide text-ink-muted uppercase">Draft picks</h3>
          <div className="max-h-[240px] space-y-1 overflow-y-auto">
            {picks.map((p) => (
              <label
                key={p.draftPickId}
                className="flex cursor-pointer items-center gap-3 rounded-[2px] px-3 py-2 text-sm hover:bg-raised"
              >
                <input
                  type="checkbox"
                  checked={selectedPicks.has(p.draftPickId)}
                  onChange={() => onTogglePick(p.draftPickId)}
                  className="accent-[var(--team-accent)]"
                />
                <span className="text-ink">{pickLabel(p)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
