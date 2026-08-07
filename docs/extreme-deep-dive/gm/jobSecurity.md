# `gm/jobSecurity.ts` — turning the confidence number into a readable label

**What this whole file is about:** owner confidence is a number from 0 to 100, but "Confidence: 42"
doesn't tell a player much. This tiny file translates that number into a plain-English job-security label,
from "Very Secure" down to "Critical."

Open the real file: `src/lib/gm/jobSecurity.ts`. It's a short threshold function — you've seen this shape
several times now.

---

## The whole file (the important parts)

```ts
export type JobSecurityLevel =
  "VERY_SECURE" | "SECURE" | "STABLE" | "UNDER_PRESSURE" | "HOT_SEAT" | "CRITICAL";

export const JOB_SECURITY_LABEL: Record<JobSecurityLevel, string> = {
  VERY_SECURE: "Very Secure",
  SECURE: "Secure",
  STABLE: "Stable",
  UNDER_PRESSURE: "Under Pressure",
  HOT_SEAT: "Hot Seat",
  CRITICAL: "Critical",
};

export function getJobSecurityLevel(ownerConfidence: number): JobSecurityLevel {
  if (ownerConfidence >= 85) return "VERY_SECURE";
  if (ownerConfidence >= 70) return "SECURE";
  if (ownerConfidence >= 50) return "STABLE";
  if (ownerConfidence >= 30) return "UNDER_PRESSURE";
  if (ownerConfidence >= 15) return "HOT_SEAT";
  return "CRITICAL";
}
```

- `JobSecurityLevel` — the six labels, best to worst. `JOB_SECURITY_LABEL` (and a `JOB_SECURITY_DESCRIPTION`
  table, not shown) hold the display text — e.g. "Critical" comes with _"Your job is genuinely at risk if
  this doesn't turn around soon."_
- `getJobSecurityLevel(ownerConfidence)` — the by-now-familiar highest-first threshold chain: 85+ is "Very
  Secure," 70+ "Secure," 50+ "Stable," 30+ "Under Pressure," 15+ "Hot Seat," and anything lower is
  "Critical." The first cutoff the number clears wins.

---

## Zooming out

Nothing new here — it's the same "bucket a 0–100 number into named levels" pattern as `capStatusLabel.md`,
`playerValueTier.md`, and others. It exists so the UI can show a meaningful status instead of a bare
number. Remember from `seasonEvaluation.md` that owner confidence moves each season based on how you did;
this file is just how that number gets _displayed_. And separately, if confidence hits **0**, the offseason
logic fires you and ends the franchise — which brings us to the permanent record of your tenure.

**Next file:** `gm/careerRecord.md` — the permanent snapshot of a finished tenure, and how it changes your
lifetime reputation.
