import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in srgb, var(--accent) 25%, transparent), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          In active development — built in the open
        </span>

        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          Run your franchise like a real{" "}
          <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            NBA General Manager
          </span>
          .
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-lg text-muted">
          Manage the salary cap under real 2023 CBA rules, negotiate trades that actually have to
          clear the cap sheet, and lean on an AI assistant grounded in real computed numbers — not
          vibes.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/teams"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Browse the league (real data)
          </Link>
          <a
            href="#engineering"
            className="rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            Explore the engineering
          </a>
        </div>
      </div>
    </section>
  );
}
