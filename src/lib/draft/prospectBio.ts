import { getPlayerValueTier, type PlayerValueTier } from "../valuation/playerValueTier";

/**
 * Draft Experience Redesign - the richer scouting profile fields
 * (height/weight/origin/comparison), generated once per prospect
 * alongside the rest of `generateDraftClass.ts`'s output. Fictional
 * prospects only - see `prospectNames.ts` for the same "explicitly not
 * real people" principle this extends.
 */

type Position = "PG" | "SG" | "SF" | "PF" | "C";

export interface ProspectPhysicalProfile {
  heightInches: number;
  weightLbs: number;
}

// Rough real-world NBA ranges by position - flavor, not a claim about any
// specific real player.
const HEIGHT_RANGE_INCHES: Record<Position, [number, number]> = {
  PG: [72, 76],
  SG: [74, 78],
  SF: [76, 80],
  PF: [79, 83],
  C: [82, 87],
};
const WEIGHT_RANGE_LBS: Record<Position, [number, number]> = {
  PG: [175, 200],
  SG: [185, 215],
  SF: [200, 230],
  PF: [215, 250],
  C: [230, 270],
};

function randomIntInRange(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function generatePhysicalProfile(
  rng: () => number,
  position: Position,
): ProspectPhysicalProfile {
  const [heightMin, heightMax] = HEIGHT_RANGE_INCHES[position];
  const [weightMin, weightMax] = WEIGHT_RANGE_LBS[position];
  return {
    heightInches: randomIntInRange(rng, heightMin, heightMax),
    weightLbs: randomIntInRange(rng, weightMin, weightMax),
  };
}

/**
 * how a prospect actually entered the
 * draft, grounded in the four real pathways NBA prospects come from. Kept
 * here (not just in scoutingAssignments.ts) since it's meant to be a
 * durable part of the prospect's identity - see the ProspectPathway
 * comment in schema.prisma for how it's carried onto the real Player row
 * at Draft Night, not dropped there like the rest of this bio data
 * previously was.
 */
export type ProspectPathway =
  "POWER_CONFERENCE" | "MID_MAJOR" | "INTERNATIONAL_PROFESSIONAL" | "DEVELOPMENT_PATHWAY";

export const PROSPECT_PATHWAY_LABEL: Record<ProspectPathway, string> = {
  POWER_CONFERENCE: "Power Conference",
  MID_MAJOR: "Mid-Major",
  INTERNATIONAL_PROFESSIONAL: "International Professional",
  DEVELOPMENT_PATHWAY: "Development Pathway",
};

export const PROSPECT_PATHWAY_DESCRIPTION: Record<ProspectPathway, string> = {
  POWER_CONFERENCE:
    "A high-major program with the sport's biggest spotlight - heavily scouted from day one.",
  MID_MAJOR:
    "A smaller program that still produces real NBA talent (think Steph Curry at Davidson) - less national coverage means the public is slower to catch on.",
  INTERNATIONAL_PROFESSIONAL:
    "Already playing professionally overseas - real production against grown men, but far less visible to American scouts and media.",
  DEVELOPMENT_PATHWAY:
    "Skipped college entirely for a pro-style development program built around NBA preparation.",
};

export interface ProspectOrigin {
  collegeOrTeam: string;
  isInternational: boolean;
  nationality: string;
  pathway: ProspectPathway;
}

const POWER_CONFERENCE_COLLEGES = [
  "Duke",
  "Kentucky",
  "Kansas",
  "Gonzaga",
  "UCLA",
  "North Carolina",
  "Villanova",
  "Michigan State",
  "Arizona",
  "Baylor",
  "Houston",
  "Purdue",
  "Auburn",
  "Tennessee",
  "Alabama",
  "Connecticut",
  "Indiana",
  "Syracuse",
  "Memphis",
  "Texas",
];

// Real programs with real NBA draft precedent despite little national
// coverage - Steph Curry (Davidson), Damian Lillard (Weber State), and
// Ja Morant (Murray State) are the exact archetype this pathway models.
const MID_MAJOR_COLLEGES = [
  "Davidson",
  "Weber State",
  "Murray State",
  "Belmont",
  "Charleston",
  "Saint Mary's",
  "Drake",
  "Furman",
  "Yale",
  "Vermont",
];

const INTERNATIONAL_ORIGINS: { team: string; nationality: string }[] = [
  { team: "Real Madrid", nationality: "Spain" },
  { team: "FC Barcelona", nationality: "Spain" },
  { team: "Partizan", nationality: "Serbia" },
  { team: "Mega Basket", nationality: "Serbia" },
  { team: "Fenerbahce", nationality: "Turkey" },
  { team: "Ratiopharm Ulm", nationality: "Germany" },
  { team: "Cedevita Olimpija", nationality: "Slovenia" },
  { team: "Joventut Badalona", nationality: "Spain" },
  { team: "Melbourne United", nationality: "Australia" },
  { team: "Bahcesehir Koleji", nationality: "Turkey" },
];

// Fictional stand-ins for the real G League Ignite / Overtime Elite
// archetype - a pro-style program built specifically around NBA
// preparation, entered straight out of high school.
const DEVELOPMENT_PATHWAY_ORGS = [
  "NXT Prep Academy",
  "Elite Ascent Program",
  "Vanguard Basketball Collective",
];

// Most draft classes skew domestic-college, with real minorities of
// mid-major, international, and development-pathway prospects - same
// rough shape as an actual draft class.
const INTERNATIONAL_RATE = 0.2;
const MID_MAJOR_RATE = 0.18;
const DEVELOPMENT_PATHWAY_RATE = 0.07;

/**
 * `internationalRateMultiplier` (Scouting Pillar Redesign, Phase 4 - class
 * character variance) scales INTERNATIONAL_RATE for an INTERNATIONAL_HEAVY
 * class; capped so it can never exceed 0.6 - a class can lean
 * international, but every other pathway staying representable is what
 * makes "international-heavy" a real skew rather than a wipeout of the
 * other three pathways.
 */
export function generateOrigin(rng: () => number, internationalRateMultiplier = 1): ProspectOrigin {
  const internationalRate = Math.min(0.6, INTERNATIONAL_RATE * internationalRateMultiplier);
  const roll = rng();
  if (roll < internationalRate) {
    const origin = INTERNATIONAL_ORIGINS[Math.floor(rng() * INTERNATIONAL_ORIGINS.length)];
    return {
      collegeOrTeam: origin.team,
      isInternational: true,
      nationality: origin.nationality,
      pathway: "INTERNATIONAL_PROFESSIONAL",
    };
  }
  if (roll < internationalRate + DEVELOPMENT_PATHWAY_RATE) {
    const org = DEVELOPMENT_PATHWAY_ORGS[Math.floor(rng() * DEVELOPMENT_PATHWAY_ORGS.length)];
    return {
      collegeOrTeam: org,
      isInternational: false,
      nationality: "USA",
      pathway: "DEVELOPMENT_PATHWAY",
    };
  }
  if (roll < internationalRate + DEVELOPMENT_PATHWAY_RATE + MID_MAJOR_RATE) {
    const college = MID_MAJOR_COLLEGES[Math.floor(rng() * MID_MAJOR_COLLEGES.length)];
    return {
      collegeOrTeam: college,
      isInternational: false,
      nationality: "USA",
      pathway: "MID_MAJOR",
    };
  }
  const college = POWER_CONFERENCE_COLLEGES[Math.floor(rng() * POWER_CONFERENCE_COLLEGES.length)];
  return {
    collegeOrTeam: college,
    isInternational: false,
    nationality: "USA",
    pathway: "POWER_CONFERENCE",
  };
}

// Real-player scouting-opinion flavor, tiered by the prospect's own
// `potentialRating` (via the same `getPlayerValueTier` boundaries used
// everywhere else) and position group, so a fringe prospect is never
// compared to an all-time great. Always framed as subjective scouting
// opinion in the UI ("Scouts compare his game to..."), never a claim that
// the prospect IS that player - the same spirit as the sim already mixing
// real teams/cap rules with fictional players.
type PositionGroup = "GUARD" | "WING" | "BIG";

function positionGroup(position: Position): PositionGroup {
  if (position === "PG" || position === "SG") return "GUARD";
  if (position === "SF" || position === "PF") return "WING";
  return "BIG";
}

const COMPARISON_POOL: Record<PlayerValueTier, Record<PositionGroup, string[]>> = {
  SUPERSTAR: {
    GUARD: ["Stephen Curry", "Chris Paul", "Kyrie Irving"],
    WING: ["Kevin Durant", "LeBron James", "Paul George"],
    BIG: ["Nikola Jokic", "Joel Embiid", "Anthony Davis"],
  },
  STAR: {
    GUARD: ["Jrue Holiday", "Mike Conley", "Devin Booker"],
    WING: ["Jimmy Butler", "Khris Middleton", "DeMar DeRozan"],
    BIG: ["Bam Adebayo", "Domantas Sabonis", "Julius Randle"],
  },
  STARTER: {
    GUARD: ["Derrick White", "Tyus Jones", "Spencer Dinwiddie"],
    WING: ["OG Anunoby", "Harrison Barnes", "Royce O'Neale"],
    BIG: ["Jonas Valanciunas", "Brook Lopez", "Nikola Vucevic"],
  },
  ROTATION: {
    GUARD: ["Monte Morris", "Delon Wright", "Cory Joseph"],
    WING: ["Torrey Craig", "Maurice Harkless", "Wenyen Gabriel"],
    BIG: ["Mason Plumlee", "Thomas Bryant", "Damian Jones"],
  },
  MINIMUM: {
    GUARD: ["Duncan Robinson", "Garrison Mathews", "Theo Maledon"],
    WING: ["Justin Champagnie", "Kessler Edwards", "David Duke Jr."],
    BIG: ["Jay Huff", "Xavier Tillman", "Trevor Keels"],
  },
};

export function pickComparisonPlayerName(
  rng: () => number,
  position: Position,
  potentialRating: number,
): string {
  const tier = getPlayerValueTier(potentialRating);
  const pool = COMPARISON_POOL[tier][positionGroup(position)];
  return pool[Math.floor(rng() * pool.length)];
}
