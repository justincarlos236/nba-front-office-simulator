interface Milestone {
  code: string;
  title: string;
  status: "done" | "current" | "upcoming";
}

const MILESTONES: Milestone[] = [
  { code: "M0", title: "Foundations — scaffold, schema, tooling, CI", status: "done" },
  { code: "M1", title: "Data pipeline — real teams/players/stats snapshot", status: "current" },
  { code: "M2", title: "Salary cap & trade engine", status: "done" },
  { code: "M3", title: "Core UI — dashboard, trade builder, scouting", status: "upcoming" },
  { code: "M4", title: "AI GM assistant", status: "current" },
  { code: "M5", title: "Auth & multi-tenant franchises", status: "upcoming" },
  { code: "M6", title: "Polish, deploy, and a public demo", status: "upcoming" },
];

const DOT_STYLES: Record<Milestone["status"], string> = {
  done: "bg-accent",
  current: "bg-accent-2 animate-pulse",
  upcoming: "bg-surface-2 border border-border",
};

export function RoadmapSection() {
  return (
    <section id="roadmap" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Built in milestones</h2>
          <p className="mt-4 text-muted">
            Shipped across multiple sessions, each one reaching a genuinely tested checkpoint before
            moving on — see{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-sm">docs/ROADMAP.md</code> for
            the detailed, living version.
          </p>
        </div>

        <ol className="mt-12 space-y-6">
          {MILESTONES.map((milestone) => (
            <li key={milestone.code} className="flex items-center gap-4">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_STYLES[milestone.status]}`}
              />
              <span className="w-10 shrink-0 font-mono text-sm text-muted">{milestone.code}</span>
              <span className="text-sm text-foreground">{milestone.title}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
