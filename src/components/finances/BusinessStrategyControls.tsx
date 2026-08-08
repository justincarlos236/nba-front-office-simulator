"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBusinessStrategyAction } from "@/lib/actions/finances";
import type { TicketPricingPosture } from "@/generated/prisma/client";

interface Option<T extends string> {
  value: T;
  label: string;
  detail: string;
}

const TICKET_OPTIONS: Option<TicketPricingPosture>[] = [
  {
    value: "FAN_FRIENDLY",
    label: "Fan-friendly",
    detail:
      "Lower prices - less gate revenue, but happier fans and a faster-growing season-ticket base over time.",
  },
  {
    value: "STANDARD",
    label: "Standard",
    detail: "Market-rate pricing. No effect on fan happiness or season-ticket base.",
  },
  {
    value: "PREMIUM",
    label: "Premium",
    detail:
      "Higher prices - more gate revenue now, at a real cost to fan happiness and your season-ticket base.",
  },
];

function Segmented<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const active = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="rounded-[2px] border border-rule bg-field p-4">
      <p className="text-xs tracking-wide text-ink-muted uppercase">{title}</p>
      <div className="mt-2 flex overflow-hidden rounded-[2px] border border-rule">
        {options.map((o) => {
          const isActive = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex-1 px-2 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "bg-team-accent/15 text-team-accent"
                  : "bg-transparent text-ink-muted hover:bg-raised hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-muted">{active.detail}</p>
    </div>
  );
}

export function BusinessStrategyControls({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: {
    ticketPricingPosture: TicketPricingPosture;
  };
}) {
  const router = useRouter();
  const [ticket, setTicket] = useState(initial.ticketPricingPosture);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty = ticket !== initial.ticketPricingPosture;

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateBusinessStrategyAction(leagueId, { ticketPricingPosture: ticket });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Segmented
          title="Ticket Pricing"
          options={TICKET_OPTIONS}
          value={ticket}
          onChange={(v) => {
            setTicket(v);
            setSaved(false);
          }}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || isPending}
          className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save strategy"}
        </button>
        {saved && !dirty && <span className="text-sm text-positive">Saved.</span>}
      </div>
    </div>
  );
}
