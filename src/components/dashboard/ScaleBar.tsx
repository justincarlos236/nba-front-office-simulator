/**
 * A small 0-100 baseline indicator (Onboarding Philosophy Phase 3 - see
 * docs/ONBOARDING_DESIGN.md Part 4.5, "numbers without baselines"). Marks
 * where a value actually sits between 0 and 100, so a bare number like
 * Fan Happiness or Franchise Popularity reads at a glance without needing
 * to already know the scale.
 */
export function ScaleBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-surface-2">
      <div
        className="h-1.5 rounded-full bg-accent transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
