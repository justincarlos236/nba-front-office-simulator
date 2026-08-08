import { ButtonLink, Label } from "@/components/ui/primitives";

/**
 * THE WIRE - Record register. The global 404.
 *
 * Every one of the 24 pages that call `notFound()` (a stale league URL, a
 * mistyped id, a non-owner probing another user's save) fell through to
 * Next's unstyled default page - a plain black-on-white "404 This page
 * could not be found" dropped into the middle of an otherwise fully
 * designed product. This is the single highest-traffic gap that survives:
 * any expired bookmark or copy-pasted link hits it.
 */
export default function NotFound() {
  return (
    <main className="flex-1 pb-24">
      <div className="mx-auto max-w-180 px-6 pt-24 text-center sm:px-8">
        <Label tone="accent">Filed nowhere</Label>
        <h1 className="mt-6 text-[clamp(2.5rem,6vw,4rem)] leading-[0.95] font-bold tracking-[-0.02em] text-ink">
          Nothing on record here
        </h1>
        <p className="mx-auto mt-6 max-w-[45ch] text-[clamp(1rem,1.6vw,1.125rem)] leading-relaxed text-ink-muted">
          The page you&apos;re looking for doesn&apos;t exist, or the save it belonged to is gone.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/leagues">My leagues</ButtonLink>
          <ButtonLink variant="secondary" href="/">
            Home
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
