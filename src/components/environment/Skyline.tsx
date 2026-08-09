/**
 * THE WIRE - franchise skylines. See DESIGN.md, Phase D.
 *
 * The view out of the front-office window. Thirty cities plus the three real
 * relocation destinations, drawn rather than photographed so they share one
 * hand and cannot break from a licence or a dead link.
 *
 * GRAMMAR, held across all of them - this matters far more than architectural
 * accuracy, and a coherent silhouette beats a literal one:
 *   - one 400x100 viewBox, baseline at y=100, drawn as a single filled path
 *   - flat-topped rectilinear masses by default; a curve, spire or arch is
 *     spent only where a city genuinely reads by it
 *   - buildings step from low at the edges to tall around the centre-left,
 *     so every city has the same visual weight distribution
 *   - two or three landmarks maximum. A skyline anyone can name from its
 *     outline is doing its job; a literal transcription is clip-art
 *   - no windows, no detail below the roofline, no ground clutter
 *
 * Rendered at very low contrast behind the franchise header, so these read as
 * a horizon through glass rather than as an illustration on a page.
 */

/** Generic mid-density rectilinear city - the fallback and the base grammar. */
const GENERIC =
  "M0 100 V72 H24 V60 H46 V78 H68 V52 H96 V40 H124 V64 H150 V46 H178 V30 H208 V54 H236 V38 H266 V62 H292 V48 H320 V70 H348 V58 H374 V76 H400 V100 Z";

/**
 * One path per city. Keyed by team abbreviation, with relocation cities keyed
 * by name so a moved franchise resolves to its new home.
 */
const SKYLINES: Record<string, string> = {
  // Atlanta - stepped towers, the Bank of America Plaza spire off-centre.
  ATL: "M0 100 V78 H30 V64 H58 V72 H84 V44 H110 V30 H118 V16 H124 V30 H132 V44 H162 V56 H190 V38 H222 V58 H250 V46 H284 V66 H316 V52 H346 V74 H400 V100 Z",
  // Boston - the Hancock slab and the Prudential, low brick either side.
  BOS: "M0 100 V80 H36 V70 H64 V54 H92 V26 H120 V54 H146 V42 H172 V22 H196 V42 H228 V60 H258 V50 H290 V68 H322 V58 H354 V76 H400 V100 Z",
  // Brooklyn - low brownstone foreground, Manhattan rising across the river.
  BKN: "M0 100 V84 H40 V76 H72 V82 H104 V60 H128 V34 H140 V18 H146 V34 H160 V50 H186 V28 H210 V48 H240 V62 H272 V54 H306 V70 H340 V80 H400 V100 Z",
  // Charlotte - the crown-topped Bank of America Corporate Center.
  CHA: "M0 100 V82 H34 V72 H62 V56 H88 V34 H100 V22 H112 V34 H124 V56 H154 V66 H184 V48 H216 V64 H248 V54 H282 V70 H316 V60 H350 V78 H400 V100 Z",
  // Chicago - Willis with its twin antennas, the Hancock's tapered mass.
  CHI: "M0 100 V80 H32 V66 H58 V50 H80 V20 H86 V8 H92 V20 H108 V50 H134 V34 H140 V24 H152 V34 H160 V56 H190 V44 H220 V62 H252 V50 H288 V68 H322 V58 H356 V76 H400 V100 Z",
  // Cleveland - Terminal Tower stepping to a point.
  CLE: "M0 100 V82 H32 V70 H60 V58 H84 V38 H96 V24 H104 V14 H110 V24 H118 V38 H144 V60 H176 V48 H208 V64 H242 V54 H278 V70 H312 V60 H348 V78 H400 V100 Z",
  // Dallas - Reunion Tower's sphere on its stalk, Bank of America Plaza slab.
  DAL: "M0 100 V80 H28 V68 H52 V48 H78 V30 H104 V50 H130 V62 H156 V40 H184 V58 H214 V46 H244 V64 H268 V52 H278 V38 A10 10 0 1 1 298 38 V52 H308 V70 H340 V60 H372 V78 H400 V100 Z",
  // Denver - the Rockies behind a compact downtown. The only skyline whose
  // dominant form is landscape rather than architecture.
  DEN: "M0 100 V64 L34 34 L58 56 L86 22 L112 48 L138 18 L168 44 L196 30 L228 52 L258 26 L292 50 L326 36 L360 58 L400 40 V100 Z",
  // Detroit - the Renaissance Center's cylinder cluster.
  DET: "M0 100 V82 H30 V72 H58 V60 H82 V34 H94 V26 H106 V34 H118 V26 H130 V34 H142 V60 H172 V50 H204 V66 H236 V56 H272 V72 H308 V62 H344 V78 H400 V100 Z",
  // Golden State - the Bay bridge span into the San Francisco towers.
  GSW: "M0 100 V78 Q40 52 80 78 V64 H104 V44 H126 V22 H138 V44 H158 V56 H186 V38 H214 V58 H244 V46 H278 V64 H312 V54 H348 V74 H400 V100 Z",
  // Houston - the JPMorgan Chase Tower's angled crown.
  HOU: "M0 100 V80 H30 V68 H56 V52 H80 V26 H92 L104 14 L114 26 V52 H140 V64 H170 V44 H200 V60 H232 V48 H266 V66 H300 V56 H336 V74 H400 V100 Z",
  // Indiana - Salesforce Tower's tiered top over a low midwestern skyline.
  IND: "M0 100 V84 H34 V74 H64 V62 H90 V40 H102 V28 H114 V40 H126 V62 H158 V70 H190 V54 H222 V68 H256 V58 H290 V72 H324 V64 H358 V80 H400 V100 Z",
  // Clippers - LA's downtown cluster, read lower and wider than the Lakers'.
  LAC: "M0 100 V82 H32 V70 H60 V58 H88 V36 H112 V52 H136 V30 H150 V48 H180 V60 H212 V44 H244 V62 H276 V50 H310 V68 H344 V76 H400 V100 Z",
  // Lakers - the US Bank Tower crown, palms implied by the low right edge.
  LAL: "M0 100 V84 H30 V72 H56 V54 H82 V30 H94 V18 H108 V30 H120 V54 H150 V64 H182 V46 H214 V62 H248 V50 H282 V68 H318 V58 H354 V78 H400 V100 Z",
  // Memphis - the Hernando de Soto bridge arches and the Pyramid.
  MEM: "M0 100 V80 Q26 56 52 80 Q78 56 104 80 V72 H126 L150 34 L174 72 V78 H204 V62 H236 V74 H268 V64 H302 V76 H336 V68 H370 V80 H400 V100 Z",
  // Miami - a dense strip of towers, low and wide, the Freedom Tower's cap.
  MIA: "M0 100 V84 H26 V70 H50 V56 H74 V38 H96 V54 H118 V32 H130 V20 H136 V32 H148 V54 H176 V42 H206 V60 H238 V48 H270 V64 H304 V54 H340 V72 H400 V100 Z",
  // Milwaukee - the US Bank Center slab, brewery-era low rise beside it.
  MIL: "M0 100 V84 H36 V74 H66 V64 H92 V38 H116 V60 H146 V50 H176 V34 H198 V52 H228 V66 H260 V56 H294 V70 H328 V62 H362 V80 H400 V100 Z",
  // Minnesota - IDS Center's stepped glass, Capella's crown.
  MIN: "M0 100 V82 H32 V72 H60 V56 H84 V32 H108 V50 H130 V26 H142 V16 H150 V26 H160 V50 H188 V62 H220 V48 H252 V64 H286 V54 H320 V70 H356 V78 H400 V100 Z",
  // New Orleans - low riverfront, the Superdome's curve as the one landmark.
  NOP: "M0 100 V84 H34 V74 H62 Q88 46 114 74 V80 H144 V60 H172 V72 H202 V54 H234 V70 H266 V60 H300 V74 H334 V66 H368 V80 H400 V100 Z",
  // New York - the Empire State's spire, Chrysler's tiers, a dense field.
  NYK: "M0 100 V78 H24 V64 H46 V52 H68 V34 H80 V20 H86 V6 H90 V20 H98 V34 H118 V46 H140 V26 H150 V14 H156 V26 H166 V46 H192 V56 H218 V40 H246 V58 H276 V46 H310 V62 H344 V54 H376 V74 H400 V100 Z",
  // Oklahoma City - the Devon Tower's isolated height over a flat plain.
  OKC: "M0 100 V86 H40 V78 H72 V68 H96 V30 H112 V18 H120 V30 H134 V68 H164 V76 H196 V64 H230 V76 H264 V68 H300 V78 H336 V72 H370 V82 H400 V100 Z",
  // Orlando - low resort-era horizontal, one central tower.
  ORL: "M0 100 V86 H36 V78 H68 V70 H98 V44 H118 V32 H128 V44 H148 V70 H180 V78 H212 V66 H246 V78 H280 V70 H314 V80 H348 V74 H400 V100 Z",
  // Philadelphia - Liberty Place's twin spires, City Hall's tower.
  PHI: "M0 100 V80 H30 V70 H56 V56 H78 V30 H88 V16 H94 V30 H104 V44 H114 V28 H122 V14 H128 V28 H138 V56 H166 V66 H198 V48 H230 V64 H262 V52 H298 V70 H332 V60 H366 V78 H400 V100 Z",
  // Phoenix - Chase Tower over desert-flat surroundings, low and spread.
  PHX: "M0 100 V86 H38 V76 H70 V66 H96 V36 H114 V24 H124 V36 H142 V66 H172 V74 H204 V62 H238 V74 H272 V66 H306 V78 H340 V70 H374 V82 H400 V100 Z",
  // Portland - the Wells Fargo Center with Mount Hood's cone behind.
  POR: "M0 100 V74 L30 48 L54 70 V62 H80 V44 H100 V26 H110 V44 H128 V62 H158 V70 H188 V56 H218 V68 H250 V58 H284 V70 H318 V62 H352 V76 H400 V100 Z",
  // Sacramento - the Tower Bridge span, capitol dome low and central.
  SAC: "M0 100 V80 Q34 58 68 80 V74 H96 V60 H118 A12 12 0 0 1 142 60 V74 H172 V64 H204 V76 H236 V66 H270 V78 H304 V70 H338 V80 H400 V100 Z",
  // San Antonio - the Tower of the Americas' needle over a low colonial city.
  SAS: "M0 100 V86 H36 V78 H68 V72 H94 V64 H108 V24 H114 V12 H118 V24 H124 V64 H142 V72 H172 V80 H206 V70 H240 V80 H274 V72 H310 V82 H344 V76 H400 V100 Z",
  // Toronto - the CN Tower's pod and mast, the bank towers beside it.
  TOR: "M0 100 V82 H28 V70 H54 V56 H76 V40 H94 V56 H110 V30 H116 V14 H119 V4 H122 V14 H128 V30 H138 V56 H164 V44 H192 V60 H224 V48 H258 V66 H292 V56 H328 V72 H400 V100 Z",
  // Utah - the Wasatch range behind a compact downtown.
  UTA: "M0 100 V70 L28 42 L52 62 L78 30 L104 54 L126 66 V58 H150 V38 H170 V56 H198 V66 H230 V54 H262 V68 H296 V58 H330 V72 H400 V100 Z",
  // Washington - deliberately low by statute, the Monument as the one spike.
  WAS: "M0 100 V86 H40 V78 H74 V70 H104 V64 H132 V22 H140 V64 H166 V70 H198 V76 H232 V68 H268 V78 H302 V70 H338 V80 H374 V74 H400 V100 Z",

  // Relocation destinations. A moved franchise resolves to its new city.
  Seattle:
    "M0 100 V78 H30 V66 H56 V52 H78 V34 H92 L102 12 L112 34 V52 H132 V44 H150 V26 H158 V44 H176 V60 H208 V48 H240 V64 H274 V54 H308 V70 H342 V62 H376 V78 H400 V100 Z",
  "Las Vegas":
    "M0 100 V84 H32 V74 H60 V62 H84 V40 H100 V28 H110 V40 H126 V62 H152 L166 26 L180 62 V70 H212 V60 H246 V72 H280 V62 H314 V74 H348 V68 H400 V100 Z",
  Louisville:
    "M0 100 V86 H38 V78 H70 V68 H98 V46 H116 V34 H126 V46 H144 V68 H176 V76 H208 V64 H242 V76 H276 V68 H310 V78 H344 V72 H400 V100 Z",
};

/**
 * Resolves the skyline a franchise should show. Relocation wins over the
 * original city, since after a move the front office genuinely looks out at
 * somewhere else.
 */
export function skylinePathFor(abbreviation: string, relocatedCityName?: string | null): string {
  if (relocatedCityName && SKYLINES[relocatedCityName]) return SKYLINES[relocatedCityName];
  return SKYLINES[abbreviation] ?? GENERIC;
}

export function Skyline({
  abbreviation,
  relocatedCityName,
  className = "",
}: {
  abbreviation: string;
  relocatedCityName?: string | null;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 400 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none h-full w-full ${className}`}
    >
      <path d={skylinePathFor(abbreviation, relocatedCityName)} fill="currentColor" />
    </svg>
  );
}
