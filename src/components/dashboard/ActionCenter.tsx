"use client";

import { useState } from "react";
import Link from "next/link";
import type { ActionCenterItem } from "@/lib/gm/actionCenter";
import type { DidYouKnowTip } from "@/lib/gm/didYouKnow";

const SEVERITY_DOT_CLASS: Record<ActionCenterItem["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-orange-400",
  info: "bg-accent",
};

/**
 * "Why is this recommended?" (Onboarding Philosophy Phase 2 - see
 * docs/ONBOARDING_DESIGN.md Part 4B.2/4B.3). A collapsed-by-default
 * disclosure per item: the label still navigates on click, this only ever
 * reveals text. Nothing here fires without the player asking for it.
 */
function ActionCenterCard({ item }: { item: ActionCenterItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasReasoning = Boolean(item.reasoning || item.consequence);

  return (
    <div className="rounded-lg border border-border transition hover:border-accent/40 hover:bg-surface-2">
      <Link href={item.href} className="group flex items-start gap-3 p-3">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT_CLASS[item.severity]}`}
        />
        <div className="min-w-0">
          <p className="font-medium text-foreground transition group-hover:text-accent">
            {item.label}
          </p>
          <p className="mt-0.5 text-xs text-muted">{item.description}</p>
        </div>
      </Link>
      {hasReasoning && (
        <div className="px-3 pb-3 pl-8">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted underline hover:text-foreground"
          >
            {expanded ? "Hide reasoning" : "Why is this recommended?"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-surface-2 p-3 text-xs text-muted">
              {item.reasoning && <p>{item.reasoning}</p>}
              {item.consequence && (
                <p>
                  <span className="text-foreground">If you don&apos;t:</span> {item.consequence}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionCenter({
  items,
  didYouKnowTip,
}: {
  items: ActionCenterItem[];
  /** Onboarding Philosophy Phase 2 (docs/ONBOARDING_DESIGN.md Part 4B.5) - only ever passed when `items` is empty, so it never competes with a real recommendation. */
  didYouKnowTip?: DidYouKnowTip | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold text-foreground">What&apos;s next</h2>
      {items.length === 0 ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted">
            Nothing urgent right now - explore trades, staff, or free agency to keep improving the
            team.
          </p>
          {didYouKnowTip && (
            <Link
              href={didYouKnowTip.href}
              className="block rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted transition hover:border-accent/40 hover:text-foreground"
            >
              <span className="font-semibold text-foreground">Did you know? </span>
              {didYouKnowTip.text}
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <ActionCenterCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
