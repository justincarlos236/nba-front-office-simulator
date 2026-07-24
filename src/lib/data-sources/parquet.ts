/**
 * Minimal parquet reader for the offline import pipeline. Wraps hyparquet
 * (pure-JS, no native build - works on Windows) plus the ZSTD/etc. codec pack,
 * since the hoopR-nba-data release files are ZSTD-compressed. Import-time only;
 * never imported by the running Next app (hyparquet* are devDependencies).
 */
export type ParquetRow = Record<string, unknown>;

/**
 * Fetches a `.parquet` file over HTTP and returns its rows as plain objects.
 *
 * hyparquet + its codec pack are ESM-only (no `require` export condition), so
 * they're pulled in via dynamic `import()` - that resolves correctly whether
 * this runs under the `tsx` CJS transpile (the offline import scripts) or a
 * native-ESM loader (vitest), instead of a static import that `tsx` would turn
 * into a failing `require()`.
 */
export async function readParquetFromUrl(url: string): Promise<ParquetRow[]> {
  const [{ parquetReadObjects }, { compressors }] = await Promise.all([
    import("hyparquet"),
    import("hyparquet-compressors"),
  ]);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch parquet ${url}: ${res.status} ${res.statusText}`);
  const file = await res.arrayBuffer();
  return (await parquetReadObjects({ file, compressors })) as ParquetRow[];
}
