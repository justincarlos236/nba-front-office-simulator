import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import { estimateAge } from "@/lib/players/age";
import { Artifact, ArtifactHead } from "@/components/ui/Artifact";
import { Label } from "@/components/ui/primitives";
import { OfferDecision } from "@/components/trades/OfferDecision";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; tradeId: string }>;
}

/**
 * THE WIRE - Artifact. An unsolicited offer from another front office.
 *
 * Rendered as the document it is rather than as a form: this is a proposal
 * that arrived on your desk, and the decision is to sign it or not. The
 * two sides are shown at equal weight deliberately - the interface must not
 * tell the user whether the deal is good, because working that out *is* the
 * job. A recommendation here would answer the only question being asked.
 */
export default async function TradeOfferPage({ params }: PageProps) {
  const { id, tradeId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();
  if (!league.userControlledTeamId) notFound();

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      assets: {
        include: {
          leaguePlayer: {
            include: {
              player: true,
              contract: { include: { years: { where: { season: league.currentSeason } } } },
            },
          },
        },
      },
    },
  });
  if (!trade || trade.leagueId !== league.id) notFound();

  const userTeamId = league.userControlledTeamId;
  const proposingTeam = await prisma.leagueTeam.findUnique({
    where: { id: trade.proposedById },
    select: { team: { select: { city: true, name: true, abbreviation: true } } },
  });
  const proposerLabel = proposingTeam
    ? `${proposingTeam.team.city} ${proposingTeam.team.name}`
    : "A rival club";

  const incoming = trade.assets.filter((a) => a.toLeagueTeamId === userTeamId);
  const outgoing = trade.assets.filter((a) => a.fromLeagueTeamId === userTeamId);

  const describe = (asset: (typeof trade.assets)[number]) => {
    const lp = asset.leaguePlayer;
    if (!lp) return null;
    const salary = lp.contract?.years[0]?.salaryCents;
    return {
      key: asset.id,
      name: lp.player.fullName,
      position: lp.player.position,
      rating: lp.overallRating,
      age: estimateAge(lp.player.draftYear, league.currentSeason),
      salary: salary ? formatCentsCompact(salary) : null,
    };
  };

  const gets = incoming.map(describe).filter((x) => x !== null);
  const gives = outgoing.map(describe).filter((x) => x !== null);

  const open = trade.status === "PROPOSED";

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 pt-12 pb-24 sm:px-8">
      <Artifact tone="official">
        <ArtifactHead
          issuer={proposerLabel}
          title="Trade proposal"
          reference={`Ref ${trade.id.slice(-8).toUpperCase()}`}
        />

        <div className="px-6 py-6">
          {!open && (
            <p className="mb-6 border border-rule bg-field px-4 py-3 text-[15px] text-ink-muted">
              This offer is closed. It was {trade.status === "REJECTED" ? "declined" : "accepted"}.
            </p>
          )}

          <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
            The {proposerLabel} front office has proposed the following. Nothing moves unless you
            accept.
          </p>

          <div className="mt-8 grid gap-px bg-hairline sm:grid-cols-2">
            <section className="bg-raised p-5">
              <Label tone="ink">You receive</Label>
              <ul className="mt-4 space-y-4">
                {gets.map((p) => (
                  <li key={p.key}>
                    <p className="text-[clamp(1rem,1.6vw,1.125rem)] font-semibold text-ink">
                      {p.name}
                    </p>
                    <p className="mt-1 font-mono text-[13px] tabular-nums text-ink-muted">
                      {p.position} &middot; {p.rating} OVR &middot; age {p.age}
                      {p.salary ? ` · ${p.salary}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-raised p-5">
              <Label tone="ink">You give up</Label>
              <ul className="mt-4 space-y-4">
                {gives.map((p) => (
                  <li key={p.key}>
                    <p className="text-[clamp(1rem,1.6vw,1.125rem)] font-semibold text-ink">
                      {p.name}
                    </p>
                    <p className="mt-1 font-mono text-[13px] tabular-nums text-ink-muted">
                      {p.position} &middot; {p.rating} OVR &middot; age {p.age}
                      {p.salary ? ` · ${p.salary}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {open && <OfferDecision leagueId={league.id} tradeId={trade.id} />}
        </div>
      </Artifact>
    </main>
  );
}
