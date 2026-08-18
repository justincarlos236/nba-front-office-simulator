import Link from "next/link";
import { resolvePrimaryCta } from "@/lib/marketing/primaryCta";
import { TeamLogoMarquee } from "./TeamLogoMarquee";

/**
 * The hero wash and the headline accent read from `--team-accent`, the accent
 * this world actually uses. Both were mixed from `--accent` (#ff7a1a), which
 * globals.css labels "Legacy - removed at step 9" and DESIGN.md names as the
 * anti-reference this system replaced - so the landing page was the last
 * surface still lit by the identity the product retired, and a visitor met
 * orange here and gold everywhere after.
 */
export async function Hero() {
  const primaryCta = await resolvePrimaryCta();

  return (
    <section className="relative overflow-hidden border-b border-rule">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--team-accent) 25%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-rule bg-field px-4 py-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
          General Manager Mode
        </span>

        <h1 className="text-balance text-4xl font-bold tracking-tight text-ink sm:text-6xl">
          Every trade. Every contract.{" "}
          {/* Was gradient text from --team-accent to --accent-2. Both are gold,
              so the gradient was imperceptible - it bought nothing and cost the
              one surface habit this system refuses outright. */}
          <span className="text-team-accent">Every decision.</span> Yours.
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-lg text-ink-muted">
          Take over an NBA franchise. Build a roster, work the salary cap, run the draft, and answer
          to ownership and your fans - one real decision at a time, for as many seasons as you can
          survive.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={primaryCta.href}
            className="rounded-[2px] bg-team-accent px-6 py-3 text-sm font-semibold text-team-accent-ink transition hover:opacity-90"
          >
            {primaryCta.label}
          </Link>
          <Link
            href="/teams"
            className="rounded-[2px] border border-rule px-6 py-3 text-sm font-semibold text-ink transition hover:bg-field"
          >
            See the League
          </Link>
        </div>

        <TeamLogoMarquee />
      </div>
    </section>
  );
}
