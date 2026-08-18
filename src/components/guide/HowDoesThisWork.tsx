import Link from "next/link";
import type { ReactNode } from "react";
import { GUIDE_TOPICS } from "@/lib/guide/registry";

/**
 * The one link component every "explain this mechanic" moment in the app
 * should use (Onboarding Philosophy Phase 1 - docs/design/ONBOARDING_DESIGN.md
 * Part 4.1). Takes a registered topic id, not a raw href, so a renamed or
 * removed guide anchor is a type error at the call site instead of a dead
 * link discovered by a confused player.
 */
export function HowDoesThisWork({
  topic,
  className,
  /** Opens in a new tab - use when the trigger sits in a form with local state that navigating away would lose. */
  openInNewTab,
  children,
}: {
  topic: keyof typeof GUIDE_TOPICS;
  className?: string;
  openInNewTab?: boolean;
  /** Overrides the default "How does this work?" label for a more specific question. */
  children?: ReactNode;
}) {
  const { href } = GUIDE_TOPICS[topic];
  return (
    <Link
      href={href}
      target={openInNewTab ? "_blank" : undefined}
      className={className ?? "inline-block text-xs text-ink-muted underline hover:text-ink"}
    >
      {children ?? "How does this work?"}
    </Link>
  );
}
