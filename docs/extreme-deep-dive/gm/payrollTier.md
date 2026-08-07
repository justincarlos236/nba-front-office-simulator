# `gm/payrollTier.ts` — bucketing spending into four tiers

**What this whole file is about:** the owner's expectations depend partly on how much you're spending.
But the five apron levels are more detail than the expectation system needs, so this tiny file collapses
them into four coarser spending tiers: modest, moderate, significant, extreme.

Open the real file: `src/lib/gm/payrollTier.ts`. It's a one-function file.

---

## The whole file

```ts
import { ApronLevel } from "../cap/apron";

export type PayrollTier = "MODEST" | "MODERATE" | "SIGNIFICANT" | "EXTREME";

export const PAYROLL_TIER_LABEL: Record<PayrollTier, string> = {
  MODEST: "Modest payroll",
  MODERATE: "Moderate payroll",
  SIGNIFICANT: "Significant luxury tax",
  EXTREME: "Extreme payroll",
};

export function computePayrollTier(apronLevel: ApronLevel): PayrollTier {
  switch (apronLevel) {
    case ApronLevel.UNDER_CAP:
      return "MODEST";
    case ApronLevel.BETWEEN_CAP_AND_TAX:
      return "MODERATE";
    case ApronLevel.TAXPAYER:
      return "SIGNIFICANT";
    case ApronLevel.FIRST_APRON:
    case ApronLevel.SECOND_APRON:
      return "EXTREME";
  }
}
```

- It imports the five-tier `ApronLevel` (from `cap/apron.md`).
- `PayrollTier` — a string-literal union of the four tiers. `PAYROLL_TIER_LABEL` is the display-text
  lookup table.
- `computePayrollTier(apronLevel)` — a `switch` that maps each apron level to a tier:
  - Under the cap → **MODEST** (cheap).
  - Over the cap but under the tax → **MODERATE**.
  - Over the tax line → **SIGNIFICANT** (paying real tax).
  - First apron **or** second apron → **EXTREME**. (Remember stacked `case` labels share the code below,
    so both apron levels return `"EXTREME"`.)

**Why collapse five into four?** The expectation system just needs to know roughly how much you're
spending — it doesn't care about the fine distinction between "first apron" and "second apron" (those
matter for _trade rules_, not for how demanding the owner is). So this gives it a cleaner four-way split.
It's a coarser version of the three-way `simplifyCapStatus` from `capStatusLabel.md` — different display
needs, different groupings, same underlying apron level.

---

## Zooming out

A one-line-per-case translator: apron level in, spending tier out. The next file uses this tier to help
decide what the owner expects of you each season.

**Next file:** `gm/expectationLevel.md` — turning your spending tier and roster quality into a preseason
expectation.
