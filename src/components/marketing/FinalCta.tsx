import Link from "next/link";
import { resolvePrimaryCta } from "@/lib/marketing/primaryCta";

/**
 * THE WIRE - the last thing on the page.
 *
 * Trimmed rather than redesigned. This section restated the hero, repeated its
 * button word for word, and added a line of encouragement that carried no
 * information a visitor three screens deep still needed. What earns the space
 * at the bottom of a page is the action, so that is all that is left.
 */
export async function FinalCta() {
  const primaryCta = await resolvePrimaryCta();

  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Take the keys.</h2>
        <Link
          href={primaryCta.href}
          className="mt-8 inline-block rounded-[2px] bg-team-accent px-8 py-3.5 text-base font-semibold text-team-accent-ink transition hover:opacity-90"
        >
          {primaryCta.label}
        </Link>
      </div>
    </section>
  );
}
