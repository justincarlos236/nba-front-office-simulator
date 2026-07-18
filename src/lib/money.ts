const DOLLARS_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Formats a whole-cent amount (as stored in the DB) as a compact dollar string, e.g. "$48,700,000". */
export function formatCentsAsDollars(cents: bigint | number): string {
  const dollars = Number(cents) / 100;
  return DOLLARS_FORMATTER.format(dollars);
}

/** Formats a whole-cent amount in compact form, e.g. "$48.7M" or "$850.0K". */
export function formatCentsCompact(cents: bigint | number): string {
  const dollars = Number(cents) / 100;
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${(dollars / 1_000).toFixed(1)}K`;
  }
  return DOLLARS_FORMATTER.format(dollars);
}
