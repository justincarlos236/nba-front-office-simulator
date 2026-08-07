interface Experience {
  title: string;
  description: string;
}

const EXPERIENCES: Experience[] = [
  {
    title: "Build Your Roster",
    description:
      "Work the phones on trades, chase free agents, and find the next star in the draft - every move ripples through the rest of the league.",
  },
  {
    title: "Master the Cap",
    description:
      "Real 2023 CBA rules turn every contract into a bet on the future. Spend into the luxury tax to chase a title, or stay disciplined and build for later.",
  },
  {
    title: "Run the Whole Organization",
    description:
      "Set your rotation, hire your staff, and keep your fans and ownership on your side - or don't, and find out how quickly a GM's seat gets hot.",
  },
  {
    title: "Chase a Championship",
    description:
      "Grind through 82 games, survive the playoffs, and watch your franchise's history - champions, legends, and retirements - build season after season.",
  },
];

export function GameplayShowcase() {
  return (
    <section className="border-b border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            This is the job. All of it.
          </h2>
          <p className="mt-4 text-muted">
            No two franchises play out the same way - the league reacts to every call you make.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {EXPERIENCES.map((experience, i) => (
            <div
              key={experience.title}
              className="animate-lottery-card-in relative overflow-hidden rounded-xl border border-border bg-surface p-8 transition hover:border-accent/40"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div
                className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-20 blur-2xl"
                style={{ background: "var(--accent)" }}
              />
              <h3 className="text-xl font-bold text-foreground">{experience.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{experience.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
