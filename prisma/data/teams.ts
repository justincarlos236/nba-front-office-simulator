/**
 * Static NBA team reference data. Unlike players/stats, this doesn't need
 * to come from a live API — the 30 teams, their conferences/divisions, and
 * brand colors are effectively fixed and well documented, so hardcoding
 * them here avoids an unnecessary external dependency for data that almost
 * never changes.
 */
export interface TeamSeed {
  abbreviation: string;
  name: string;
  city: string;
  conference: "EAST" | "WEST";
  division: string;
  primaryColor: string;
  secondaryColor: string;
}

export const TEAM_SEEDS: readonly TeamSeed[] = [
  // Eastern Conference — Atlantic
  {
    abbreviation: "BOS",
    name: "Celtics",
    city: "Boston",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#007A33",
    secondaryColor: "#BA9653",
  },
  {
    abbreviation: "BKN",
    name: "Nets",
    city: "Brooklyn",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#000000",
    secondaryColor: "#FFFFFF",
  },
  {
    abbreviation: "NYK",
    name: "Knicks",
    city: "New York",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#006BB6",
    secondaryColor: "#F58426",
  },
  {
    abbreviation: "PHI",
    name: "76ers",
    city: "Philadelphia",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#006BB6",
    secondaryColor: "#ED174C",
  },
  {
    abbreviation: "TOR",
    name: "Raptors",
    city: "Toronto",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
  },

  // Eastern Conference — Central
  {
    abbreviation: "CHI",
    name: "Bulls",
    city: "Chicago",
    conference: "EAST",
    division: "Central",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "CLE",
    name: "Cavaliers",
    city: "Cleveland",
    conference: "EAST",
    division: "Central",
    primaryColor: "#860038",
    secondaryColor: "#FDBB30",
  },
  {
    abbreviation: "DET",
    name: "Pistons",
    city: "Detroit",
    conference: "EAST",
    division: "Central",
    primaryColor: "#1D42BA",
    secondaryColor: "#C8102E",
  },
  {
    abbreviation: "IND",
    name: "Pacers",
    city: "Indiana",
    conference: "EAST",
    division: "Central",
    primaryColor: "#002D62",
    secondaryColor: "#FDBB30",
  },
  {
    abbreviation: "MIL",
    name: "Bucks",
    city: "Milwaukee",
    conference: "EAST",
    division: "Central",
    primaryColor: "#00471B",
    secondaryColor: "#EEE1C6",
  },

  // Eastern Conference — Southeast
  {
    abbreviation: "ATL",
    name: "Hawks",
    city: "Atlanta",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#E03A3E",
    secondaryColor: "#C1D32F",
  },
  {
    abbreviation: "CHA",
    name: "Hornets",
    city: "Charlotte",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#00788C",
    secondaryColor: "#1D1160",
  },
  {
    abbreviation: "MIA",
    name: "Heat",
    city: "Miami",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#98002E",
    secondaryColor: "#F9A01B",
  },
  {
    abbreviation: "ORL",
    name: "Magic",
    city: "Orlando",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#0077C0",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "WAS",
    name: "Wizards",
    city: "Washington",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#E31837",
    secondaryColor: "#002B5C",
  },

  // Western Conference — Northwest
  {
    abbreviation: "DEN",
    name: "Nuggets",
    city: "Denver",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#0E2240",
    secondaryColor: "#FEC524",
  },
  {
    abbreviation: "MIN",
    name: "Timberwolves",
    city: "Minnesota",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#0C2340",
    secondaryColor: "#236192",
  },
  {
    abbreviation: "OKC",
    name: "Thunder",
    city: "Oklahoma City",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#007AC1",
    secondaryColor: "#EF3B24",
  },
  {
    abbreviation: "POR",
    name: "Trail Blazers",
    city: "Portland",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#E03A3E",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "UTA",
    name: "Jazz",
    city: "Utah",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#002B5C",
    secondaryColor: "#F9A01B",
  },

  // Western Conference — Pacific
  {
    abbreviation: "GSW",
    name: "Warriors",
    city: "Golden State",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#1D428A",
    secondaryColor: "#FFC72C",
  },
  {
    abbreviation: "LAC",
    name: "Clippers",
    city: "LA",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#C8102E",
    secondaryColor: "#1D428A",
  },
  {
    abbreviation: "LAL",
    name: "Lakers",
    city: "Los Angeles",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#552583",
    secondaryColor: "#FDB927",
  },
  {
    abbreviation: "PHX",
    name: "Suns",
    city: "Phoenix",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#1D1160",
    secondaryColor: "#E56020",
  },
  {
    abbreviation: "SAC",
    name: "Kings",
    city: "Sacramento",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#5A2D81",
    secondaryColor: "#63727A",
  },

  // Western Conference — Southwest
  {
    abbreviation: "DAL",
    name: "Mavericks",
    city: "Dallas",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#00538C",
    secondaryColor: "#002B5E",
  },
  {
    abbreviation: "HOU",
    name: "Rockets",
    city: "Houston",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "MEM",
    name: "Grizzlies",
    city: "Memphis",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#5D76A9",
    secondaryColor: "#F5B112",
  },
  {
    abbreviation: "NOP",
    name: "Pelicans",
    city: "New Orleans",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#0C2340",
    secondaryColor: "#C8102E",
  },
  {
    abbreviation: "SAS",
    name: "Spurs",
    city: "San Antonio",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#000000",
    secondaryColor: "#C4CED4",
  },
];
