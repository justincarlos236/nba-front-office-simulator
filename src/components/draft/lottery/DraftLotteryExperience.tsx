"use client";

import { useState } from "react";
import { runDraftLotteryAction, type DraftLotteryResult } from "@/lib/actions/draftLottery";
import { LotteryOverview } from "./LotteryOverview";
import { LotteryReveal } from "./LotteryReveal";
import { LotteryResults } from "./LotteryResults";
import type { LotteryOverviewTeamDisplay } from "./types";

type Phase = "overview" | "reveal" | "results";

export function DraftLotteryExperience({
  leagueId,
  overviewTeams,
  headlineProspect,
  initialResult,
}: {
  leagueId: string;
  /** Only meaningful when the lottery hasn't run yet - the pre-draw overview data. */
  overviewTeams: LotteryOverviewTeamDisplay[];
  headlineProspect: { fullName: string; position: string; potentialRating: number } | null;
  /** Non-null when the lottery already ran this season - skips straight to results. */
  initialResult: DraftLotteryResult | null;
}) {
  const [phase, setPhase] = useState<Phase>(initialResult ? "results" : "overview");
  const [result, setResult] = useState<DraftLotteryResult | null>(initialResult);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleStart() {
    setIsStarting(true);
    setErrorMessage(null);
    try {
      const drawn = await runDraftLotteryAction(leagueId);
      setResult(drawn);
      setPhase("reveal");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsStarting(false);
    }
  }

  if (phase === "overview") {
    return (
      <LotteryOverview
        teams={overviewTeams}
        headlineProspect={headlineProspect}
        onStart={handleStart}
        isStarting={isStarting}
        errorMessage={errorMessage}
      />
    );
  }

  if (phase === "reveal" && result) {
    return <LotteryReveal result={result} onComplete={() => setPhase("results")} />;
  }

  if (result) {
    return (
      <LotteryResults
        leagueId={leagueId}
        results={result.results}
        headlineProspect={result.headlineProspect}
      />
    );
  }

  return null;
}
