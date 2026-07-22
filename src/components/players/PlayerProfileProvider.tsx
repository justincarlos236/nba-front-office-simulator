"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getPlayerProfileAction } from "@/lib/actions/players";
import type { PlayerProfileData, PlayerProfileIdentity } from "@/lib/players/profileData";
import { PlayerProfileContent } from "@/components/players/PlayerProfileContent";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";

interface PlayerProfileContextValue {
  openPlayerProfile: (identity: PlayerProfileIdentity) => void;
}

const PlayerProfileContext = createContext<PlayerProfileContextValue | null>(null);

/** Every `PlayerChip` calls this to open the shared profile drawer. */
export function usePlayerProfile(): PlayerProfileContextValue {
  const ctx = useContext(PlayerProfileContext);
  if (!ctx) throw new Error("usePlayerProfile must be used within PlayerProfileProvider");
  return ctx;
}

function identityKey(identity: PlayerProfileIdentity): string {
  return identity.kind === "league"
    ? `league:${identity.leagueId}:${identity.leaguePlayerId}`
    : `reference:${identity.playerId}`;
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: PlayerProfileData };

/**
 * Fetches and renders one player's profile. Keyed by identity from the
 * parent, so switching to a different player fully remounts this
 * component instead of needing an effect to manually reset stale
 * loading/error/data state - a fresh mount always starts at `loading`.
 */
function PlayerProfileDrawerBody({ identity }: { identity: PlayerProfileIdentity }) {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getPlayerProfileAction(identity)
      .then((result) => {
        if (cancelled) return;
        setState(
          result
            ? { status: "loaded", data: result }
            : { status: "error", message: "Player not found." },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <p className="text-sm text-muted">Loading player profile...</p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <p className="text-sm text-red-400">{state.message}</p>
      </div>
    );
  }

  const { data } = state;
  return (
    <div className="p-6">
      <div className="flex items-center gap-4">
        <PlayerAvatar
          photoUrl={data.identity.photoUrl}
          fullName={data.identity.fullName}
          size="xl"
          teamPrimaryColor={data.identity.currentTeam?.primaryColor}
        />
        <div>
          <h2 className="text-2xl font-bold text-foreground">{data.identity.fullName}</h2>
          <p className="text-sm text-muted">
            {data.identity.position}
            {data.identity.currentTeam
              ? ` · ${data.identity.currentTeam.city} ${data.identity.currentTeam.name}`
              : " · Free agent"}
          </p>
        </div>
      </div>
      <div className="mt-6">
        <PlayerProfileContent data={data} />
      </div>
    </div>
  );
}

/**
 * Mounted once in the root layout. Holds which player's profile (if any) is
 * open and renders it as a slide-out drawer via a portal - this overlays
 * whatever page is currently mounted without ever unmounting it, which is
 * what lets a profile be opened mid-trade-build without losing the
 * in-progress selection. No URL/query-param syncing - this is a UI overlay,
 * not a navigable route; `/players/[id]` remains the plain, directly-linkable
 * fallback for anyone who lands there another way.
 */
export function PlayerProfileProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<PlayerProfileIdentity | null>(null);

  const openPlayerProfile = useCallback((next: PlayerProfileIdentity) => {
    setIdentity(next);
  }, []);

  const close = useCallback(() => {
    setIdentity(null);
  }, []);

  useEffect(() => {
    if (!identity) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [identity, close]);

  const contextValue = useMemo(() => ({ openPlayerProfile }), [openPlayerProfile]);

  return (
    <PlayerProfileContext.Provider value={contextValue}>
      {children}
      {identity && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex justify-end">
              <div
                className="absolute inset-0 bg-black/60 transition-opacity"
                onClick={close}
                aria-hidden="true"
              />
              <div
                role="dialog"
                aria-modal="true"
                className="relative h-full w-full max-w-lg overflow-y-auto border-l border-border bg-background shadow-2xl"
              >
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close player profile"
                  className="absolute top-4 right-4 z-10 rounded-lg border border-border bg-surface p-2 text-muted transition hover:text-foreground"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
                <PlayerProfileDrawerBody key={identityKey(identity)} identity={identity} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </PlayerProfileContext.Provider>
  );
}
