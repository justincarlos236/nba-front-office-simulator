"use client";

import { useState, useTransition } from "react";
import { waivePlayerAction } from "@/lib/actions/waivers";
import { isActionFailure } from "@/lib/errors/actionResult";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

/**
 * Releasing a player, with the bill shown before the decision.
 *
 * Kept off the rotation rows on purpose. That board is drag-and-drop and
 * already carries eight controls per player; an irreversible action sitting
 * beside a drag handle is a misclick waiting to happen. It also reads better
 * as its own decision: releasing is not a rotation change, it is paying to end
 * a contract.
 *
 * The cost is computed on the server from the guaranteed money actually owed
 * and rendered here before the user commits, because the number *is* the
 * decision. A confirmation that says "this cannot be undone" without saying
 * what it costs is asking someone to agree to an unknown.
 */

export interface ReleasableTeamPlayer {
  leaguePlayerId: string;
  fullName: string;
  position: string;
  overallRating: number;
  /** Formatted total guaranteed money that would become dead money. */
  deadMoneyLabel: string;
  /** Seasons after this one that would carry a charge. */
  futureSeasons: number;
  /** True when nothing is owed, so the release is free. */
  free: boolean;
}

export function ReleasePlayerPanel({
  leagueId,
  players,
}: {
  leagueId: string;
  players: ReleasableTeamPlayer[];
}) {
  const [selectedId, setSelectedId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  const selected = players.find((p) => p.leaguePlayerId === selectedId);

  function handleRelease() {
    if (!selected) return;
    setError(null);
    setDone(null);
    startTransition(async () => {
      const result = await waivePlayerAction({ leagueId, leaguePlayerId: selected.leaguePlayerId });
      if (isActionFailure(result)) {
        setError(result.error);
        return;
      }
      setDone(`${selected.fullName} has been released.`);
      setSelectedId("");
    });
  }

  return (
    <section className="mt-10 border-t border-rule pt-6">
      <h2 className="text-lg font-semibold text-ink">Release a player</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Releasing ends the contract but not the obligation. Guaranteed money stays on your cap for
        every season it was owed, and the player is free to sign anywhere, including with a rival.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs tracking-wide text-ink-muted uppercase">Player</span>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setDone(null);
              setError(null);
            }}
            className="mt-1 block w-64 rounded-[2px] border border-rule bg-raised px-3 py-2 text-ink outline-none focus:border-rule-strong"
          >
            <option value="">Choose a player</option>
            {players.map((p) => (
              <option key={p.leaguePlayerId} value={p.leaguePlayerId}>
                {p.fullName} ({p.position} {p.overallRating})
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <ConfirmAction
            variant="danger"
            label="Release"
            confirmLabel="Release him"
            pending={isPending}
            pendingLabel="Releasing..."
            question={`Release ${selected.fullName}?`}
            consequence={
              selected.free
                ? "Nothing is guaranteed to him, so this costs you no cap space. It cannot be undone."
                : `${selected.deadMoneyLabel} stays on your cap as dead money` +
                  (selected.futureSeasons > 0
                    ? `, across this season and ${selected.futureSeasons} more.`
                    : " for the rest of this season.") +
                  " He can sign with any club, including a rival. This cannot be undone."
            }
            onConfirm={handleRelease}
          />
        )}
      </div>

      {selected && !selected.free && (
        <p className="mt-3 font-mono text-sm tabular-nums text-caution">
          Dead money if released: {selected.deadMoneyLabel}
        </p>
      )}

      {done && <p className="mt-3 text-sm text-team-accent">{done}</p>}
      {error != null && (
        <div className="mt-3 max-w-xl">
          <ErrorNotice error={error} />
        </div>
      )}
    </section>
  );
}
