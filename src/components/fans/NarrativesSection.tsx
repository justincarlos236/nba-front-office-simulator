/**
 * Fans Page Redesign (Phase 5), Section 4 (media narratives half) -
 * "The Conversation" (docs/FANS_PAGE_REDESIGN.md Part 3.4). Persistent,
 * multi-week storylines - distinct from ReactionFeedSection (Phase 2),
 * which is one-off reactions to individual events. This is the ongoing
 * interpretation layer: News reports events, this section is the story.
 */

export interface NarrativeItem {
  id: string;
  headline: string;
  body: string;
  status: "OPEN" | "RESOLVED";
  resolutionBeat: string | null;
}

export function NarrativesSection({ narratives }: { narratives: NarrativeItem[] }) {
  if (narratives.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-ink">The Conversation</h2>
      <p className="mt-1 text-sm text-ink-muted">
        The ongoing storylines this fanbase is actually living through right now.
      </p>
      <div className="mt-4 space-y-3">
        {narratives.map((n) => (
          <div key={n.id} className="rounded-[2px] border border-rule bg-field p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold text-ink">{n.headline}</p>
              {n.status === "OPEN" && (
                <span className="shrink-0 rounded-full bg-team-accent/10 px-2 py-0.5 text-xs font-semibold text-team-accent">
                  Ongoing
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">{n.body}</p>
            {n.resolutionBeat && (
              <p className="mt-2 border-t border-rule pt-2 text-sm text-ink">
                {n.resolutionBeat}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
