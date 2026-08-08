"use client";

import { useState } from "react";
import Link from "next/link";
import type { ActionCenterItem } from "@/lib/gm/actionCenter";
import type { DidYouKnowTip } from "@/lib/gm/didYouKnow";
import { Label } from "@/components/ui/primitives";

/**
 * Severity as a ruled left edge rather than a coloured dot. In The Wire a
 * status is a semantic colour on a rule, never a decorative pip - and the
 * previous `bg-caution` / `bg-team-accent` values were raw palette colours
 * outside the token layer.
 */
const SEVERITY_EDGE: Record<ActionCenterItem["severity"], string> = {
  critical: "border-l-signal-red",
  warning: "border-l-caution",
  info: "border-l-team-accent",
};

const SEVERITY_LABEL: Record<ActionCenterItem["severity"], string> = {
  critical: "Urgent",
  warning: "Soon",
  info: "When you can",
};

/**
 * "Why is this recommended?" (Onboarding Philosophy Phase 2 - see
 * docs/ONBOARDING_DESIGN.md Part 4B.2/4B.3). A collapsed-by-default
 * disclosure per item: the label still navigates on click, this only ever
 * reveals text. Nothing here fires without the player asking for it.
 */
function ActionCenterItemRow({ item }: { item: ActionCenterItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasReasoning = Boolean(item.reasoning || item.consequence);

  return (
    <div className={`border-l-2 bg-raised ${SEVERITY_EDGE[item.severity]}`}>
      <Link
        href={item.href}
        className="group block px-4 py-3 transition-colors duration-120 hover:bg-field"
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[clamp(1.125rem,1.6vw,1.375rem)] leading-tight font-semibold tracking-[-0.01em] text-ink transition-colors group-hover:text-team-accent">
            {item.label}
          </p>
          <span className="shrink-0 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
            {SEVERITY_LABEL[item.severity]}
          </span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{item.description}</p>
      </Link>
      {hasReasoning && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            {expanded ? "Hide reasoning" : "Why is this recommended?"}
          </button>
          {expanded && (
            <div className="mt-3 space-y-2 border-t border-hairline pt-3 text-[15px] leading-relaxed text-ink-muted">
              {item.reasoning && <p>{item.reasoning}</p>}
              {item.consequence && (
                <p>
                  <span className="font-semibold text-ink">If you don&apos;t:</span>{" "}
                  {item.consequence}
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
    <section className="border-t-2 border-team-accent bg-field p-6 sm:p-8">
      <Label tone="accent">Needs you</Label>
      {items.length === 0 ? (
        <div className="mt-4 space-y-4">
          <p className="text-[15px] leading-relaxed text-ink-muted">
            Nothing urgent right now. Explore trades, staff, or free agency to keep improving the
            team.
          </p>
          {didYouKnowTip && (
            <Link
              href={didYouKnowTip.href}
              className="block border-l-2 border-l-rule bg-raised px-4 py-3 text-[15px] text-ink-muted transition-colors duration-120 hover:border-l-team-accent hover:text-ink"
            >
              <span className="font-semibold text-ink">Did you know? </span>
              {didYouKnowTip.text}
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <ActionCenterItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
