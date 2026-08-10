import Link from "next/link";
import type { ReactNode } from "react";

/**
 * THE WIRE - the primitive layer. See DESIGN.md.
 *
 * The previous system had no primitives at all: consistency came from
 * retyping utility strings, which is precisely why colour and radius held
 * while focus states and status colours drifted (294 raw Tailwind colour uses
 * across 12 hues, and zero `focus-visible` declarations product-wide).
 *
 * Every visual decision that DESIGN.md makes binding lives here, once.
 */

/* -------------------------------------------------------------------------
   LABEL - the organising device of the whole system.
   11px, 600, 0.09em, uppercase. Every field, column and status carries one.
------------------------------------------------------------------------- */

export function Label({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "ink";
  className?: string;
}) {
  const color =
    tone === "accent" ? "text-team-accent" : tone === "ink" ? "text-ink" : "text-ink-muted";
  return (
    <p
      className={`text-[11px] leading-none font-semibold tracking-[0.09em] uppercase ${color} ${className}`}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------
   FIELD - the replacement for the card.
   A section of a document: ruled top edge, tracked label, no radius, no
   shadow, no border on all four sides. A field is part of a page, not an
   object floating on it.
------------------------------------------------------------------------- */

export function Field({
  label,
  children,
  className = "",
  emphasis = false,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
  /** Draws the top rule in the team accent - for the one field that leads a surface. */
  emphasis?: boolean;
}) {
  return (
    <section
      className={`border-t bg-field p-6 ${emphasis ? "border-team-accent" : "border-rule"} ${className}`}
    >
      {label && <Label className="mb-3">{label}</Label>}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------
   STAT CELL - enforces The Mono-For-Money Rule so it stops being discipline
   and starts being a component.
------------------------------------------------------------------------- */

export function StatCell({
  label,
  value,
  note,
  tone = "ink",
  size = "base",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "ink" | "accent" | "positive" | "caution" | "negative" | "signal";
  size?: "base" | "display";
}) {
  const color = {
    ink: "text-ink",
    accent: "text-team-accent",
    positive: "text-positive",
    caution: "text-caution",
    negative: "text-negative",
    signal: "text-signal-red",
  }[tone];
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <p
        className={`mt-2 truncate font-mono tabular-nums ${color} ${
          size === "display"
            ? "text-[clamp(2rem,4vw,3rem)] leading-none font-medium tracking-[-0.03em]"
            : "text-[15px] leading-tight"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------
   STATUS - text-only semantic label. Replaces four separate badge-class maps
   that had introduced sky and purple as *category* colours, violating the
   system's own semantic rule.
------------------------------------------------------------------------- */

export type StatusTone = "positive" | "caution" | "negative" | "signal" | "neutral";

export function Status({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const color = {
    positive: "text-positive",
    caution: "text-caution",
    negative: "text-negative",
    // The league office ruling on you - never an ordinary validation error.
    signal: "text-signal-red",
    neutral: "text-ink-muted",
  }[tone];
  return (
    <span className={`text-[11px] font-semibold tracking-[0.09em] uppercase ${color}`}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------
   BUTTONS - three variants. Focus rings come from the global :focus-visible
   rule in globals.css, so no variant can forget one.
------------------------------------------------------------------------- */

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-[2px] px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] uppercase transition-[opacity,background-color] duration-120 ease-[cubic-bezier(0.2,0,0,1)] disabled:cursor-not-allowed disabled:opacity-40";

const BUTTON_VARIANT = {
  primary: "bg-team-accent text-team-accent-ink hover:opacity-[0.88]",
  secondary: "border border-rule text-ink hover:bg-raised",
  /** League-office severity only. */
  danger: "border border-signal-red text-signal-red hover:bg-signal-red/10",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  href,
  children,
  prefetch,
}: {
  variant?: ButtonVariant;
  className?: string;
  href: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------
   RULE - structure, at the three documented weights. hairline is decorative
   only and may never be the sole carrier of meaning (it measures 1.54:1).
------------------------------------------------------------------------- */

export function Rule({
  weight = "rule",
  className = "",
}: {
  weight?: "hairline" | "rule" | "strong";
  className?: string;
}) {
  const color = {
    hairline: "border-hairline",
    rule: "border-rule",
    strong: "border-rule-strong",
  }[weight];
  return <hr className={`border-t ${color} ${className}`} />;
}

/* -------------------------------------------------------------------------
   PHASE INDICATOR - the save states where it is.
   The previous system computed five phases, gated six systems on them, and
   never named the phase anywhere inside a league.
------------------------------------------------------------------------- */

export function PhaseIndicator({
  phase,
  expectation,
  className = "",
}: {
  phase: string;
  expectation: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-y border-rule py-2 text-[11px] font-semibold tracking-[0.09em] uppercase ${className}`}
    >
      <span className="text-team-accent">{phase}</span>
      <span aria-hidden="true" className="text-rule">
        /
      </span>
      <span className="text-ink-muted">{expectation}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------
   INPUT - focus swaps the border AND keeps the global ring. The previous
   system removed the native outline and relied on a 1.30:1 border change.
------------------------------------------------------------------------- */

export function TextInput({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <Label className="mb-2">{label}</Label>}
      <input
        className={`w-full rounded-[2px] border border-rule bg-raised px-3 py-2 font-mono text-[15px] tabular-nums text-ink transition-colors duration-120 placeholder:text-ink-muted/60 focus:border-rule-strong ${className}`}
        {...props}
      />
    </label>
  );
}

/* -------------------------------------------------------------------------
   DATA TABLE - the Ledger primitive.
------------------------------------------------------------------------- */

export function DataTable({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-[15px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  numeric = false,
  className = "",
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-rule bg-raised px-3 py-2.5 text-[11px] font-semibold tracking-[0.09em] whitespace-nowrap text-ink-muted uppercase ${
        numeric ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  numeric?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-hairline px-3 py-2.5 text-ink ${
        numeric ? "text-right font-mono tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}
