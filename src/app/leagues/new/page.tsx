import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createLeagueAction } from "@/lib/actions/league";
import { MAX_LEAGUES_PER_USER } from "@/lib/league/constants";
import { prisma } from "@/lib/prisma";
import {
  computeStrengthByTeam,
  computeStrengthPercentiles,
  computeJobOffer,
  JOB_SITUATION_LABEL,
  JOB_SITUATION_DESCRIPTION,
  type JobOffer,
} from "@/lib/gm/jobMarket";
import { computeCareerTitle, CAREER_TITLE_LABEL } from "@/lib/gm/careerRecord";
import { ScaleBar } from "@/components/dashboard/ScaleBar";

/**
 * League creation clones the full dataset into a new league: 30 teams, ~450
 * rostered players, their contracts, staff and draft picks.
 *
 * Without this the route runs on the platform default, which is short enough
 * that a cold start on a contended database can end the request mid-write.
 * These actions are not transactional end to end, so a timeout does not roll
 * back - it leaves partial state.
 *
 * 60s is the ceiling on Vercel Hobby. If a plan change raises it, raising
 * this is safe; lowering it is not, and the literal must stay statically
 * analyzable (Next.js reads it at build time, so no imported constant).
 */
export const maxDuration = 60;


// This page's correctness depends on request-time session + DB state (has
// this user already started a league? what's their reputation?) - it must
// never serve a cached RSC payload from an earlier visit.
export const dynamic = "force-dynamic";

interface JobTeam {
  id: string;
  city: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  conference: string;
  offer: JobOffer;
  alreadyRunning: boolean;
}

export default async function NewLeaguePage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const [activeLeagues, user, teams, players] = await Promise.all([
    prisma.league.findMany({
      where: { ownerId: session.user.id, endedAt: null },
      include: { teams: { include: { team: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { gmReputation: true },
    }),
    prisma.team.findMany({ orderBy: [{ conference: "asc" }, { city: "asc" }] }),
    prisma.player.findMany({
      where: { seedOverallRating: { not: null } },
      select: { currentTeamId: true, seedOverallRating: true },
    }),
  ]);

  const gmReputation = user?.gmReputation ?? 50;
  const title = computeCareerTitle(gmReputation);

  if (activeLeagues.length >= MAX_LEAGUES_PER_USER) {
    return (
      <main className="mx-auto max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-ink">The GM Job Market</h1>
        <p className="mt-4 text-ink-muted">
          You&apos;re running the maximum of {MAX_LEAGUES_PER_USER} active franchises. Manage them
          from{" "}
          <Link href="/leagues" className="text-team-accent hover:underline">
            My Leagues
          </Link>{" "}
          - or step down from one to free up a slot.
        </p>
      </main>
    );
  }

  const runningTeamIds = new Set(
    activeLeagues
      .map((l) => l.teams.find((lt) => lt.id === l.userControlledTeamId)?.teamId)
      .filter((id): id is string => Boolean(id)),
  );

  // Rank all 30 teams by real roster strength -> each team's job situation and
  // whether the user's reputation clears it. Identical derivation to the gate
  // in createLeagueAction, so what's shown is exactly what's enforced.
  const teamRatings = players
    .filter((p) => p.currentTeamId && p.seedOverallRating != null)
    .map((p) => ({ teamId: p.currentTeamId, overallRating: p.seedOverallRating! }));
  const percentiles = computeStrengthPercentiles(computeStrengthByTeam(teamRatings));

  const jobTeams: JobTeam[] = teams.map((team) => ({
    id: team.id,
    city: team.city,
    name: team.name,
    logoUrl: team.logoUrl,
    primaryColor: team.primaryColor,
    conference: team.conference,
    offer: computeJobOffer(percentiles.get(team.id) ?? 0.5, gmReputation),
    alreadyRunning: runningTeamIds.has(team.id),
  }));

  const east = jobTeams.filter((t) => t.conference === "EAST");
  const west = jobTeams.filter((t) => t.conference === "WEST");
  const offeredCount = jobTeams.filter((t) => t.offer.available).length;

  return (
    <main className="mx-auto max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">The GM Job Market</h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Teams hire based on your reputation. A rebuild will take a chance on anyone; a title
            contender only calls a proven executive. Where you take a job matters - a contender
            comes with a short leash, a rebuild with a patient owner.
          </p>
        </div>
        <div className="w-48 rounded-[2px] border border-rule bg-field px-5 py-3 text-right">
          <p className="text-xs tracking-wide text-ink-muted uppercase">Your Reputation</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{gmReputation}</p>
          <p className="text-xs font-semibold text-team-accent">{CAREER_TITLE_LABEL[title]}</p>
          <ScaleBar value={gmReputation} />
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-muted">
        {offeredCount} of {jobTeams.length} teams are willing to hire you right now. Starting a job
        clones the current NBA rosters into a fresh save; the other 29 teams are AI-controlled.
      </p>

      <JobConference title="Eastern Conference" teams={east} />
      <JobConference title="Western Conference" teams={west} />
    </main>
  );
}

const SITUATION_BADGE: Record<string, string> = {
  CONTENDER: "bg-caution/15 text-caution",
  PLAYOFF_CONTENDER: "bg-raised text-ink-muted",
  RETOOLING: "bg-raised text-ink-muted",
  REBUILD: "bg-ink-muted/20 text-ink-muted",
  BOTTOMING_OUT: "bg-ink-muted/20 text-ink-muted",
};

function JobConference({ title, teams }: { title: string; teams: JobTeam[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const { offer } = team;
          const card = (
            <div
              className={`h-full rounded-[2px] border bg-field p-5 text-left transition ${
                offer.available
                  ? "border-rule hover:border-team-accent/40"
                  : "border-rule opacity-70"
              }`}
              style={{ borderLeftColor: team.primaryColor, borderLeftWidth: "4px" }}
            >
              <div className="flex items-center gap-3">
                {team.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logoUrl} alt="" width={32} height={32} className="shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">
                    {team.city} {team.name}
                  </h3>
                  <span
                    className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${SITUATION_BADGE[offer.situation]}`}
                  >
                    {JOB_SITUATION_LABEL[offer.situation]}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                {JOB_SITUATION_DESCRIPTION[offer.situation]}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-ink-muted">{offer.leashLabel}</span>
                {offer.available ? (
                  <span className="font-semibold text-team-accent">Take the job →</span>
                ) : (
                  <span className="font-semibold text-negative">
                    Reach {offer.reputationRequired} rep
                  </span>
                )}
              </div>
              {team.alreadyRunning && (
                <p className="mt-2 text-xs text-ink-muted">You already run this team elsewhere</p>
              )}
            </div>
          );

          if (!offer.available) {
            return (
              <div
                key={team.id}
                className="cursor-not-allowed"
                title="Your reputation is too low for this job"
              >
                {card}
              </div>
            );
          }
          return (
            <form key={team.id} action={createLeagueAction} className="contents">
              <input type="hidden" name="teamId" value={team.id} />
              <button type="submit" className="w-full text-left">
                {card}
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}
