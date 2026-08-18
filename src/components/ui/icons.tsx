import type { SVGProps } from "react";

/**
 * THE WIRE - the icon set.
 *
 * The audit found exactly two SVGs in the entire component tree, both trivial
 * close buttons. Every category, status and action in the product was a word
 * in a row of words, which is the single biggest reason the interface read as
 * a document system rather than a game.
 *
 * Grammar, held without exception so twenty glyphs read as one hand:
 *   - 16x16 viewBox, drawn on a 2px grid
 *   - 1.5 stroke, butt caps, miter joins - the same hairline weight as the
 *     rule tokens, so an icon sits on a line without shouting
 *   - `currentColor` only; an icon never carries its own colour, it inherits
 *     the semantic tone of whatever labels it
 *   - geometric, never rounded-friendly: Archivo is a grotesque with square
 *     shoulders and the icons match it
 *   - no fills except where a shape is genuinely solid (the ball, a stamp)
 *
 * Deliberately not an icon library. Lucide/Heroicons are rounded, generic and
 * instantly recognisable as someone else's system; the point of drawing these
 * is that they belong to this product.
 */

export type IconProps = SVGProps<SVGSVGElement> & {
  /** Rendered size in px. Defaults to 16, the inline-with-label size. */
  size?: number;
};

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   TRANSACTIONS - the wire's own vocabulary
--------------------------------------------------------------------------- */

/** Two assets crossing in opposite directions. */
export function IconTrade(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 5h9M8 2l3 3-3 3" />
      <path d="M14 11H5M8 14l-3-3 3-3" />
    </Icon>
  );
}

/** A pen nib over a signature line - a deal being signed, not a plus sign. */
export function IconSigning(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 14h12" />
      <path d="M4 11 11 4l2 2-7 7H4v-2Z" />
    </Icon>
  );
}

/** A medical cross in a frame. */
export function IconInjury(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" />
      <path d="M8 5.5v5M5.5 8h5" />
    </Icon>
  );
}

/** A draft podium with the class stepping up to it. */
export function IconDraft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 14h12" />
      <path d="M3 14V9h3v5M6.5 14V5h3v9M10 14V7h3v7" />
    </Icon>
  );
}

/** A hanging banner - award, honour, retired number. */
export function IconAward(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 2h8v9l-4-2.5L4 11V2Z" />
      <path d="M6 13.5h4" />
    </Icon>
  );
}

/** An open door - a career ending, a player walking away. */
export function IconRetirement(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 2h6v12H2z" />
      <path d="M8 8h6M11.5 5.5 14 8l-2.5 2.5" />
    </Icon>
  );
}

/** A clipboard - staff, hires, the coaching side. */
export function IconStaff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3h10v11H3z" />
      <path d="M6 3V1.5h4V3" />
      <path d="M5.5 7h5M5.5 10h3" />
    </Icon>
  );
}

/** Rotating arrows - the depth chart being reordered. */
export function IconRotation(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13.5 2v3.5H10" />
    </Icon>
  );
}

/* ---------------------------------------------------------------------------
   THE GAME
--------------------------------------------------------------------------- */

/** A basketball: circle plus the two real seam lines, not a generic ball. */
export function IconBall(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2v12" />
      <path d="M3.6 3.6c2.6 2.6 2.6 6.2 0 8.8M12.4 3.6c-2.6 2.6-2.6 6.2 0 8.8" />
    </Icon>
  );
}

/** A hoop and net, seen head on. */
export function IconHoop(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3v3M13 3v3M3 4.5h10" />
      <path d="M4.5 6.5 8 13l3.5-6.5" />
      <path d="M6.5 6.5 8 13M9.5 6.5 8 13" />
    </Icon>
  );
}

/** An ascending streak line with its peak marked. */
export function IconStreak(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 12l3.5-4 3 2.5L14 4" />
      <path d="M10.5 4H14v3.5" />
    </Icon>
  );
}

/** A milestone marker planted on a line. */
export function IconMilestone(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 14V2" />
      <path d="M4 2.5h8l-2 2.5 2 2.5H4" />
    </Icon>
  );
}

/** A whistle-blast arc pair - a game result. */
export function IconGame(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4.5" width="11" height="7" />
      <path d="M8 4.5v7M2.5 8h11" />
    </Icon>
  );
}

/* ---------------------------------------------------------------------------
   THE FRONT OFFICE
--------------------------------------------------------------------------- */

/** A ledger sheet with ruled lines - finances, the cap sheet. */
export function IconLedger(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 2h10v12H3z" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </Icon>
  );
}

/** A sealed letter - ownership speaking to you. */
export function IconOwnership(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 4h12v8H2z" />
      <path d="m2 4.5 6 4 6-4" />
    </Icon>
  );
}

/** Stands full of people - the fanbase. */
export function IconFans(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 13h12" />
      <path d="M3 13v-2.5h3V13M6.5 13V8h3v5M10 13v-3.5h3V13" />
      <circle cx="4.5" cy="8.5" r="1.25" />
      <circle cx="8" cy="5.5" r="1.25" />
      <circle cx="11.5" cy="7.5" r="1.25" />
    </Icon>
  );
}

/** A player's morale as a figure - the human side of the roster. */
export function IconMorale(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3 14v-1a5 5 0 0 1 10 0v1" />
    </Icon>
  );
}

/** A magnifying lens over a board - scouting. */
export function IconScout(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </Icon>
  );
}

/* ---------------------------------------------------------------------------
   STATE AND AUTHORITY
--------------------------------------------------------------------------- */

/** A rising threshold bar - the apron, a cap line being approached. */
export function IconThreshold(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 14h12" />
      <path d="M2 10.5h12" strokeDasharray="2 2" />
      <path d="M4.5 14V8M8 14V5M11.5 14v-2.5" />
    </Icon>
  );
}

/** The league office ruling: a struck-through seal. */
export function IconRuling(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="m4.5 11.5 7-7" />
    </Icon>
  );
}

/** A warning triangle, for a caution-level state. */
export function IconCaution(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2 14.5 13.5h-13L8 2Z" />
      <path d="M8 6.5v3.5M8 11.75v.5" />
    </Icon>
  );
}

/** A trophy - the point of the whole save. */
export function IconTrophy(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 2h7v4a3.5 3.5 0 0 1-7 0V2Z" />
      <path d="M4.5 3.5H2.5V5a2 2 0 0 0 2 2M11.5 3.5h2V5a2 2 0 0 1-2 2" />
      <path d="M8 9.5V12M5.5 14h5M6.5 12h3v2h-3z" />
    </Icon>
  );
}

/* ---------------------------------------------------------------------------
   NAVIGATION - the four sections that carry a glyph
--------------------------------------------------------------------------- */

/**
 * A jersey, for the roster.
 *
 * A generic pair of silhouetted people would have said "users" the way every
 * admin dashboard does. The set already speaks basketball (`IconBall`,
 * `IconHoop`), and a jersey is the one garment that means *squad* rather than
 * *people* - which is what a roster is.
 */
export function IconJersey(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 2h4l3 2-1 2-1-1v9H5V5L4 6 3 4l3-2Z" />
      <path d="M6.5 2 8 3.5 9.5 2" />
    </Icon>
  );
}

/**
 * Ranked bars descending, for the standings.
 *
 * Deliberately not `IconThreshold`, which is also bars but carries a dashed
 * line across them - that dash means a *cap* threshold and would be a lie
 * here. These descend monotonically, which is the shape of a table sorted by
 * record rather than a chart with a limit drawn on it.
 */
export function IconStandings(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 14h12" />
      <path d="M4.5 14V4M8 14V7M11.5 14v-3" />
    </Icon>
  );
}

/** A calendar/phase marker - where the season is. */
export function IconSeason(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="3.5" width="11" height="10" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </Icon>
  );
}

/** Filing/archive drawer - history, the record. */
export function IconArchive(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 3h12v3H2z" />
      <path d="M3 6v8h10V6" />
      <path d="M6.5 9h3" />
    </Icon>
  );
}

/* ---------------------------------------------------------------------------
   Transaction-type registry. Keyed to the same TransactionType values the
   news wire already uses, so a row's icon is derived from real data rather
   than assigned by hand at each call site.
--------------------------------------------------------------------------- */

export const TRANSACTION_ICON: Record<string, (p: IconProps) => React.ReactElement> = {
  TRADE: IconTrade,
  SIGNING: IconSigning,
  STAFF_HIRE: IconStaff,
  STAFF_FIRE: IconStaff,
  ALL_STAR_SELECTION: IconAward,
  ALL_STAR_SNUB: IconAward,
  ALL_STAR_RESULT: IconAward,
  ROTATION_CHANGE: IconRotation,
  DRAFT_LOTTERY: IconDraft,
  DRAFT_SELECTION: IconDraft,
  RETIREMENT: IconRetirement,
  INJURY: IconInjury,
  OWNERSHIP_MESSAGE: IconOwnership,
  GAME_MILESTONE: IconMilestone,
  WIN_STREAK: IconStreak,
  GAME_RESULT: IconGame,
  AWARD: IconAward,
  PLAYER_MORALE: IconMorale,
  FINANCIAL_REPORT: IconLedger,
  FRANCHISE_MILESTONE: IconTrophy,
};
