import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function NavBar() {
  const session = await auth();

  return (
    <header className="border-b border-rule bg-field/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight text-ink">
          NBA Front Office <span className="text-team-accent">Simulator</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-muted">
          <Link href="/teams" className="transition hover:text-ink">
            Teams
          </Link>
          <Link href="/guide" className="transition hover:text-ink">
            Guide
          </Link>
          {session?.user ? (
            <>
              <Link href="/leagues" className="transition hover:text-ink">
                My Leagues
              </Link>
              <Link href="/career" className="transition hover:text-ink">
                Career
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="transition hover:text-ink">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="transition hover:text-ink">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-[2px] bg-team-accent px-3 py-1.5 font-semibold text-team-accent-ink transition hover:opacity-90"
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
