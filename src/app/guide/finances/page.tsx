import { GuideLayout, GuideSection } from "@/components/guide/GuideLayout";
import { CAP_STATUS_LABEL, CAP_STATUS_DESCRIPTION } from "@/lib/cap/capStatusLabel";
import { PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import { JOB_SECURITY_LABEL, JOB_SECURITY_DESCRIPTION } from "@/lib/gm/jobSecurity";
import { PAYROLL_TIER_LABEL } from "@/lib/gm/payrollTier";
import { TEAM_IDENTITY_LABEL, TEAM_IDENTITY_DESCRIPTION } from "@/lib/gm/teamIdentity";
import { GM_PERSONALITY_LABEL, GM_PERSONALITY_DESCRIPTION } from "@/lib/gm/gmPersonality";

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

const PAYROLL_TIER_BASELINE_EXPECTATION: Record<keyof typeof PAYROLL_TIER_LABEL, string> = {
  MODEST: "baseline expectation is just to develop young players",
  MODERATE: "baseline expectation is to make the playoffs",
  SIGNIFICANT: "baseline expectation is to win a playoff series",
  EXTREME: "baseline expectation is a deep playoff run",
};

export default function FinancialGuidePage() {
  return (
    <GuideLayout
      title="How the finances work"
      intro="A plain-English guide to the salary cap system - no NBA CBA knowledge required. Jump to a section:"
      sections={[
        ["#financial-status", "Financial Status"],
        ["#value-tiers", "Player Value Tiers"],
        ["#trades", "Trade Financial Check"],
        ["#cpu-trade-decisions", "CPU Trade Decisions"],
        ["#re-signing-rights", "Re-Signing Rights"],
        ["#signing-exception", "Signing Exception"],
        ["#financial-flexibility", "Financial Flexibility Grade"],
        ["#owner-confidence", "Owner Confidence & Job Security"],
      ]}
    >
      <GuideSection id="financial-status" title="Financial Status">
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
      </GuideSection>

      <GuideSection id="value-tiers" title="Player Value Tiers">
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
      </GuideSection>

      <GuideSection id="trades" title="Trade Financial Check">
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
      </GuideSection>

      <GuideSection id="cpu-trade-decisions" title="CPU Trade Decisions">
        <p>
          Passing the Trade Financial Check only means a trade is <em>legal</em>. The other team
          still has to actually want it - every CPU team genuinely evaluates a proposed trade before
          accepting, the same way a real front office would, based on who they are and what they
          need.
        </p>
        <div>
          <p className="font-semibold text-foreground">Team identity</p>
          <p className="mt-1">
            Every team reads its own competitive situation and reacts accordingly - a contender
            weighs a proven veteran much higher than a rebuilding team would, and vice versa for
            youth and picks.
          </p>
          <div className="mt-2 space-y-2">
            {(Object.keys(TEAM_IDENTITY_LABEL) as (keyof typeof TEAM_IDENTITY_LABEL)[]).map(
              (identity) => (
                <div key={identity} className="rounded-lg border border-border bg-surface p-4">
                  <p className="font-semibold text-foreground">{TEAM_IDENTITY_LABEL[identity]}</p>
                  <p className="mt-1">{TEAM_IDENTITY_DESCRIPTION[identity]}</p>
                </div>
              ),
            )}
          </div>
        </div>
        <div>
          <p className="font-semibold text-foreground">Roster needs</p>
          <p className="mt-1">
            Every team also recognizes real gaps in its own roster (a missing starting-caliber point
            guard, no rim protector, thin bench depth, no star scorer) from its actual players - not
            a fixed wish list. A player or pick that fills a genuine need is worth more to that
            specific team than the same asset would be to a team that doesn&apos;t need it.
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground">GM personality</p>
          <p className="mt-1">
            Every team also has a persistent front-office philosophy that nudges <em>how much</em>{" "}
            it leans toward certain kinds of value - it never overrides whether a trade is
            objectively fair. A genuinely lopsided trade gets rejected by every personality; these
            only make a real difference on trades that are already close to fair.
          </p>
          <div className="mt-2 space-y-2">
            {(Object.keys(GM_PERSONALITY_LABEL) as (keyof typeof GM_PERSONALITY_LABEL)[]).map(
              (personality) => (
                <div key={personality} className="rounded-lg border border-border bg-surface p-4">
                  <p className="font-semibold text-foreground">
                    {GM_PERSONALITY_LABEL[personality]}
                  </p>
                  <p className="mt-1">{GM_PERSONALITY_DESCRIPTION[personality]}</p>
                </div>
              ),
            )}
          </div>
        </div>
        <div>
          <p className="font-semibold text-foreground">Untouchable players</p>
          <p className="mt-1">
            A genuine superstar is off the table for anything less than a serious overpay, no matter
            how the rest of the numbers add up - real front offices don&apos;t casually move their
            best player just because a package of good-but-lesser pieces technically matches its
            value.
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Counter-offer suggestions</p>
          <p className="mt-1">
            When a team wouldn&apos;t accept your offer, the Trade Builder suggests a concrete fix
            from your team&apos;s actual available players and picks - either something to add that
            would close the gap, or (if their answer is really about a specific untouchable player)
            a note that you should build the offer around someone else instead.
          </p>
        </div>
      </GuideSection>

      <GuideSection id="re-signing-rights" title="Re-Signing Rights">
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
      </GuideSection>

      <GuideSection id="signing-exception" title="Signing Exception">
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
      </GuideSection>

      <GuideSection id="financial-flexibility" title="Financial Flexibility Grade">
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
      </GuideSection>

      <GuideSection id="owner-confidence" title="Owner Confidence & Job Security">
        <p>
          Ownership sets an expectation for your team at the start of every season, based on your
          payroll and roster quality:
        </p>
        <div className="space-y-1">
          {(Object.keys(PAYROLL_TIER_LABEL) as (keyof typeof PAYROLL_TIER_LABEL)[]).map((tier) => (
            <p key={tier}>
              <span className="text-foreground">{PAYROLL_TIER_LABEL[tier]}:</span>{" "}
              {PAYROLL_TIER_BASELINE_EXPECTATION[tier]}.
            </p>
          ))}
        </div>
        <p>
          A genuinely elite roster raises that bar a level; a weak roster on an expensive payroll
          (bad contracts) lowers it a level - payroll sets the baseline, not the whole picture. When
          the season ends, ownership compares what actually happened against that expectation.
          Exceeding it builds confidence; falling short costs it - and both effects are bigger for
          teams spending heavily, since more money on the roster means less patience for
          underperformance. That confidence (0-100) is what your{" "}
          <span className="text-foreground">GM Job Security</span> level is based on:
        </p>
        <div className="space-y-3">
          {(Object.keys(JOB_SECURITY_LABEL) as (keyof typeof JOB_SECURITY_LABEL)[]).map((level) => (
            <div key={level} className="rounded-lg border border-border bg-surface p-4">
              <p className="font-semibold text-foreground">{JOB_SECURITY_LABEL[level]}</p>
              <p className="mt-1">{JOB_SECURITY_DESCRIPTION[level]}</p>
            </div>
          ))}
        </div>
        <p>
          If your confidence drops low enough while payroll is still high, ownership may issue a{" "}
          <span className="text-foreground">payroll directive</span>: a specific dollar target you
          need to get your total salary below before a given season. Meeting it repairs some
          confidence; ignoring it costs you more. Every evaluation, expectation, and directive is
          posted to your league&apos;s News feed as it happens, so you&apos;re never caught off
          guard.
        </p>
      </GuideSection>
    </GuideLayout>
  );
}
