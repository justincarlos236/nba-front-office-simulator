"use client";

import { useState, type ReactNode } from "react";
import { Button, Label } from "./primitives";

/**
 * The two-step confirmation for an irreversible action.
 *
 * The audit found this inverted: deleting a league (recoverable - start
 * another) had a deliberate two-step guard, while executing a trade, signing
 * a player, advancing the season and making a draft pick - all permanent, all
 * save-altering - fired on a single click. The P0 pass added guards to those
 * four sites by hand; this is the same pattern extracted so the fifth one
 * cannot be written differently.
 *
 * Inline rather than a modal on purpose: a dialog that traps focus and dims
 * the page is the right shape for a destructive *system* action, not for a
 * decision the player is deliberately making with the surrounding numbers as
 * context. The consequence should sit next to the evidence for it.
 */
export function ConfirmAction({
  label,
  confirmLabel,
  question,
  consequence,
  onConfirm,
  disabled = false,
  pending = false,
  pendingLabel,
  variant = "primary",
  children,
}: {
  /** The resting button. */
  label: string;
  /** The button that actually commits. */
  confirmLabel: string;
  /** One line, naming the specific thing being committed to. */
  question: string;
  /** What it costs and that it cannot be undone. */
  consequence: string;
  onConfirm: () => void;
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  variant?: "primary" | "danger";
  /** Optional extra evidence rendered inside the confirmation. */
  children?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant={variant} disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="border-t border-team-accent bg-field p-5">
      <Label tone="accent">Confirm</Label>
      <p className="mt-3 text-[15px] font-semibold text-ink">{question}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{consequence}</p>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant={variant} disabled={disabled || pending} onClick={onConfirm}>
          {pending ? (pendingLabel ?? "Working...") : confirmLabel}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
          Go back
        </Button>
      </div>
    </div>
  );
}
