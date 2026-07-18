import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function NavBar() {
  const session = await auth();

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
          {session?.user ? (
            <>
              <Link href="/leagues/new" className="transition hover:text-foreground">
                My League
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="transition hover:text-foreground">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="transition hover:text-foreground">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-black transition hover:opacity-90"
              >
                Start a franchise
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
