import Link from "next/link";
import { resolvePrimaryCta } from "@/lib/marketing/primaryCta";
import { Artifact, ArtifactHead } from "@/components/ui/Artifact";
import { Stamp } from "@/components/ui/Stamp";
import { IconRuling } from "@/components/ui/icons";

/**
 * THE WIRE - the front door.
 *
 * Corrections first, and they were real: the headline set "Every decision." in
 * gradient text between two golds, so the gradient was imperceptible and cost
 * the one surface habit this system refuses outright; the emphasis landed on
 * the third repetition when the sentence's argument is its last word; the wash
 * behind it was mixed from `--accent`, which globals.css labels "Legacy -
 * removed at step 9" and DESIGN.md names as the world this one replaced; and an
 * uppercase pill above the headline apologised for a heading that carries
 * itself.
 *
 * **But correcting a page is not designing one.** With those removed the hero
 * was three centred lines and a hollow band where a logo marquee used to be,
 * and it still read as the dark product page every project ships. The page was
 * describing a simulator that adjudicates real CBA rules while looking like it
 * could be about anything.
 *
 * So the hero shows the thing instead of claiming it. The document on the right
 * is the league-office denial the game actually issues when a deal breaks a
 * rule, built from the same `Artifact` and `Stamp` primitives the product uses,
 * carrying the same words. It is marked SPECIMEN because it illustrates the
 * interface rather than recording a trade that happened.
 *
 * That also fixes the composition. A document is a left-aligned object, so the
 * headline sits left of it at `lg` and the symmetry breaks - which is what
 * stopped this reading as a template.
 */
export async function Hero() {
  const primaryCta = await resolvePrimaryCta();

  return (
    <section className="relative overflow-hidden border-b border-rule">
      {/* Lit from the accent that is actually live, not the retired one. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(70% 55% at 30% 0%, color-mix(in srgb, var(--team-accent) 20%, transparent), transparent 72%)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-20 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="text-center lg:text-left">
          <h1 className="text-4xl font-bold tracking-tight text-balance text-ink sm:text-5xl lg:text-6xl">
            Every trade. Every contract. Every decision.{" "}
            <span className="text-team-accent">Yours.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-balance text-ink-muted lg:mx-0 lg:text-pretty">
            Take over an NBA franchise. Build a roster, work the salary cap, run the draft, and
            answer to ownership and your fans - one real decision at a time, for as many seasons as
            you can survive.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
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

        {/* The product, not a picture of it. This is what the league office
            sends back when a deal breaks a rule, in the register DESIGN.md
            reserves for a ruling by an authority outside the user. */}
        <Artifact tone="official" className="mx-auto w-full max-w-md lg:mx-0">
          <ArtifactHead issuer="League Office" title="Transaction denied" reference="SPECIMEN" />
          <div className="px-6 py-5">
            <p className="flex items-start gap-2 text-[15px] leading-snug font-semibold text-ink">
              <IconRuling className="mt-0.5 shrink-0 text-signal-red" />
              The second apron blocks this deal.
            </p>
            <p className="mt-2 pl-6 text-[15px] leading-relaxed text-ink-muted">
              Teams over the second apron can&apos;t aggregate salaries in a trade. Send one player
              whose salary alone covers the return, or shed salary first.
            </p>
          </div>
          <div className="flex justify-end px-6 pb-5">
            <Stamp tone="signal" rotate={-7}>
              Denied
            </Stamp>
          </div>
        </Artifact>
      </div>
    </section>
  );
}
