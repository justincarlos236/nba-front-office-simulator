/**
 * Root loading boundary. Every page that reads league state is
 * `force-dynamic` - it blocks on the database before rendering anything, so
 * without this a slow query is a blank white flash. A single quiet pulse, not
 * a skeleton mimicking any one page's layout: this boundary covers every
 * route, and a wrong-shaped skeleton would be a worse signal than none.
 */
export default function Loading() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-350 px-4 py-10 sm:px-6 sm:py-16">
        <div className="h-3 w-32 animate-pulse rounded-[2px] bg-raised" />
        <div className="mt-4 h-9 w-64 animate-pulse rounded-[2px] bg-raised" />
        <div className="mt-8 h-40 animate-pulse rounded-[2px] bg-field" />
      </div>
    </main>
  );
}
