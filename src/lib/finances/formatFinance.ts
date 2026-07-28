/**
 * Compact money formatter for the Franchise Finances surfaces. Unlike
 * `formatCentsCompact` in @/lib/money, this handles billions (franchise
 * value) and keeps the negative sign in front of the "$" ("-$48.7M", not
 * "$-48.7M") for clean net-income / debt display.
 */
export function formatFinanceCents(cents: bigint | number): string {
  const dollars = Number(cents) / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
