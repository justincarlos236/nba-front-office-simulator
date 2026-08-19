"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * The submit button for taking a job, with the one thing it was missing: a
 * sign that the click registered.
 *
 * Bootstrapping a league writes about 1,700 rows and takes seconds. The card
 * was a plain submit button inside a server-action form, so nothing changed on
 * screen while that ran - and two new accounts each clicked five times in ten
 * seconds, ending up with five identical saves they could not tell apart.
 *
 * `useFormStatus` reads the pending state of the enclosing form, so the button
 * disables itself for the duration and says what is happening. The server-side
 * guard in `createLeagueAction` covers the race this cannot: two clicks landing
 * before React has re-rendered.
 */
export function TakeJobButton({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className="relative w-full text-left disabled:cursor-not-allowed"
    >
      <span className={pending ? "block opacity-40" : "block"}>{children}</span>
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-[2px] bg-team-accent px-3 py-1.5 text-xs font-semibold text-team-accent-ink">
            Setting up your franchise...
          </span>
        </span>
      )}
    </button>
  );
}
