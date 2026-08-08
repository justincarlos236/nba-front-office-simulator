export function AuthField({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink-muted">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-[2px] border border-rule bg-raised px-3 py-2 text-ink outline-none focus:border-team-accent"
      />
    </label>
  );
}
