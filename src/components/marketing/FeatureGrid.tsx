interface Feature {
  title: string;
  description: string;
  status: "shipped" | "in-progress" | "planned";
}

const FEATURES: Feature[] = [
  {
    title: "Real salary cap engine",
    description:
      "Season-by-season cap, tax, and apron thresholds; mid-level exception eligibility; and a full cap sheet calculator (committed salary, dead money, empty-roster charges). Backed by unit tests, not vibes.",
    status: "shipped",
  },
  {
    title: "Trade legality validator",
    description:
      "Multi-team trades checked against real matching rules: cap-space room vs. the tiered over-the-cap formula, the second apron's no-aggregation restriction, no-trade clauses, and a Stepien-rule draft pick check.",
    status: "shipped",
  },
  {
    title: "Quantitative player valuation",
    description:
      "A performance composite from advanced box-score stats, adjusted by an age curve, mapped to an estimated market value — surfacing surplus value on every contract in the league.",
    status: "shipped",
  },
  {
    title: "AI GM assistant",
    description:
      "A Claude-powered copilot that calls into the same cap and valuation engines the UI uses, so its trade grades and advice are grounded in real computed numbers instead of hallucinated stats.",
    status: "planned",
  },
  {
    title: "Multi-tenant franchises",
    description:
      "Every user gets their own save, cloned from a real NBA snapshot and then fully independent — trades, extensions, and retirements in one league never touch another.",
    status: "planned",
  },
  {
    title: "Built like a real product",
    description:
      "TypeScript end-to-end, Postgres + Prisma, Vitest + Playwright, GitHub Actions CI, and documented architecture decisions — not a tutorial project.",
    status: "in-progress",
  },
];

const STATUS_STYLES: Record<Feature["status"], string> = {
  shipped: "bg-accent/15 text-accent",
  "in-progress": "bg-accent-2/15 text-accent-2",
  planned: "bg-surface-2 text-muted",
};

const STATUS_LABELS: Record<Feature["status"], string> = {
  shipped: "Shipped",
  "in-progress": "In progress",
  planned: "Planned",
};

export function FeatureGrid() {
  return (
    <section id="engineering" className="border-b border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            The engineering behind the front office
          </h2>
          <p className="mt-4 text-muted">
            Every card below maps to real, testable code — see{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-sm">docs/ARCHITECTURE.md</code>{" "}
            for the full rationale.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-border bg-surface p-6 transition hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-foreground">{feature.title}</h3>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[feature.status]}`}
                >
                  {STATUS_LABELS[feature.status]}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
