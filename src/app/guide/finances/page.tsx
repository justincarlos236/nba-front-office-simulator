import Link from "next/link";
import type { ReactNode } from "react";
import { CAP_STATUS_LABEL, CAP_STATUS_DESCRIPTION } from "@/lib/cap/capStatusLabel";
import { PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";

export const metadata = {
  title: "How the Finances Work | NBA Front Office Simulator",
};

const TIER_DESCRIPTIONS: Record<keyof typeof PLAYER_VALUE_TIER_LABEL, string> = {
  SUPERSTAR: "MVP-caliber. The most expensive players in the league to sign or keep.",
  STAR: "All-Star caliber. A real difference-maker, priced accordingly.",
  STARTER: "A quality, reliable starter.",
  ROTATION: "A solid bench piece who plays real minutes.",
  MINIMUM: "Replacement-level. Almost always signable to a Minimum Contract.",
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-muted">{children}</div>
    </section>
  );
}

export default function FinancialGuidePage() {
  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">How the finances work</h1>
      <p className="mt-2 text-muted">
        A plain-English guide to the salary cap system - no NBA CBA knowledge required. Jump to a
        section:
      </p>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {[
          ["#financial-status", "Financial Status"],
          ["#value-tiers", "Player Value Tiers"],
          ["#trades", "Trade Financial Check"],
          ["#re-signing-rights", "Re-Signing Rights"],
          ["#signing-exception", "Signing Exception"],
          ["#financial-flexibility", "Financial Flexibility Grade"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-full border border-border px-3 py-1 text-foreground transition hover:border-accent/40"
          >
            {label}
          </a>
        ))}
      </nav>

      <Section id="financial-status" title="Financial Status">
        <p>
          Every team has a single financial status that sums up its cap situation. It never shows up
          as a hard spending wall - it changes *how* you can add players, not whether you can build
          an expensive roster at all.
        </p>
        <div className="space-y-3">
          {(Object.keys(CAP_STATUS_LABEL) as (keyof typeof CAP_STATUS_LABEL)[]).map((status) => (
            <div key={status} className="rounded-lg border border-border bg-surface p-4">
              <p className="font-semibold text-foreground">{CAP_STATUS_LABEL[status]}</p>
              <p className="mt-1">{CAP_STATUS_DESCRIPTION[status]}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="value-tiers" title="Player Value Tiers">
        <p>
          Every player is labeled with a tier so you can tell how expensive they are at a glance,
          without needing to compare exact ratings.
        </p>
        <div className="space-y-2">
          {(Object.keys(PLAYER_VALUE_TIER_LABEL) as (keyof typeof PLAYER_VALUE_TIER_LABEL)[]).map(
            (tier) => (
              <div key={tier} className="flex items-baseline justify-between gap-4">
                <p className="font-semibold text-foreground">{PLAYER_VALUE_TIER_LABEL[tier]}</p>
                <p className="text-right">{TIER_DESCRIPTIONS[tier]}</p>
              </div>
            ),
          )}
        </div>
      </Section>

      <Section id="trades" title="Trade Financial Check">
        <p>
          Every trade you build gets checked automatically - you&apos;ll always see a plain
          &quot;Valid&quot; or &quot;Invalid&quot; result with a one-line explanation, never a raw
          rulebook. Here&apos;s the logic behind it:
        </p>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <span className="text-foreground">Under the Cap:</span> you can take on any salary, up
            to your available cap space.
          </li>
          <li>
            <span className="text-foreground">Over the Cap:</span> the salary you take back has to
            roughly match what you send out. The further over the cap (and into the Luxury Tax) your
            team is, the closer that match has to be to a dollar-for-dollar swap - teams deep into
            the tax get the least flexibility to take on extra salary in a trade.
          </li>
          <li>
            <span className="text-foreground">No-trade clauses:</span> a player with one has to
            agree to the deal - if they haven&apos;t, the trade is blocked outright.
          </li>
          <li>
            <span className="text-foreground">Combining contracts:</span> teams with more cap room
            can combine multiple players&apos; salaries to match one bigger incoming contract. The
            most expensive rosters lose that flexibility and have to match salaries one-for-one
            instead.
          </li>
        </ul>
        <p>
          If a trade is invalid because of salary matching, the message tells you approximately how
          much more salary you need to send out - you&apos;ll never have to do that math yourself.
        </p>
      </Section>

      <Section id="re-signing-rights" title="Re-Signing Rights">
        <p>
          If a player&apos;s contract with your team expires and they become a free agent, you keep
          their <span className="text-foreground">Re-Signing Rights</span> - shown as a badge
          wherever they appear on your free-agent board. That lets you offer them a new deal that
          exceeds the salary cap, even if you&apos;re already over it, up to a fair market value for
          a player of their caliber.
        </p>
        <p>
          Nobody else gets that privilege for that player - an outside team still has to sign them
          using ordinary Cap Space or a Signing Exception. Re-Signing Rights follow a player if you
          trade for them, too.
        </p>
      </Section>

      <Section id="signing-exception" title="Signing Exception">
        <p>
          Once your team is over the cap, you still have a limited amount of extra spending power
          for free agents (outside of any Re-Signing Rights): the{" "}
          <span className="text-foreground">Signing Exception</span>. Every offer that uses it shows
          exactly how much you have <span className="text-foreground">total</span>, how much
          you&apos;ve <span className="text-foreground">already used</span> this season, and how
          much is <span className="text-foreground">remaining</span> - it resets at the start of
          each new season.
        </p>
        <p>
          Regardless of your Signing Exception or cap situation, every team can always sign a player
          to a <span className="text-foreground">Minimum Contract</span> - that path is never
          restricted.
        </p>
      </Section>

      <Section id="financial-flexibility" title="Financial Flexibility Grade">
        <p>
          Long-term contracts affect more than this season - a big four-year deal eats into cap room
          for years after you sign it. Every team gets a single{" "}
          <span className="text-foreground">Financial Flexibility Grade</span> (A through F)
          summarizing:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>Your current Financial Status</li>
          <li>How much payroll is already committed in each of the next four seasons</li>
          <li>
            Any single large, long-term contract still on the books several years out (an
            &quot;albatross&quot; deal)
          </li>
        </ul>
        <p>
          A team with an A has a clean books for years to come; an F means payroll is locked up well
          into the future with little room to maneuver. It&apos;s a snapshot of what&apos;s
          <span className="text-foreground"> already committed</span> from decisions you&apos;ve
          already made - not a prediction of what you&apos;ll do next.
        </p>
      </Section>

      <p className="mt-12 text-xs text-muted">
        <Link href="/leagues" className="hover:text-foreground">
          &larr; Back to My Leagues
        </Link>
      </p>
    </main>
  );
}
