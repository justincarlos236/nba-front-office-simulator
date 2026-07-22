import Link from "next/link";
import { notFound } from "next/navigation";
import { loadReferencePlayerProfile } from "@/lib/players/profileData";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { PlayerProfileContent } from "@/components/players/PlayerProfileContent";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The canonical, directly-linkable player profile - same data loader and
 * content renderer the profile drawer uses (`PlayerProfileProvider`), so
 * there's exactly one implementation of "what a profile looks like." Not
 * linked to from anywhere in the app anymore (every in-app player click
 * opens the drawer instead, for a consistent experience regardless of
 * where it's clicked) - this route exists for anyone who lands here
 * directly (a bookmark, a shared link).
 */
export default async function PlayerDetailPage({ params }: PageProps) {
  const { id } = await params;

  const data = await loadReferencePlayerProfile(id);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
      {data.identity.currentTeam ? (
        <Link
          href={`/teams/${data.identity.currentTeam.abbreviation}`}
          className="text-sm text-muted transition hover:text-foreground"
        >
          &larr; {data.identity.currentTeam.city} {data.identity.currentTeam.name}
        </Link>
      ) : (
        <Link href="/teams" className="text-sm text-muted transition hover:text-foreground">
          &larr; All teams
        </Link>
      )}

      <div className="mt-4 flex items-center gap-4">
        <PlayerAvatar
          photoUrl={data.identity.photoUrl}
          fullName={data.identity.fullName}
          size="xl"
          teamPrimaryColor={data.identity.currentTeam?.primaryColor}
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {data.identity.fullName}
          </h1>
          <p className="mt-1 text-muted">
            {data.identity.position}
            {data.identity.currentTeam
              ? ` · ${data.identity.currentTeam.city} ${data.identity.currentTeam.name}`
              : " · Free agent"}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <PlayerProfileContent data={data} />
      </div>
    </main>
  );
}
