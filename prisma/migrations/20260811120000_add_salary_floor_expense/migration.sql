-- The CBA minimum-team-salary shortfall a team paid out to its players.
--
-- Kept as its own expense bucket rather than folded into payroll_expense_cents:
-- payroll is the cap-sheet figure and has to keep matching the cap engine, and
-- this is money that leaves the franchise without ever being a cap charge.
--
-- Additive with a 0 default, matching how other_expense_cents and
-- interest_expense_cents were added. Nothing is backfilled, and 0 is the
-- correct historical value - no salary floor was enforced before this season,
-- so no team ever paid a shortfall.
ALTER TABLE "financial_snapshots"
  ADD COLUMN "salaryFloorExpenseCents" BIGINT NOT NULL DEFAULT 0;
