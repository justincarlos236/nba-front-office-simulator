export type Position = "PG" | "SG" | "SF" | "PF" | "C";

/**
 * balldontlie only reports coarse positions (G / F / C / combo-forms like
 * "G-F"), not our five-slot PG/SG/SF/PF/C granularity. This is a
 * documented, approximate mapping - real bios don't distinguish e.g. a
 * point guard from a shooting guard at this data source, so we pick a
 * reasonable representative slot per group rather than guessing further.
 */
export function mapPosition(apiPosition: string | null | undefined): Position {
  const normalized = (apiPosition ?? "").trim().toUpperCase();
  switch (normalized) {
    case "G":
      return "PG";
    case "G-F":
    case "F-G":
      return "SG";
    case "F":
      return "SF";
    case "F-C":
    case "C-F":
      return "PF";
    case "C":
      return "C";
    default:
      return "SF";
  }
}
