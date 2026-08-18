import Link from "next/link";
import { resolvePrimaryCta } from "@/lib/marketing/primaryCta";

/**
 * THE WIRE - the front door.
 *
 * Three things were wrong here and all three were self-inflicted.
 *
 * The headline set "Every decision." in gradient text, from `--team-accent` to
 * `--accent-2`. Both are gold, so the gradient was imperceptible - it bought
 * nothing and cost the one surface habit this system refuses outright. Worse,
 * the emphasis landed on the third repetition when the sentence's whole
 * argument is the last word. Weight and colour now sit on **Yours.**
 *
 * The wash behind it was mixed from `--accent` (#ff7a1a), which globals.css
 * labels "Legacy - removed at step 9" and DESIGN.md names as the anti-reference
 * this world replaced. The landing page was the last surface still lit by the
 * identity the product retired, so a visitor met orange here and gold
 * everywhere after. It is drawn from the live accent now.
 *
 * And an uppercase pill sat above the headline reading "General Manager Mode".
 * An eyebrow is a label apologising for a heading that should carry itself.
 *
 * The crest marquee moved to the closing section. Greyscale logos scrolling
 * under a hero is the "trusted by" band every product ships, and at 40px with
 * the colour drained most of them were unreadable anyway. Beside "thirty jobs
 * are open" the same thirty crests stop being texture and start being the
 * sentence.
 */
export async function Hero() {
  const primaryCta = await resolvePrimaryCta();

  return (
    <section className="relative overflow-hidden border-b border-rule">
      {/* Lit from the accent that is actually live, not the retired one. Kept
          low so the ground stays a document under desk light. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(65% 45% at 50% 0%, color-mix(in srgb, var(--team-accent) 22%, transparent), transparent 72%)",
        }}
      />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-ink sm:text-6xl">
          Every trade. Every contract. Every decision.{" "}
          <span className="text-team-accent">Yours.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-balance text-ink-muted">
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
      </div>
    </section>
  );
}
