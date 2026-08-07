import Link from "next/link";
import { resolvePrimaryCta } from "@/lib/marketing/primaryCta";

export async function FinalCta() {
  const primaryCta = await resolvePrimaryCta();

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          The league is waiting on your first move.
        </h2>
        <p className="mt-4 text-muted">
          Pick a franchise, take the keys, and find out what kind of GM you are.
        </p>
        <Link
          href={primaryCta.href}
          className="mt-8 inline-block rounded-lg bg-accent px-8 py-3.5 text-base font-semibold text-black transition hover:opacity-90"
        >
          {primaryCta.label}
        </Link>
      </div>
    </section>
  );
}
