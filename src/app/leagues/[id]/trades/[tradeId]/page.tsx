import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCentsCompact } from "@/lib/money";
import {
  parseTradeCapSnapshot,
  APRON_LEVEL_LABEL,
  crossedApronBoundary,
  type TradeCapSnapshotSide,
} from "@/lib/trade/capSnapshot";
import { resolveTeamAccent } from "@/lib/design/teamAccent";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { ButtonLink, Label, Status } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * THE WIRE - Broadcast on execution, Record on revisit. See DESIGN.md.
 *
 * The register scales with what actually moved. A superstar changing teams
 * produces a `MAJOR` headline row (see `importanceForRating`), and that is the
 * same signal used here to decide whether the document frame breaks: a
 * blockbuster splits the screen between two franchise colours at display
 * scale, a rotation-player swap is filed as a ruled transaction record. Drama
 * that fires for every deal stops being drama.
 */

interface PageProps {
  params: Promise<{ id: string; tradeId: string }>;
  /** `?just=1` is set by the execute redirect, so the page can greet a fresh
   *  execution without guessing from wall-clock time on a revisit. */
  searchParams: Promise<{ just?: string }>;
}

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
}

/** Signed delta, in the reader's terms: "+$4.2M" / "-$1.1M" / "no change". */
function deltaLabel(beforeCents: string, afterCents: string): string {
  const delta = BigInt(afterCents) - BigInt(beforeCents);
  if (delta === 0n) return "no change";
  return `${delta > 0n ? "+" : "-"}${formatCentsCompact(delta < 0n ? -delta : delta)}`;
}

function CapMoveRow({
  label,
  before,
  after,
  delta,
}: {
  label: string;
  before: string;
  after: string;
  delta?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline py-2.5 last:border-b-0">
      <span className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
        {label}
      </span>
      <span className="flex items-baseline gap-2 font-mono text-[15px] tabular-nums">
        <span className="text-ink-muted">{before}</span>
        <span aria-hidden="true" className="text-rule">
          &rarr;
        </span>
        <span className="font-medium text-ink">{after}</span>
        {delta && <span className="text-[11px] text-ink-muted">({delta})</span>}
      </span>
    </div>
  );
}

interface OutcomeAsset {
  id: string;
  leaguePlayer: {
    overallRating: number;
    player: { fullName: string; photoUrl: string | null };
  } | null;
  draftPick: { season: number; round: number } | null;
}

function AssetList({
  assets,
  emptyLabel,
  big,
}: {
  assets: OutcomeAsset[];
  emptyLabel: string;
  /** Broadcast register renders names at headline scale. */
  big?: boolean;
}) {
  if (assets.length === 0) {
    return <p className="mt-3 text-[15px] text-ink-muted">{emptyLabel}</p>;
  }
  return (
    <ul className="mt-4 space-y-3">
      {assets.map((asset) => (
        <li key={asset.id} className="flex items-center gap-3">
          {asset.leaguePlayer ? (
            <>
              <PlayerAvatar
                photoUrl={asset.leaguePlayer.player.photoUrl}
                fullName={asset.leaguePlayer.player.fullName}
                size={big ? "md" : "sm"}
              />
              <span
                className={
                  big
                    ? "text-[clamp(1.25rem,2.2vw,1.75rem)] leading-tight font-semibold tracking-[-0.01em] text-ink"
                    : "text-[15px] font-semibold text-ink"
                }
              >
                {asset.leaguePlayer.player.fullName}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                {asset.leaguePlayer.overallRating}
              </span>
            </>
          ) : asset.draftPick ? (
            <span
              className={
                big
                  ? "text-[clamp(1.125rem,1.8vw,1.375rem)] leading-tight font-semibold"
                  : "text-[15px] text-ink"
              }
            >
              {asset.draftPick.season} {asset.draftPick.round === 1 ? "1st" : "2nd"} round pick
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CapConsequence({ side, teamLabel }: { side: TradeCapSnapshotSide; teamLabel: string }) {
  return (
    <div className="border-t border-rule bg-field p-6">
      <Label>{teamLabel}</Label>
      <div className="mt-4">
        <CapMoveRow
          label="Total salary"
          before={formatCentsCompact(BigInt(side.totalSalaryBeforeCents))}
          after={formatCentsCompact(BigInt(side.totalSalaryAfterCents))}
          delta={deltaLabel(side.totalSalaryBeforeCents, side.totalSalaryAfterCents)}
        />
        <CapMoveRow
          label="Cap space"
          before={formatCentsCompact(BigInt(side.capSpaceBeforeCents))}
          after={formatCentsCompact(BigInt(side.capSpaceAfterCents))}
        />
        <CapMoveRow
          label="Standing"
          before={APRON_LEVEL_LABEL[side.apronLevelBefore] ?? side.apronLevelBefore}
          after={APRON_LEVEL_LABEL[side.apronLevelAfter] ?? side.apronLevelAfter}
        />
        <CapMoveRow
          label="Roster"
          before={`${side.rosterCountBefore}`}
          after={`${side.rosterCountAfter}`}
        />
      </div>
    </div>
  );
}

export default async function TradeOutcomePage({ params, searchParams }: PageProps) {
  const { id, tradeId } = await params;
  const { just } = await searchParams;
  const isFresh = just === "1";
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  // 404 rather than 403 for a non-owner, matching the data-access convention
  // used everywhere else: never reveal that a league exists.
  if (!league || league.ownerId !== session.user.id) notFound();

  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, leagueId: league.id, status: "EXECUTED" },
    include: {
      assets: {
        include: {
          leaguePlayer: { include: { player: true } },
          draftPick: true,
        },
      },
      transactions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!trade) notFound();

  const teamById = new Map(league.teams.map((lt) => [lt.id, lt]));
  const fromTeam = teamById.get(trade.proposedById);
  const otherTeamId = trade.assets.find((a) => a.fromLeagueTeamId !== trade.proposedById)
    ?.fromLeagueTeamId;
  const toTeam = otherTeamId ? teamById.get(otherTeamId) : undefined;

  const label = (lt: typeof fromTeam) => (lt ? `${lt.team.city} ${lt.team.name}` : "Unknown team");

  const outgoing = trade.assets.filter((a) => a.fromLeagueTeamId === trade.proposedById);
  const incoming = trade.assets.filter((a) => a.fromLeagueTeamId !== trade.proposedById);

  const snapshot = parseTradeCapSnapshot(trade.capSnapshot);
  const snapshotSeason = snapshot?.season ?? league.currentSeason;

  // The headline row the execute action already wrote carries the deal's own
  // importance. A superstar moving is MAJOR or BREAKING; that is the frame
  // break. Everything else is filed.
  const headline = trade.transactions.find((t) => t.type === "TRADE");
  const isBlockbuster =
    isFresh && (headline?.importance === "MAJOR" || headline?.importance === "BREAKING");

  const reactions = trade.transactions.filter((t) => t.type !== "TRADE");

  const fromAccent = resolveTeamAccent(
    fromTeam?.team.primaryColor,
    fromTeam?.team.secondaryColor,
  );
  const toAccent = resolveTeamAccent(toTeam?.team.primaryColor, toTeam?.team.secondaryColor);

  return (
    <main className="flex-1 pb-24">
      {/* THE DEAL. Both franchises share the frame as equals - the one place
          in the product where two team accents are permitted at once. */}
      {isBlockbuster ? (
        <header className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-8 sm:p-12" style={{ backgroundColor: fromAccent.hex }}>
            <p
              className="text-[11px] font-semibold tracking-[0.09em] uppercase"
              style={{ color: fromAccent.inkHex, opacity: 0.75 }}
            >
              {label(fromTeam)} receive
            </p>
            <div style={{ color: fromAccent.inkHex }}>
              <AssetList assets={incoming} emptyLabel="Nothing incoming." big />
            </div>
          </div>
          <div className="p-8 sm:p-12" style={{ backgroundColor: toAccent.hex }}>
            <p
              className="text-[11px] font-semibold tracking-[0.09em] uppercase"
              style={{ color: toAccent.inkHex, opacity: 0.75 }}
            >
              {label(toTeam)} receive
            </p>
            <div style={{ color: toAccent.inkHex }}>
              <AssetList assets={outgoing} emptyLabel="Nothing outgoing." big />
            </div>
          </div>
        </header>
      ) : null}

      <div className="mx-auto max-w-225 px-6 sm:px-8">
        <div className={isBlockbuster ? "pt-12" : "pt-16"}>
          <Label tone="accent">
            {isFresh ? "Trade completed" : `${seasonLabel(snapshotSeason)} transaction`}
          </Label>
          <h1 className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
            {label(fromTeam)} and {label(toTeam)} have agreed to a deal
          </h1>
          <p className="mt-3 text-[15px] text-ink-muted">
            Executed {trade.resolvedAt?.toLocaleDateString() ?? "this season"}. This record is
            permanent.
          </p>
        </div>

        {/* Filed register: the deal as a document, when it did not break the frame. */}
        {!isBlockbuster && (
          <section className="mt-10 grid grid-cols-1 gap-px md:grid-cols-2">
            <div className="border-t border-rule bg-field p-6">
              <Label>{label(fromTeam)} receive</Label>
              <AssetList assets={incoming} emptyLabel="Nothing incoming." />
            </div>
            <div className="border-t border-rule bg-field p-6">
              <Label>{label(toTeam)} receive</Label>
              <AssetList assets={outgoing} emptyLabel="Nothing outgoing." />
            </div>
          </section>
        )}

        {/* THE REACTION. The emotional payload the execute action computes and
            the previous version threw away on redirect. */}
        {reactions.length > 0 && (
          <section className="mt-16">
            <div className="border-b border-rule-strong pb-3">
              <Label tone="ink">The reaction</Label>
            </div>
            <ul className="mt-4">
              {reactions.map((row) => (
                <li
                  key={row.id}
                  className="flex items-baseline gap-4 border-b border-hairline py-3 last:border-b-0"
                >
                  <span className="shrink-0">
                    <Status tone={row.importance === "BREAKING" ? "signal" : "neutral"}>
                      {row.importance === "BREAKING" ? "Breaking" : "Wire"}
                    </Status>
                  </span>
                  <p className="text-[15px] leading-relaxed text-ink">{row.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* THE CONSEQUENCE. Frozen evidence, never recomputed from current state. */}
        <section className="mt-16">
          <div className="border-b border-rule-strong pb-3">
            <Label tone="ink">What it cost</Label>
          </div>
          {snapshot ? (
            <>
              {crossedApronBoundary(snapshot.from) && (
                <p className="mt-6 border-l-2 border-l-team-accent bg-field px-5 py-4 text-[clamp(1rem,1.8vw,1.25rem)] leading-snug text-ink">
                  This deal moved {label(fromTeam)} from{" "}
                  <span className="text-ink-muted">
                    {APRON_LEVEL_LABEL[snapshot.from.apronLevelBefore] ??
                      snapshot.from.apronLevelBefore}
                  </span>{" "}
                  to{" "}
                  <span className="font-semibold text-team-accent">
                    {APRON_LEVEL_LABEL[snapshot.from.apronLevelAfter] ??
                      snapshot.from.apronLevelAfter}
                  </span>
                  .
                </p>
              )}
              <p className="mt-6 max-w-[70ch] text-[15px] leading-relaxed text-ink-muted">
                Cap position at the moment of the trade, under {seasonLabel(snapshot.season)} rules.
                These figures are a permanent record of this deal, not your current cap sheet.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-px md:grid-cols-2">
                <CapConsequence side={snapshot.from} teamLabel={label(fromTeam)} />
                <CapConsequence side={snapshot.to} teamLabel={label(toTeam)} />
              </div>
            </>
          ) : (
            <p className="mt-6 max-w-[70ch] text-[15px] leading-relaxed text-ink-muted">
              No cap record was captured for this trade. Trades executed before cap snapshots were
              introduced don&apos;t have one, and recomputing it now would show today&apos;s cap
              rather than the cap at the time of the deal.
            </p>
          )}
        </section>

        <div className="mt-16 flex flex-wrap items-center gap-3">
          <ButtonLink href={`/leagues/${league.id}`}>Back to your franchise</ButtonLink>
          <ButtonLink variant="secondary" href={`/leagues/${league.id}/trades/new`}>
            Propose another trade
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
