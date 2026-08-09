import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ContractSheet } from "@/components/contracts/ContractSheet";
import { ButtonLink, Label } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * THE WIRE - Artifact. Where a signing resolves.
 *
 * Signing a free agent redirected to the dashboard, which is the same
 * "computes the consequence and steps over it" failure the trade outcome had.
 * A contract is a document; this is where it gets filed, and it stays
 * reachable afterwards rather than being a flash of confirmation.
 */

interface PageProps {
  params: Promise<{ id: string; contractId: string }>;
  /** `?just=1` marks a fresh signing rather than a revisit. */
  searchParams: Promise<{ just?: string }>;
}

export default async function ContractPage({ params, searchParams }: PageProps) {
  const { id, contractId } = await params;
  const { just } = await searchParams;
  const isFresh = just === "1";

  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  // 404 rather than 403 for a non-owner, matching the convention everywhere
  // else: never reveal that a league exists.
  if (!league || league.ownerId !== session.user.id) notFound();

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, leagueTeam: { leagueId: league.id } },
    include: {
      leaguePlayer: { include: { player: true } },
      leagueTeam: { include: { team: true } },
      years: { orderBy: { season: "asc" } },
    },
  });
  if (!contract) notFound();

  const user = await prisma.user.findUnique({
    where: { id: league.ownerId },
    select: { name: true },
  });

  return (
    <main className="mx-auto max-w-225 flex-1 px-4 py-10 sm:px-6 sm:py-16">
      {/* The document carries the player's name; repeating it as a page
          heading 200px above the artifact was the same name twice. */}
      <div className="border-b border-rule-strong pb-6">
        <Label tone="accent">{isFresh ? "Contract executed" : "On file"}</Label>
        <p className="mt-3 max-w-[55ch] text-[clamp(1.125rem,2vw,1.5rem)] leading-snug text-ink">
          {isFresh
            ? "The deal is done and the paperwork is filed."
            : "A contract on the franchise's books."}
        </p>
      </div>

      <ContractSheet
        className="mt-8"
        playerName={contract.leaguePlayer.player.fullName}
        teamLabel={`${contract.leagueTeam.team.city} ${contract.leagueTeam.team.name}`}
        gmName={user?.name ?? "General Manager"}
        signedSeason={contract.signedSeason}
        startSeason={contract.startSeason}
        endSeason={contract.endSeason}
        noTradeClause={contract.noTradeClause}
        signedUsing={contract.signedUsing}
        years={contract.years.map((y) => ({ season: y.season, salaryCents: y.salaryCents }))}
      />

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <ButtonLink href={`/leagues/${league.id}`}>Back to your franchise</ButtonLink>
        <ButtonLink variant="secondary" href={`/leagues/${league.id}/free-agents`}>
          Back to free agents
        </ButtonLink>
      </div>
    </main>
  );
}
