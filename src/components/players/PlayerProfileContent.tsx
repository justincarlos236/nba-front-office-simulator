"use client";

import { useState } from "react";
import { formatCentsCompact } from "@/lib/money";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import type { PlayerProfileData } from "@/lib/players/profileData";

const AWARD_LABELS: Record<string, string> = {
  MVP: "Most Valuable Player",
  ROOKIE_OF_THE_YEAR: "Rookie of the Year",
  MOST_IMPROVED_PLAYER: "Most Improved Player",
};

const INJURY_LABELS: Record<string, string> = {
  HEALTHY: "Healthy",
  DAY_TO_DAY: "Day-to-Day",
  OUT: "Out",
  SEASON_ENDING: "Season-Ending",
};

const TABS = ["Overview", "Ratings", "Stats", "Contract", "Career", "Awards", "Injuries"] as const;
type Tab = (typeof TABS)[number];

function heightLabel(heightInches: number | null): string | null {
  if (!heightInches) return null;
  return `${Math.floor(heightInches / 12)}'${heightInches % 12}"`;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-foreground">{value}</p>
    </div>
  );
}

/** Given a `PlayerProfileData` (from either identity - league or reference), renders the tabbed profile body. */
export function PlayerProfileContent({ data }: { data: PlayerProfileData }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { identity, leagueContext, contract, seasonStats, valuation, awards, gameLog } = data;

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              tab === t
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatBox label="Position" value={identity.position} />
              <StatBox label="Height" value={heightLabel(identity.heightInches) ?? "-"} />
              <StatBox
                label="Weight"
                value={identity.weightLbs ? `${identity.weightLbs} lbs` : "-"}
              />
              <StatBox label="Age" value={String(identity.age)} />
              <StatBox label="Experience" value={`${identity.experience} yrs`} />
              <StatBox
                label="Drafted"
                value={identity.draftYear ? String(identity.draftYear) : "Undrafted"}
              />
            </div>
            {leagueContext && (
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs tracking-wide text-muted uppercase">At a glance</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-lg text-accent">
                    {leagueContext.overallRating}
                  </span>
                  <span className="text-sm text-muted">
                    {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(leagueContext.overallRating)]}
                  </span>
                  <span className="text-sm text-muted">
                    {INJURY_LABELS[leagueContext.injuryStatus]}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "Ratings" && (
          <div className="space-y-4">
            {leagueContext ? (
              <div className="grid grid-cols-2 gap-3">
                <StatBox label="Overall rating" value={String(leagueContext.overallRating)} />
                <StatBox label="Potential" value={String(leagueContext.potentialRating)} />
                <StatBox
                  label="Value tier"
                  value={PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(leagueContext.overallRating)]}
                />
                {valuation && (
                  <StatBox
                    label="Est. market value"
                    value={formatCentsCompact(BigInt(valuation.estimatedMarketValueCents))}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">
                No in-league rating for this player outside an active save.
                {valuation &&
                  ` Live-computed performance score: ${valuation.performanceScore.toFixed(1)}.`}
              </p>
            )}
            <p className="text-xs text-muted">
              This sim tracks a single composite overall/potential rating, not individual
              sub-attributes.
            </p>
          </div>
        )}

        {tab === "Stats" && (
          <div className="space-y-3">
            {gameLog && (
              <div className="space-y-3">
                <p className="text-xs tracking-wide text-muted uppercase">This league, live</p>
                {gameLog.currentSeasonAverage ? (
                  <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
                    <p className="text-xs tracking-wide text-muted uppercase">
                      {gameLog.currentSeasonAverage.season}-
                      {(gameLog.currentSeasonAverage.season + 1).toString().slice(-2)} ·{" "}
                      {gameLog.currentSeasonAverage.gamesPlayed} GP (simulated)
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
                      <StatBox
                        label="PPG"
                        value={gameLog.currentSeasonAverage.pointsPerGame.toFixed(1)}
                      />
                      <StatBox
                        label="RPG"
                        value={gameLog.currentSeasonAverage.reboundsPerGame.toFixed(1)}
                      />
                      <StatBox
                        label="APG"
                        value={gameLog.currentSeasonAverage.assistsPerGame.toFixed(1)}
                      />
                      <StatBox
                        label="FG%"
                        value={
                          gameLog.currentSeasonAverage.fgPct
                            ? `${(gameLog.currentSeasonAverage.fgPct * 100).toFixed(1)}%`
                            : "-"
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    No games simulated yet this season - stats will appear here once this league
                    plays some games.
                  </p>
                )}

                {gameLog.careerHighs && (
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <p className="text-xs tracking-wide text-muted uppercase">
                      Career highs (this league)
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5">
                      <StatBox label="PTS" value={String(gameLog.careerHighs.points)} />
                      <StatBox label="REB" value={String(gameLog.careerHighs.rebounds)} />
                      <StatBox label="AST" value={String(gameLog.careerHighs.assists)} />
                      <StatBox label="STL" value={String(gameLog.careerHighs.steals)} />
                      <StatBox label="BLK" value={String(gameLog.careerHighs.blocks)} />
                    </div>
                  </div>
                )}

                {gameLog.recentGames.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs tracking-wide text-muted uppercase">Recent games</p>
                    {gameLog.recentGames.map((g) => (
                      <div
                        key={g.gameId}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2 text-muted">
                          vs {g.opponent}
                          {g.isTripleDouble && (
                            <span className="rounded-full border border-accent/40 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                              Triple-double
                            </span>
                          )}
                          {g.scoringMilestone && (
                            <span className="rounded-full border border-accent/40 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                              {g.scoringMilestone}-point game
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-foreground">
                          {g.points} PTS · {g.rebounds} REB · {g.assists} AST
                        </span>
                        <span className="font-mono text-xs text-muted">{g.minutesPlayed} MIN</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="border-t border-border pt-3 text-xs tracking-wide text-muted uppercase">
                  Real-world baseline (2023-24)
                </p>
              </div>
            )}
            {seasonStats.length === 0 && <p className="text-sm text-muted">No stats on record.</p>}
            {seasonStats.map((s) => (
              <div
                key={`${s.season}-${s.team}`}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <p className="text-xs tracking-wide text-muted uppercase">
                  {s.season}-{(s.season + 1).toString().slice(-2)} · {s.team}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  <StatBox label="PPG" value={s.pointsPerGame.toFixed(1)} />
                  <StatBox label="RPG" value={s.reboundsPerGame.toFixed(1)} />
                  <StatBox label="APG" value={s.assistsPerGame.toFixed(1)} />
                  <StatBox
                    label="TS%"
                    value={s.trueShootingPct ? `${(s.trueShootingPct * 100).toFixed(1)}%` : "-"}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "Contract" && (
          <div className="space-y-3">
            {contract ? (
              <>
                <p className="text-sm text-muted">
                  Signed {contract.signedSeason} ·{" "}
                  {contract.noTradeClause ? "Has a no-trade clause" : "No no-trade clause"}
                </p>
                <div className="space-y-2">
                  {contract.years.map((y) => (
                    <div
                      key={y.season}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm"
                    >
                      <span className="text-foreground">
                        {y.season}-{(y.season + 1).toString().slice(-2)}
                      </span>
                      <span className="font-mono text-foreground">
                        {formatCentsCompact(BigInt(y.salaryCents))}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">Not on a contract in this context.</p>
            )}
          </div>
        )}

        {tab === "Career" && (
          <div className="grid grid-cols-2 gap-3">
            <StatBox label="Age" value={String(identity.age)} />
            <StatBox label="Experience" value={`${identity.experience} years`} />
            <StatBox
              label="Draft"
              value={
                identity.draftYear
                  ? `${identity.draftYear}, Round ${identity.draftRound ?? "-"}, Pick ${identity.draftPick ?? "-"}`
                  : "Undrafted"
              }
            />
            {leagueContext?.retiredSeason != null && (
              <StatBox label="Retired" value={`After ${leagueContext.retiredSeason}`} />
            )}
          </div>
        )}

        {tab === "Awards" && (
          <div className="space-y-2">
            {awards.length === 0 && <p className="text-sm text-muted">No awards yet.</p>}
            {awards.map((a, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <span className="text-foreground">{AWARD_LABELS[a.category] ?? a.category}</span>
                <span className="ml-2 text-muted">{a.season}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "Injuries" && (
          <div className="space-y-3">
            {leagueContext ? (
              <>
                <StatBox label="Current status" value={INJURY_LABELS[leagueContext.injuryStatus]} />
                <StatBox
                  label="Career games missed to injury"
                  value={String(leagueContext.careerGamesMissedToInjury)}
                />
              </>
            ) : (
              <p className="text-sm text-muted">
                No injury history tracked outside an active league.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
