"use client";

import { useEffect } from "react";
import { Button, Label } from "@/components/ui/primitives";
import { toUserFacingError } from "@/lib/errors/userFacing";

/**
 * The root error boundary. Before this, an unhandled exception anywhere in
 * the tree fell through to Next's default error screen - unstyled, and in
 * production a bare "Application error: a client-side exception has
 * occurred" with no next step. Runs the same translation the server-action
 * error sites use, so a crash and a rejected action read the same way.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  const { summary, remedy } = toUserFacingError(error);

  return (
    <main className="flex-1 pb-24">
      <div className="mx-auto max-w-180 px-6 pt-24 text-center sm:px-8">
        <Label tone="accent">Something broke</Label>
        <h1 className="mt-6 text-[clamp(2rem,5vw,3rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
          {summary}
        </h1>
        {remedy && (
          <p className="mx-auto mt-6 max-w-[45ch] text-[15px] leading-relaxed text-ink-muted">
            {remedy}
          </p>
        )}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-[2px] border border-rule px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase transition-colors duration-120 hover:bg-raised"
          >
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
