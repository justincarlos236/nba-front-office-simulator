"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCentsCompact } from "@/lib/money";
import { executeTradeAction } from "@/lib/actions/trade";
import { ApronLevel } from "@/lib/cap/apron";
import { validateTrade, type TradeAssetInput } from "@/lib/trade/validateTrade";

interface RosterPlayerDTO {
  leaguePlayerId: string;
  fullName: string;
  position: string;
  overallRating: number;
  salaryCents: string;
  noTradeClause: boolean;
}

interface TeamSideDTO {
  leagueTeamId: string;
  name: string;
  apronLevel: string;
  capSpaceCents: string;
  players: RosterPlayerDTO[];
}

export function TradeBuilder({
  season,
  leagueId,
  myTeam,
  theirTeam,
}: {
  season: number;
  leagueId: string;
  myTeam: TeamSideDTO;
  theirTeam: TeamSideDTO;
}) {
  const [mySelected, setMySelected] = useState<Set<string>>(new Set());
  const [theirSelected, setTheirSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const result = useMemo(() => {
    if (mySelected.size === 0 && theirSelected.size === 0) return null;

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
    ];

    return validateTrade({
      season,
      assets,
      teamCapStates: {
        [myTeam.leagueTeamId]: {
          // ApronLevel is a string enum, so the plain string that crossed
          // the server/client boundary is already a valid member value.
          apronLevel: myTeam.apronLevel as ApronLevel,
          capSpaceCents: BigInt(myTeam.capSpaceCents),
          ownedFutureFirstRoundPickSeasons: [],
        },
        [theirTeam.leagueTeamId]: {
          apronLevel: theirTeam.apronLevel as ApronLevel,
          capSpaceCents: BigInt(theirTeam.capSpaceCents),
          ownedFutureFirstRoundPickSeasons: [],
        },
      },
    });
  }, [mySelected, theirSelected, myTeam, theirTeam, season]);

  const canSubmit = result !== null && result.isValid && !isPending;

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  }

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      try {
        await executeTradeAction({
          leagueId,
          fromTeamId: myTeam.leagueTeamId,
          toTeamId: theirTeam.leagueTeamId,
          myPlayerIds: [...mySelected],
          theirPlayerIds: [...theirSelected],
        });
      } catch (error) {
        // redirect() throws internally on success - only real errors land here
        if (error instanceof Error && error.message !== "NEXT_REDIRECT") {
          setSubmitError(error.message);
        }
      }
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RosterColumn
          title={`Send from ${myTeam.name}`}
          players={myTeam.players}
          selected={mySelected}
          onToggle={(id) => toggle(mySelected, setMySelected, id)}
        />
        <RosterColumn
          title={`Receive from ${theirTeam.name}`}
          players={theirTeam.players}
          selected={theirSelected}
          onToggle={(id) => toggle(theirSelected, setTheirSelected, id)}
        />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-6">
        {result === null ? (
          <p className="text-sm text-muted">Select at least one player on either side.</p>
        ) : result.isValid ? (
          <p className="text-sm font-medium text-accent">Trade is legal under current cap rules.</p>
        ) : (
          <div>
            <p className="text-sm font-medium text-red-400">This trade isn&apos;t legal:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
              {result.violations.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          </div>
        )}

        {submitError && <p className="mt-3 text-sm text-red-400">{submitError}</p>}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="mt-4 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Executing trade..." : "Execute trade"}
        </button>
      </div>
    </div>
  );
}

function RosterColumn({
  title,
  players,
  selected,
  onToggle,
}: {
  title: string;
  players: RosterPlayerDTO[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 font-semibold text-foreground">{title}</h2>
      <div className="max-h-[480px] space-y-1 overflow-y-auto">
        {players.map((p) => (
          <label
            key={p.leaguePlayerId}
            className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
          >
            <span className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected.has(p.leaguePlayerId)}
                onChange={() => onToggle(p.leaguePlayerId)}
                className="accent-orange-500"
              />
              <span className="text-foreground">{p.fullName}</span>
              <span className="text-xs text-muted">{p.position}</span>
              <span className="font-mono text-xs text-accent">{p.overallRating}</span>
            </span>
            <span className="font-mono text-xs text-muted">
              {formatCentsCompact(BigInt(p.salaryCents))}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
