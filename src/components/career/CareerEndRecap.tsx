import Link from "next/link";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import { CAREER_TITLE_LABEL, type CareerTitle } from "@/lib/gm/careerRecord";

export interface CareerEndRecapProps {
  endReason: "FIRED" | "RETIRED";
  teamLabel: string;
  seasons: number;
  wins: number;
  losses: number;
  championships: number;
  playoffAppearances: number;
  bestPlayoffFinish: string;
  careerEarningsCents: bigint | number;
  notableTradeDescription: string | null;
  finalOwnerConfidence: number;
  reputationDelta: number;
  newReputation: number;
  title: CareerTitle;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function CareerEndRecap(props: CareerEndRecapProps) {
  const fired = props.endReason === "FIRED";
  const games = props.wins + props.losses;
  const winPct = games > 0 ? props.wins / games : 0;
  const deltaText = `${props.reputationDelta >= 0 ? "+" : ""}${props.reputationDelta}`;

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
      <div
        className={`rounded-2xl border p-8 text-center ${
          fired ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/40 bg-emerald-500/5"
        }`}
      >
        <p
          className={`text-xs font-semibold tracking-[0.2em] uppercase ${
            fired ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {fired ? "The End of the Road" : "A Tenure Concludes"}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
          {fired ? "You've Been Fired" : "You Retired as GM"}
        </h1>
        <p className="mt-3 text-muted">
          {fired
            ? `Ownership has run out of patience. Your run with the ${props.teamLabel} is over.`
            : `You walked away from the ${props.teamLabel} on your own terms.`}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Seasons" value={String(props.seasons)} />
        <Stat
          label="Record"
          value={`${props.wins}-${props.losses} (${(winPct * 100).toFixed(1)}%)`}
        />
        <Stat label="Championships" value={String(props.championships)} />
        <Stat label="Playoff Trips" value={String(props.playoffAppearances)} />
        <Stat label="Best Finish" value={props.bestPlayoffFinish} />
        <Stat label="Career Payroll" value={formatFinanceCents(props.careerEarningsCents)} />
      </div>

      {props.notableTradeDescription && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Signature Move</p>
          <p className="mt-1 text-sm text-foreground">{props.notableTradeDescription}</p>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide text-muted uppercase">GM Reputation</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {props.newReputation}
              <span
                className={`ml-2 text-sm font-semibold ${props.reputationDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {deltaText}
              </span>
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent/15 px-3 py-1.5 text-sm font-bold text-accent">
            {CAREER_TITLE_LABEL[props.title]}
          </span>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/career"
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
        >
          View your GM career
        </Link>
        <Link
          href="/leagues/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Take a new job
        </Link>
      </div>
    </main>
  );
}
