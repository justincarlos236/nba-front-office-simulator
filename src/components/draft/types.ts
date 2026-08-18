import type { TeamIdentity } from "@/lib/gm/teamIdentity";
import type { TeamNeed } from "@/lib/gm/teamNeeds";
import type { ProspectPathway } from "@/lib/draft/prospectBio";
import type { ClassCharacter } from "@/lib/draft/classCharacter";

export interface DraftPickInfo {
  id: string;
  round: number;
  overallPickNumber: number;
  leagueTeamId: string;
  selectedProspectId: string | null;
}

export interface DraftProspectInfo {
  id: string;
  fullName: string;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  age: number;
  overallRating: number;
  potentialRating: number;
  heightInches: number | null;
  weightLbs: number | null;
  collegeOrTeam: string | null;
  isInternational: boolean;
  nationality: string | null;
  /** Scouting Pillar Redesign - how this prospect entered the draft. */
  pathway: ProspectPathway | null;
  comparisonPlayerName: string | null;
  /** Scouting Pillar Redesign - 0 (Unknown) to 3 (Known). */
  scoutingDepth: number;
  /** Scouting Pillar Redesign - which hidden-trait axes a Private Workout has resolved outright. */
  resolvedHiddenTraits: string[];
  /** Scouting Pillar Redesign - this class's rolled character, identical across every prospect in the same league+season. */
  classCharacter: ClassCharacter;
}

export interface DraftTeamInfo {
  city: string;
  name: string;
  logoUrl: string | null;
  /** Real brand colours - the team on the clock owns the Broadcast frame. */
  primaryColor: string | null;
  secondaryColor: string | null;
}

export interface DraftTeamContextInfo {
  identity: TeamIdentity;
  needs: TeamNeed[];
}

export function formatHeight(heightInches: number | null): string | null {
  if (heightInches == null) return null;
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;
  return `${feet}'${inches}"`;
}

export function teamLabel(teamsById: Record<string, DraftTeamInfo>, id: string): string {
  const t = teamsById[id];
  return t ? `${t.city} ${t.name}` : "Unknown team";
}
