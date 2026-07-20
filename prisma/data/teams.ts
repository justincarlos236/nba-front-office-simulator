/**
 * Static NBA team reference data. Unlike players/stats, this doesn't need
 * to come from a live API — the 30 teams, their conferences/divisions, and
 * brand colors are effectively fixed and well documented, so hardcoding
 * them here avoids an unnecessary external dependency for data that almost
 * never changes.
 */
export interface TeamSeed {
  abbreviation: string;
  // Wikipedia's infobox logo thumbnail (upload.wikimedia.org), not
  // copied/hosted here, just linked. NBA.com's own logo CDN
  // (cdn.nba.com) was tried first but reliably failed to load in
  // production - see docs/ARCHITECTURE.md.
  logoUrl: string;
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
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/8/8f/Boston_Celtics.svg/330px-Boston_Celtics.svg.png",
    name: "Celtics",
    city: "Boston",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#007A33",
    secondaryColor: "#BA9653",
  },
  {
    abbreviation: "BKN",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/4/40/Brooklyn_Nets_primary_icon_logo_2024.svg/330px-Brooklyn_Nets_primary_icon_logo_2024.svg.png",
    name: "Nets",
    city: "Brooklyn",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#000000",
    secondaryColor: "#FFFFFF",
  },
  {
    abbreviation: "NYK",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/25/New_York_Knicks_logo.svg/330px-New_York_Knicks_logo.svg.png",
    name: "Knicks",
    city: "New York",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#006BB6",
    secondaryColor: "#F58426",
  },
  {
    abbreviation: "PHI",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/0/0e/Philadelphia_76ers_logo.svg/330px-Philadelphia_76ers_logo.svg.png",
    name: "76ers",
    city: "Philadelphia",
    conference: "EAST",
    division: "Atlantic",
    primaryColor: "#006BB6",
    secondaryColor: "#ED174C",
  },
  {
    abbreviation: "TOR",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/3/36/Toronto_Raptors_logo.svg/330px-Toronto_Raptors_logo.svg.png",
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
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Chicago_Bulls_logo.svg/330px-Chicago_Bulls_logo.svg.png",
    name: "Bulls",
    city: "Chicago",
    conference: "EAST",
    division: "Central",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "CLE",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Cleveland_Cavaliers_logo.svg/330px-Cleveland_Cavaliers_logo.svg.png",
    name: "Cavaliers",
    city: "Cleveland",
    conference: "EAST",
    division: "Central",
    primaryColor: "#860038",
    secondaryColor: "#FDBB30",
  },
  {
    abbreviation: "DET",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Logo_of_the_Detroit_Pistons.svg/330px-Logo_of_the_Detroit_Pistons.svg.png",
    name: "Pistons",
    city: "Detroit",
    conference: "EAST",
    division: "Central",
    primaryColor: "#1D42BA",
    secondaryColor: "#C8102E",
  },
  {
    abbreviation: "IND",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/1/1b/Indiana_Pacers.svg/330px-Indiana_Pacers.svg.png",
    name: "Pacers",
    city: "Indiana",
    conference: "EAST",
    division: "Central",
    primaryColor: "#002D62",
    secondaryColor: "#FDBB30",
  },
  {
    abbreviation: "MIL",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/4/4a/Milwaukee_Bucks_logo.svg/330px-Milwaukee_Bucks_logo.svg.png",
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
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/24/Atlanta_Hawks_logo.svg/330px-Atlanta_Hawks_logo.svg.png",
    name: "Hawks",
    city: "Atlanta",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#E03A3E",
    secondaryColor: "#C1D32F",
  },
  {
    abbreviation: "CHA",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/c/c4/Charlotte_Hornets_%282014%29.svg/330px-Charlotte_Hornets_%282014%29.svg.png",
    name: "Hornets",
    city: "Charlotte",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#00788C",
    secondaryColor: "#1D1160",
  },
  {
    abbreviation: "MIA",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/f/fb/Miami_Heat_logo.svg/330px-Miami_Heat_logo.svg.png",
    name: "Heat",
    city: "Miami",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#98002E",
    secondaryColor: "#F9A01B",
  },
  {
    abbreviation: "ORL",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/1/10/Orlando_Magic_logo.svg/330px-Orlando_Magic_logo.svg.png",
    name: "Magic",
    city: "Orlando",
    conference: "EAST",
    division: "Southeast",
    primaryColor: "#0077C0",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "WAS",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/0/02/Washington_Wizards_logo.svg/330px-Washington_Wizards_logo.svg.png",
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
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/7/76/Denver_Nuggets.svg/330px-Denver_Nuggets.svg.png",
    name: "Nuggets",
    city: "Denver",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#0E2240",
    secondaryColor: "#FEC524",
  },
  {
    abbreviation: "MIN",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/c/c2/Minnesota_Timberwolves_logo.svg/330px-Minnesota_Timberwolves_logo.svg.png",
    name: "Timberwolves",
    city: "Minnesota",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#0C2340",
    secondaryColor: "#236192",
  },
  {
    abbreviation: "OKC",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/5/5d/Oklahoma_City_Thunder.svg/330px-Oklahoma_City_Thunder.svg.png",
    name: "Thunder",
    city: "Oklahoma City",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#007AC1",
    secondaryColor: "#EF3B24",
  },
  {
    abbreviation: "POR",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/21/Portland_Trail_Blazers_logo.svg/330px-Portland_Trail_Blazers_logo.svg.png",
    name: "Trail Blazers",
    city: "Portland",
    conference: "WEST",
    division: "Northwest",
    primaryColor: "#E03A3E",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "UTA",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/7/77/Utah_Jazz_logo_2025.svg/330px-Utah_Jazz_logo_2025.svg.png",
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
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/0/01/Golden_State_Warriors_logo.svg/330px-Golden_State_Warriors_logo.svg.png",
    name: "Warriors",
    city: "Golden State",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#1D428A",
    secondaryColor: "#FFC72C",
  },
  {
    abbreviation: "LAC",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/e/ed/Los_Angeles_Clippers_%282024%29.svg/330px-Los_Angeles_Clippers_%282024%29.svg.png",
    name: "Clippers",
    city: "LA",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#C8102E",
    secondaryColor: "#1D428A",
  },
  {
    abbreviation: "LAL",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Los_Angeles_Lakers_logo.svg/330px-Los_Angeles_Lakers_logo.svg.png",
    name: "Lakers",
    city: "Los Angeles",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#552583",
    secondaryColor: "#FDB927",
  },
  {
    abbreviation: "PHX",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/d/dc/Phoenix_Suns_logo.svg/330px-Phoenix_Suns_logo.svg.png",
    name: "Suns",
    city: "Phoenix",
    conference: "WEST",
    division: "Pacific",
    primaryColor: "#1D1160",
    secondaryColor: "#E56020",
  },
  {
    abbreviation: "SAC",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/SacramentoKings.svg/330px-SacramentoKings.svg.png",
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
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/9/97/Dallas_Mavericks_logo.svg/330px-Dallas_Mavericks_logo.svg.png",
    name: "Mavericks",
    city: "Dallas",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#00538C",
    secondaryColor: "#002B5E",
  },
  {
    abbreviation: "HOU",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/2/28/Houston_Rockets.svg/330px-Houston_Rockets.svg.png",
    name: "Rockets",
    city: "Houston",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#CE1141",
    secondaryColor: "#000000",
  },
  {
    abbreviation: "MEM",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/f/f1/Memphis_Grizzlies.svg/330px-Memphis_Grizzlies.svg.png",
    name: "Grizzlies",
    city: "Memphis",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#5D76A9",
    secondaryColor: "#F5B112",
  },
  {
    abbreviation: "NOP",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/0/0d/New_Orleans_Pelicans_logo.svg/330px-New_Orleans_Pelicans_logo.svg.png",
    name: "Pelicans",
    city: "New Orleans",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#0C2340",
    secondaryColor: "#C8102E",
  },
  {
    abbreviation: "SAS",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/a/a2/San_Antonio_Spurs.svg/330px-San_Antonio_Spurs.svg.png",
    name: "Spurs",
    city: "San Antonio",
    conference: "WEST",
    division: "Southwest",
    primaryColor: "#000000",
    secondaryColor: "#C4CED4",
  },
];
