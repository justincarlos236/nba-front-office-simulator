const TECHNOLOGIES = [
  "Next.js 16",
  "TypeScript",
  "PostgreSQL",
  "Prisma",
  "Auth.js",
  "Claude API",
  "Vitest",
  "Playwright",
  "GitHub Actions",
];

export function TechStrip() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {TECHNOLOGIES.map((tech) => (
            <span key={tech} className="text-sm font-medium text-muted">
              {tech}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
