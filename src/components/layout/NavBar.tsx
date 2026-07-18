import Link from "next/link";

export function NavBar() {
  return (
    <header className="border-b border-border bg-surface/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight text-foreground">
          NBA Front Office <span className="text-accent">Simulator</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted">
          <Link href="/teams" className="transition hover:text-foreground">
            Teams
          </Link>
          <Link href="/#engineering" className="transition hover:text-foreground">
            Engineering
          </Link>
        </nav>
      </div>
    </header>
  );
}
