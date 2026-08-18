export function SiteFooter() {
  return (
    <footer className="px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-ink-muted sm:flex-row">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <p>NBA Front Office Simulator</p>
          <p className="text-sm text-ink">
            A project by <span className="font-semibold text-team-accent">Justin Carlos</span>
          </p>
        </div>
        <p>
          Not affiliated with the NBA. Contract figures are approximate and for simulation only.
        </p>
      </div>
    </footer>
  );
}
