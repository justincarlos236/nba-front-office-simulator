const SIZE_CLASS = {
  sm: "h-6 w-6",
  md: "h-10 w-10",
  lg: "h-20 w-20",
  xl: "h-28 w-28",
} as const;

export function TeamBadge({
  logoUrl,
  size = "md",
  faded = false,
}: {
  logoUrl: string | null;
  size?: keyof typeof SIZE_CLASS;
  faded?: boolean;
}) {
  if (!logoUrl) {
    return <div className={`${SIZE_CLASS[size]} shrink-0 rounded-full bg-raised`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt=""
      className={`${SIZE_CLASS[size]} shrink-0 object-contain transition ${faded ? "opacity-30" : ""}`}
    />
  );
}
