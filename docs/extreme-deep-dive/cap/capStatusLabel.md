# `cap/capStatusLabel.ts` — turning five spending tiers into three simple labels

**What this whole file is about:** the sim tracks **five** spending tiers internally (from
`apron.md`), but showing a casual player all five is confusing. This small file collapses them
into **three** friendly labels — "Under the Cap," "Over the Cap," "Luxury Tax" — for display
only. The real five-tier logic still runs underneath; this just decides what words appear on
screen.

Open the real file: `src/lib/cap/capStatusLabel.ts`. It's short and teaches a couple of new
ideas.

---

## Part 1 — the import and a new kind of type

```ts
import { ApronLevel } from "./apron";

export type SimpleCapStatus = "UNDER_CAP" | "OVER_CAP" | "LUXURY_TAX";
```

- `import { ApronLevel } from "./apron";` — borrow the `ApronLevel` list from `apron.ts`. (Notice
  there's no `type` word this time, because here we use `ApronLevel` as an actual value in
  comparisons, not just as a description.)
- `export type SimpleCapStatus = "UNDER_CAP" | "OVER_CAP" | "LUXURY_TAX";`
  - `type` (like `interface`) creates a **named description.** But instead of describing an object
    shape, this one describes an exact set of allowed text values.
  - The `|` means **"or."** So `SimpleCapStatus` means: "a piece of text that is _exactly_ one of
    `"UNDER_CAP"`, `"OVER_CAP"`, or `"LUXURY_TAX"` — nothing else."
  - This is a "string literal union." It's a lightweight way to say "this can only be one of these
    three specific words," and the type-checker will complain if you ever try to use a fourth.

---

## Part 2 — two lookup tables (labels and descriptions)

```ts
export const CAP_STATUS_LABEL: Record<SimpleCapStatus, string> = {
  UNDER_CAP: "Under the Cap",
  OVER_CAP: "Over the Cap",
  LUXURY_TAX: "Luxury Tax",
};

export const CAP_STATUS_DESCRIPTION: Record<SimpleCapStatus, string> = {
  UNDER_CAP: "You have cap space and can freely sign available free agents.",
  OVER_CAP:
    "You can't freely sign expensive outside free agents, but you can still improve your roster through trades, re-signing your own players, a Signing Exception, and minimum contracts.",
  LUXURY_TAX:
    "Your payroll has reached a very high level - ownership will expect this team's performance to justify that investment.",
};
```

- Each of these is a **lookup table** — you give it one of the three statuses, and it gives you
  back the matching text.
- `: Record<SimpleCapStatus, string>` is the type. **`Record<Key, Value>`** describes an object
  used as a lookup table: "the keys are `SimpleCapStatus` values, and each one maps to a
  `string`." The nice benefit: because the keys must be `SimpleCapStatus` values, the type-checker
  **forces** you to provide a label for _all three_ statuses — you can't accidentally forget one.
- `CAP_STATUS_LABEL` holds the short button-text label; `CAP_STATUS_DESCRIPTION` holds a longer
  sentence explaining what that status means for the user. (The screen shows the label, and the
  description when they want more detail.)

---

## Part 3 — the machine that picks the label

```ts
export function simplifyCapStatus(level: ApronLevel): SimpleCapStatus {
  if (level === ApronLevel.UNDER_CAP) return "UNDER_CAP";
  if (level === ApronLevel.BETWEEN_CAP_AND_TAX) return "OVER_CAP";
  return "LUXURY_TAX"; // TAXPAYER | FIRST_APRON | SECOND_APRON
}
```

- `simplifyCapStatus(level: ApronLevel): SimpleCapStatus` — takes one of the five internal tiers
  and hands back one of the three simple statuses.
- `if (level === ApronLevel.UNDER_CAP) return "UNDER_CAP";` — if the team is under the cap, the
  simple status is `"UNDER_CAP"`. (`===` = "exactly equal to.")
- `if (level === ApronLevel.BETWEEN_CAP_AND_TAX) return "OVER_CAP";` — the "over the cap but under
  the tax" tier becomes the simple `"OVER_CAP"`.
- `return "LUXURY_TAX";` — this last line has no `if`, so it catches **everything else.** The
  comment `// TAXPAYER | FIRST_APRON | SECOND_APRON` reminds us which three tiers fall here: all
  three "high spending" tiers get squished into one friendly `"LUXURY_TAX"` label. A casual player
  doesn't need to know the difference between "first apron" and "second apron" on the dashboard —
  they just need to know they're spending a lot.

---

## Zooming out

This is a common, healthy pattern you'll see throughout the codebase: **keep the detailed truth
inside, show a simplified version outside.** The five-tier `ApronLevel` still drives every real
rule (what trades are legal, which exceptions you can use). This file _only_ decides the words on
the screen — so the user gets a clean three-way summary without the underlying logic being dumbed
down at all.

**Next file:** `cap/multiYearProjection.md` — projecting how much of _future_ seasons a team has
already committed to.
