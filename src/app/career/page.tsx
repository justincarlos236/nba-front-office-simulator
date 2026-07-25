import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import { computeCareerTitle, CAREER_TITLE_LABEL } from "@/lib/gm/careerRecord";

export const dynamic = "force-dynamic";

function seasonWord(n: number): string {
  return n === 1 ? "season" : "seasons";
}

export default async function CareerPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const [user, records, activeLeagues] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { gmReputation: true },
    }),
    prisma.careerRecord.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.league.findMany({
      where: { ownerId: session.user.id, endedAt: null },
      select: { id: true, name: true, currentSeason: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const reputation = user?.gmReputation ?? 50;
  const title = computeCareerTitle(reputation);

  const totalChampionships = records.reduce((s, r) => s + r.championships, 0);
  const totalSeasons = records.reduce((s, r) => s + r.seasons, 0);
  const totalWins = records.reduce((s, r) => s + r.wins, 0);
  const totalLosses = records.reduce((s, r) => s + r.losses, 0);

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Your GM Career</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Reputation follows you across every franchise you run. Win, and doors open; flame out, and
        you&apos;ll be lucky to land a rebuild.
      </p>

      {/* Reputation + title */}
      <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide text-muted uppercase">GM Reputation</p>
            <p className="mt-1 text-4xl font-bold text-foreground tabular-nums">{reputation}</p>
          </div>
          <span className="shrink-0 rounded-full bg-accent/15 px-4 py-2 text-base font-bold text-accent">
            {CAREER_TITLE_LABEL[title]}
          </span>
        </div>
        {records.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs tracking-wide text-muted uppercase">Tenures</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{records.length}</p>
            </div>
            <div>
              <p className="text-xs tracking-wide text-muted uppercase">Seasons</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{totalSeasons}</p>
            </div>
            <div>
              <p className="text-xs tracking-wide text-muted uppercase">Career Record</p>
              <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">
                {totalWins}-{totalLosses}
              </p>
            </div>
            <div>
              <p className="text-xs tracking-wide text-muted uppercase">Championships</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{totalChampionships}</p>
            </div>
          </div>
        )}
      </div>

      {/* Active franchises */}
      {activeLeagues.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Active franchises</h2>
          <div className="mt-3 space-y-2">
            {activeLeagues.map((l) => (
              <Link
                key={l.id}
                href={`/leagues/${l.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition hover:bg-surface-2"
              >
                <span className="font-medium text-foreground">{l.name}</span>
                <span className="text-sm text-muted">
                  {l.currentSeason}-{(l.currentSeason + 1).toString().slice(-2)} season
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Past tenures */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Past tenures</h2>
        {records.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border p-8 text-center text-muted">
            No completed tenures yet. Your career record fills in when a franchise run ends - fired
            or retired.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {records.map((r) => {
              const games = r.wins + r.losses;
              const winPct = games > 0 ? ((r.wins / games) * 100).toFixed(1) : "0.0";
              return (
                <div key={r.id} className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">{r.teamLabel}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.endReason === "FIRED"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {r.endReason === "FIRED" ? "Fired" : "Retired"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {r.seasons} {seasonWord(r.seasons)} · {r.wins}-{r.losses} ({winPct}%) ·{" "}
                    {r.championships} {r.championships === 1 ? "title" : "titles"} · best:{" "}
                    {r.bestPlayoffFinish} · {formatFinanceCents(r.careerEarningsCents)} payroll
                    {r.reputationDelta !== 0 && (
                      <>
                        {" · "}
                        <span
                          className={r.reputationDelta > 0 ? "text-emerald-400" : "text-red-400"}
                        >
                          {r.reputationDelta > 0 ? "+" : ""}
                          {r.reputationDelta} rep
                        </span>
                      </>
                    )}
                  </p>
                  {r.notableTradeDescription && (
                    <p className="mt-2 text-xs text-muted">
                      Signature move: {r.notableTradeDescription}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-10">
        <Link
          href="/leagues/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
        >
          Start a new franchise
        </Link>
      </div>
    </main>
  );
}
