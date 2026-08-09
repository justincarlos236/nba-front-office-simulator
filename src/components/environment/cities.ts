/**
 * THE WIRE - city compositions. See DESIGN.md, "One Landmark, Two Companions".
 *
 * The view out of the front-office window, authored per city so that Brooklyn
 * does not look like Chicago does not look like Denver.
 *
 * WHY THIS REPLACED A SINGLE PATH PER CITY
 *
 * The first version defined one monolithic path per team under a grammar of
 * "flat-topped rectilinear masses by default; a curve or spire spent only where
 * a city genuinely reads by it". That rule guaranteed generic cities: it made
 * stepped rectangles the default and the landmark the exception, which is
 * exactly backwards. Every silhouette passed its tests - closed, unique,
 * in-bounds - and every silhouette was unrecognisable.
 *
 * The hierarchy below is therefore *structural* rather than advisory, so it can
 * be enforced by tests rather than by intention:
 *
 *   SIGNATURE  exactly one per city. The form nobody could mistake, drawn
 *              largest and placed at the composition's focus. Must occupy
 *              SIGNATURE_MIN_HEIGHT..SIGNATURE_MAX_HEIGHT of the frame.
 *   SUPPORT    one or two corroborating forms, placing the Signature in a real
 *              skyline instead of isolating it as a logo.
 *   FIELD      a low, quiet run at the edges for the Signature to rise out of.
 *              Without it a landmark floats and reads as an icon, not a view.
 *
 * DRAWING RULES, held across all cities:
 *   - one 400x100 viewBox, baseline y=100, all shapes closed and filled
 *   - silhouette only: no strokes, no windows, no detail below the roofline
 *   - ONE spent gesture per city. A city that gets a dome does not also get a
 *     suspension cable. Restraint is what keeps this out of tourist-poster
 *     territory.
 *   - recognisability comes from SHAPE, never from contrast. These render at
 *     55-80% opacity behind content and must still read.
 *
 * Abstraction level: recognisable but simplified. Proportions are regularised
 * to a shared visual language; the landmark's defining gesture is kept exact.
 * Landscape may be the Signature where a city genuinely reads by it (Denver's
 * Rockies, Utah's Wasatch) - in those, buildings drop to Field.
 */

export interface CityComposition {
  /** The unmistakable form. Exactly one. */
  signature: string;
  /** One or two corroborating forms. */
  support: string[];
  /** Low massing at the edges. */
  field: string;
  /** What the signature is, for tests, docs and anyone reading this later. */
  readonly landmark: string;
}

/**
 * A Signature must read at a glance without filling the frame.
 *
 * The ceiling is 92, not something tighter: a landmark is *supposed* to be the
 * tall thing, and at natural proportion most of these land in the 60-90 band.
 * The real constraint is headroom - a silhouette that touches y=0 reads as a
 * shape cropped by the header rather than a building standing in it - plus the
 * ordering rule below, which is what actually protects the hierarchy.
 */
export const SIGNATURE_MIN_HEIGHT = 25;
export const SIGNATURE_MAX_HEIGHT = 92;

/** Field massing stays low so the Signature has something to rise out of. */
export const FIELD_MAX_HEIGHT = 34;

/**
 * A run of low blocks along the baseline. Every city's Field is built from this
 * so the quiet parts of all 30 silhouettes share one hand, and only the
 * landmarks differ.
 */
function field(blocks: Array<[x: number, w: number, h: number]>): string {
  return blocks.map(([x, w, h]) => `M${x} 100 V${100 - h} H${x + w} V100 Z`).join(" ");
}

/** A flat-topped tower. The neutral building form. */
function tower(x: number, w: number, h: number): string {
  return `M${x} 100 V${100 - h} H${x + w} V100 Z`;
}

export const CITIES: Record<string, CityComposition> = {
  // ── BROOKLYN ──────────────────────────────────────────────────────────────
  // The Brooklyn Bridge's gothic arches, close and large. Manhattan sits small
  // and distant behind - the borough's real view, and what separates the Nets
  // from the Knicks rather than a second Manhattan skyline.
  BKN: {
    landmark: "Brooklyn Bridge gothic arch towers",
    signature:
      // Two masonry towers with pointed double arches, cables slung between.
      "M96 100 V46 H130 V100 H122 V58 A9 9 0 0 0 104 58 V100 Z " +
      "M104 78 V64 A9 9 0 0 1 122 64 V78 Z " +
      "M214 100 V46 H248 V100 H240 V58 A9 9 0 0 0 222 58 V100 Z " +
      "M222 78 V64 A9 9 0 0 1 240 64 V78 Z " +
      // The main span's catenary, and the back-stays to each shore.
      "M130 52 Q172 74 214 52 V58 Q172 80 130 58 Z " +
      "M96 52 Q60 66 26 76 V82 Q60 72 96 58 Z " +
      "M248 52 Q286 66 320 76 V82 Q286 72 248 58 Z",
    support: [
      // Manhattan, deliberately small and far: this is a view *from* Brooklyn.
      "M300 100 V72 H310 V66 H316 V72 H326 V100 Z M332 100 V68 H340 V60 H344 V68 H352 V100 Z",
    ],
    field: field([
      [0, 26, 16],
      [30, 22, 13],
      [56, 18, 18],
      [140, 20, 15],
      [164, 22, 12],
      [190, 18, 16],
      [256, 20, 14],
      [280, 16, 11],
      [358, 22, 15],
      [384, 16, 12],
    ]),
  },

  // ── CHICAGO ───────────────────────────────────────────────────────────────
  // Willis Tower: stepped setbacks and twin antennas. The single most legible
  // building silhouette in American architecture.
  CHI: {
    landmark: "Willis Tower setbacks and twin antennas",
    signature:
      "M150 100 V56 H166 V44 H182 V50 H196 V56 H212 V100 Z " +
      // The two bundled tubes rising highest, plus the antenna pair. Kept
      // under SIGNATURE_MAX_HEIGHT: at full architectural proportion the
      // antennas reach the top of the frame and tower over the header text.
      "M166 44 V30 H174 V44 Z M182 50 V36 H190 V50 Z " +
      "M169 30 V18 H171 V30 Z M186 36 V22 H188 V36 Z",
    support: [
      // The Hancock's tapered mass - the other building Chicago reads by.
      "M240 100 V40 L248 34 H262 L270 40 V100 Z M252 34 V24 H254 V34 Z M258 34 V22 H260 V34 Z",
    ],
    field: field([
      [0, 28, 20],
      [32, 24, 15],
      [60, 22, 24],
      [86, 20, 18],
      [110, 26, 22],
      [216, 20, 19],
      [274, 24, 21],
      [302, 20, 16],
      [326, 26, 23],
      [356, 22, 17],
      [382, 18, 14],
    ]),
  },

  // ── GOLDEN STATE (San Francisco) ──────────────────────────────────────────
  // The Golden Gate's suspension curve. One spent gesture; the towers stay
  // simple so the cable sag carries the recognition.
  GSW: {
    landmark: "Golden Gate Bridge span",
    signature:
      // Two portal-frame towers with their crossbeams, and the cable between.
      "M64 100 V34 H74 V100 Z M88 100 V34 H98 V100 Z M64 44 H98 V50 H64 Z M64 60 H98 V66 H64 Z " +
      "M64 34 H98 V28 H64 Z " +
      "M228 100 V34 H238 V100 Z M252 100 V34 H262 V100 Z M228 44 H262 V50 H228 Z M228 60 H262 V66 H228 Z " +
      "M228 34 H262 V28 H228 Z " +
      // The main catenary between the towers, and the side spans.
      "M98 34 Q163 88 228 34 V42 Q163 94 98 42 Z " +
      "M64 34 Q34 52 4 62 V70 Q34 60 64 42 Z " +
      "M262 34 Q294 52 326 62 V70 Q294 60 262 42 Z " +
      // The roadway deck.
      "M4 70 H326 V76 H4 Z",
    support: [
      // Transamerica Pyramid - the one other San Francisco form that is
      // instant. Deliberately shorter than the bridge towers: at its true
      // relative height it out-tops the span and the eye goes to the pyramid
      // instead of the cable, which is the wrong landmark for this franchise.
      "M340 100 V62 L352 38 L364 62 V100 Z",
    ],
    field: field([
      [110, 20, 14],
      [134, 18, 11],
      [158, 16, 15],
      [180, 20, 12],
      [204, 16, 13],
      [286, 18, 16],
      [308, 16, 12],
      [372, 20, 18],
    ]),
  },

  // ── DENVER ────────────────────────────────────────────────────────────────
  // The Rockies. Landscape as Signature: Denver reads by its range, and no
  // building it has competes. Downtown drops to Field.
  DEN: {
    landmark: "Rocky Mountain front range",
    signature:
      "M0 100 V58 L38 24 L62 46 L92 12 L124 42 L152 20 L188 52 L214 34 L246 58 L268 44 L300 66 V100 Z " +
      // Snowline: a second, brighter band would break the silhouette rule, so
      // the peaks are notched instead - the range reads as jagged, not smooth.
      "M92 12 L104 26 L112 18 L124 42 Z",
    support: [
      // Republic Plaza and the cash-register curve, kept small under the range.
      "M310 100 V64 H326 V100 Z M334 100 V70 Q346 58 358 70 V100 Z",
    ],
    field: field([
      [0, 30, 12],
      [34, 24, 9],
      [62, 20, 14],
      [88, 26, 10],
      [118, 22, 13],
      [146, 20, 9],
      [172, 24, 12],
      [200, 20, 10],
      [226, 26, 13],
      [258, 20, 9],
      [282, 22, 12],
      [364, 20, 15],
      [388, 12, 11],
    ]),
  },

  // ── MIAMI ─────────────────────────────────────────────────────────────────
  // The Freedom Tower's crown, with palms. The palms are what make it read as
  // Miami rather than as any warm-weather downtown.
  MIA: {
    landmark: "Freedom Tower crown and palms",
    signature:
      // Tower shaft, cornice, and the ornate cupola stepping to a finial.
      "M150 100 V44 H182 V100 Z M146 44 H186 V38 H146 Z " +
      "M156 38 V26 H176 V38 Z M160 26 V18 H172 V26 Z M164 18 V12 H168 V18 Z " +
      "M165 12 V8 H167 V12 Z",
    support: [
      // Two palms - curved trunk, fronds as a splayed crown.
      "M46 100 V72 Q44 62 50 56 Q44 58 40 52 Q48 50 52 54 Q54 46 60 44 Q58 52 54 56 " +
        "Q62 52 68 56 Q60 58 52 62 Q50 70 50 100 Z " +
        "M338 100 V76 Q336 66 342 60 Q336 62 332 56 Q340 54 344 58 Q346 50 352 48 " +
        "Q350 56 346 60 Q354 56 360 60 Q352 62 344 66 Q342 74 342 100 Z",
      // Brickell's tight cluster of towers.
      "M204 100 V52 H216 V100 Z M222 100 V44 H234 V100 Z M240 100 V56 H252 V100 Z",
    ],
    field: field([
      [0, 30, 14],
      [34, 26, 10],
      [64, 22, 16],
      [92, 24, 12],
      [120, 20, 15],
      [258, 24, 13],
      [286, 20, 16],
      [310, 22, 11],
      [366, 26, 14],
      [396, 4, 10],
    ]),
  },

  // ── NEW ORLEANS ───────────────────────────────────────────────────────────
  // The Superdome's continuous curve - a form no other city in the league has.
  NOP: {
    landmark: "Superdome",
    signature: "M96 100 V80 Q96 40 156 40 Q216 40 216 80 V100 Z",
    support: [
      // St. Louis Cathedral: three spires, the tallest centre. Kept below the
      // dome - the Superdome is the landmark here, and a support that out-tops
      // the signature sends the eye to the wrong shape.
      "M268 100 V74 H278 V100 Z M272 74 V62 L274 56 L276 62 V74 Z " +
        "M284 100 V68 H298 V100 Z M288 68 V52 L291 44 L294 52 V68 Z " +
        "M304 100 V74 H314 V100 Z M308 74 V62 L310 56 L312 62 V74 Z",
    ],
    field: field([
      [0, 32, 15],
      [36, 26, 11],
      [66, 24, 14],
      [222, 20, 12],
      [246, 18, 15],
      [320, 24, 13],
      [348, 22, 16],
      [374, 26, 11],
    ]),
  },

  // ── TORONTO ───────────────────────────────────────────────────────────────
  // The CN Tower: tapered shaft, observation pod, mast. Unmistakable.
  TOR: {
    landmark: "CN Tower",
    signature:
      // Splayed base, tapering shaft, pod, upper pod, mast.
      "M148 100 L156 56 H164 L172 100 Z " +
      "M156 56 V34 H164 V56 Z " +
      "M150 34 Q160 26 170 34 Q170 44 160 46 Q150 44 150 34 Z " +
      "M155 26 H165 V34 H155 Z " +
      "M157 16 H163 V26 H157 Z " +
      // The mast stops short of the frame edge: a silhouette touching y=0
      // reads as cropped by the header rather than standing in it.
      "M159 10 H161 V16 Z",
    support: [
      // The bank towers: flat-topped slabs, deliberately plain beside the mast.
      "M196 100 V44 H214 V100 Z M222 100 V52 H238 V100 Z M246 100 V40 H262 V100 Z",
    ],
    field: field([
      [0, 30, 16],
      [34, 24, 12],
      [62, 26, 18],
      [92, 22, 13],
      [118, 24, 15],
      [268, 22, 17],
      [294, 26, 13],
      [324, 20, 16],
      [348, 24, 12],
      [376, 24, 15],
    ]),
  },

  // ── SAN ANTONIO ───────────────────────────────────────────────────────────
  // Tower of the Americas: a needle with an observation ring near the top.
  SAS: {
    landmark: "Tower of the Americas",
    signature:
      "M154 100 L160 40 H166 L172 100 Z " +
      "M150 40 Q163 32 176 40 Q176 50 163 52 Q150 50 150 40 Z " +
      "M160 32 H166 V40 H160 Z " +
      "M162 10 H164 V32 Z",
    support: [
      // The Alamo: low curved parapet façade with its doorway recess.
      "M232 100 V70 H244 V62 Q252 52 262 62 V70 H274 V100 Z",
    ],
    field: field([
      [0, 34, 13],
      [38, 28, 9],
      [70, 24, 12],
      [98, 26, 10],
      [126, 22, 14],
      [180, 24, 11],
      [206, 22, 14],
      [280, 26, 12],
      [310, 24, 15],
      [338, 28, 10],
      [370, 26, 13],
    ]),
  },

  // ── UTAH ──────────────────────────────────────────────────────────────────
  // The Wasatch, sharp and close. Landscape as Signature.
  UTA: {
    landmark: "Wasatch range",
    signature: "M0 100 V52 L36 16 L58 40 L86 8 L116 38 L140 22 L172 48 L198 30 L230 56 V100 Z",
    support: [
      // Salt Lake Temple: six spires, the centre pair tallest.
      "M258 100 V66 H316 V100 Z " +
        "M262 66 V52 L264 44 L266 52 V66 Z M274 66 V44 L277 32 L280 44 V66 Z " +
        "M288 66 V44 L291 32 L294 44 V66 Z M302 66 V52 L304 44 L306 52 V66 Z",
    ],
    field: field([
      [0, 28, 10],
      [32, 22, 8],
      [58, 24, 11],
      [86, 20, 9],
      [110, 24, 12],
      [138, 20, 8],
      [162, 22, 11],
      [188, 24, 9],
      [214, 20, 12],
      [238, 18, 10],
      [322, 24, 13],
      [350, 22, 10],
      [376, 24, 14],
    ]),
  },

  // ── NEW YORK ──────────────────────────────────────────────────────────────
  // Empire State and Chrysler at full height - the Knicks' Manhattan, distinct
  // from Brooklyn's bridge-and-distant-skyline view.
  NYK: {
    landmark: "Empire State Building, with Liberty in the harbour",
    signature:
      // Empire State: setbacks, tower, mooring mast.
      "M140 100 V52 H184 V100 Z M148 52 V38 H176 V52 Z M154 38 V16 H170 V38 Z " +
      "M158 16 V12 H166 V16 Z M161 12 V8 H163 V12 Z",
    support: [
      // Chrysler: stepped arched crown and needle.
      "M212 100 V50 H242 V100 Z M216 50 V38 H238 V50 Z " +
        "M220 38 Q227 28 234 38 Z M222 28 Q227 22 232 28 Z M226 22 V14 H228 V22 Z",
      // Liberty, out in the harbour: pedestal, robed figure, raised torch arm
      // and the crown's rays. Deliberately small and low - she is the most
      // recognisable form here, but she belongs to the *harbour*, which
      // Brooklyn shares. Kept as support so she can never become the thing
      // that distinguishes the Knicks from the Nets; the Midtown skyline does
      // that. See the same-metro rule in DESIGN.md.
      "M330 100 V92 H354 V100 Z M334 92 V86 H350 V92 Z " +
        // Robe: a tapering column with a slight flare at the hem.
        "M338 86 L340 66 H344 L346 86 Z " +
        // Raised right arm and torch.
        "M344 72 L349 62 H351 L347 72 Z M348 62 V57 H352 V62 Z M349 57 L350 53 L351 57 Z " +
        // Tablet, held low against the body.
        "M334 74 L338 70 V76 L334 79 Z " +
        // Head and the crown's spikes.
        "M340 66 V62 H344 V66 Z M339 62 L340 58 L341 62 Z M342 62 L342 57 H343 L343 62 Z " +
        "M344 62 L345 58 L346 62 Z",
    ],
    field: field([
      [0, 26, 22],
      [30, 22, 17],
      [56, 24, 25],
      [84, 20, 19],
      [108, 26, 23],
      [188, 20, 20],
      [246, 20, 24],
      // Lower Manhattan running down to the water, dropping toward the harbour
      // so Liberty reads as standing beyond the city rather than inside it.
      [270, 18, 26],
      [292, 16, 22],
      [312, 14, 16],
      [360, 22, 14],
      [386, 14, 11],
    ]),
  },

  // ── LOS ANGELES LAKERS ────────────────────────────────────────────────────
  // Downtown LA: the US Bank Tower's ringed crown over the Bunker Hill cluster.
  LAL: {
    landmark: "US Bank Tower crown",
    signature:
      "M152 100 V38 H190 V100 Z M156 38 V30 H186 V38 Z " +
      // The glass crown ring.
      "M160 30 Q171 20 182 30 Z M164 22 H178 V30 H164 Z",
    support: ["M204 100 V50 H222 V100 Z M230 100 V44 H246 V100 Z M254 100 V56 H270 V100 Z"],
    field: field([
      [0, 30, 18],
      [34, 24, 13],
      [62, 26, 20],
      [92, 22, 15],
      [118, 28, 17],
      [276, 24, 19],
      [304, 22, 14],
      [330, 26, 18],
      [360, 22, 13],
      [386, 14, 16],
    ]),
  },

  // ── LOS ANGELES CLIPPERS ──────────────────────────────────────────────────
  // Inglewood, not Bunker Hill: the Intuit Dome's disc under a lower, wider
  // horizon. Same metro, genuinely different view - see the same-metro rule.
  LAC: {
    landmark: "Intuit Dome",
    signature: "M118 100 V78 Q118 46 178 46 Q238 46 238 78 V100 Z " + "M112 78 H244 V86 H112 Z",
    support: [
      // Downtown LA, distant and small - the shared metro may appear only as
      // support, never as this franchise's signature.
      "M300 100 V70 H310 V62 H316 V70 H326 V100 Z M334 100 V66 H344 V100 Z",
      // Palms, marking the Westside.
      "M62 100 V78 Q60 70 66 66 Q60 68 56 62 Q64 60 68 64 Q70 58 76 56 " +
        "Q74 64 70 68 Q78 64 84 68 Q76 70 68 74 Q66 78 66 100 Z",
    ],
    field: field([
      [0, 34, 12],
      [38, 28, 9],
      [88, 24, 11],
      [248, 26, 13],
      [278, 18, 10],
      [350, 26, 12],
      [380, 20, 14],
    ]),
  },

  // ── SEATTLE handled under relocation, but Portland shares its landscape ────
  // Mount Hood over the Wells Fargo Center. Landscape leads.
  POR: {
    landmark: "Mount Hood",
    signature: "M0 100 V62 L44 18 L70 44 L96 26 L134 60 V100 Z " + "M44 18 L54 30 L60 24 L70 44 Z",
    support: [
      "M180 100 V52 H198 V100 Z M206 100 V60 H220 V100 Z",
      // The Portland Building and the White Stag sign's post.
      "M252 100 V64 H272 V100 Z M260 64 V56 H264 V64 Z",
    ],
    field: field([
      [0, 30, 11],
      [36, 24, 8],
      [64, 22, 12],
      [90, 26, 9],
      [120, 24, 13],
      [148, 26, 10],
      [224, 22, 14],
      [280, 24, 11],
      [308, 20, 15],
      [332, 26, 10],
      [364, 30, 13],
    ]),
  },

  // ── PHILADELPHIA ──────────────────────────────────────────────────────────
  // City Hall's clock tower with William Penn, and Liberty Place's twin spires.
  PHI: {
    landmark: "City Hall tower",
    signature:
      "M144 100 V60 H184 V100 Z M152 60 V44 H176 V60 Z " +
      "M156 44 V26 H172 V44 Z M158 26 Q164 16 170 26 Z " +
      "M163 18 V12 H165 V18 Z M162 12 H166 V8 H162 Z",
    support: [
      // One and Two Liberty Place: stepped, chevron-crowned, spired.
      "M212 100 V46 H240 V100 Z M216 46 L226 26 L236 46 Z M225 26 V14 H227 V26 Z " +
        "M250 100 V56 H274 V100 Z M254 56 L262 40 L270 56 Z",
    ],
    field: field([
      [0, 28, 19],
      [32, 24, 14],
      [60, 26, 21],
      [90, 22, 16],
      [116, 24, 18],
      [188, 20, 17],
      [282, 24, 20],
      [310, 22, 15],
      [336, 26, 19],
      [366, 30, 14],
    ]),
  },

  // ── BOSTON ────────────────────────────────────────────────────────────────
  // The Hancock's canted glass slab and the Prudential, over low brick.
  BOS: {
    landmark: "John Hancock Tower",
    signature:
      // The parallelogram plan read as a canted slab - Boston's one modern form.
      "M150 100 V34 L162 28 H190 V100 Z",
    support: [
      // The Prudential, kept a step below the Hancock's slab.
      "M210 100 V50 H236 V100 Z M216 50 V42 H230 V50 Z M221 42 V34 H225 V42 Z",
      // Custom House Tower's clock block.
      "M264 100 V62 H280 V100 Z M268 62 V48 H276 V62 Z M270 48 L272 42 L274 48 Z",
    ],
    field: field([
      [0, 32, 16],
      [36, 26, 12],
      [66, 24, 18],
      [94, 28, 13],
      [126, 20, 15],
      [240, 20, 17],
      [288, 26, 14],
      [318, 22, 18],
      [344, 28, 12],
      [376, 24, 16],
    ]),
  },

  // ── SEATTLE-style: OKC ────────────────────────────────────────────────────
  // Devon Tower's isolated height over a flat plain - the honest OKC view.
  OKC: {
    landmark: "Devon Energy Center",
    signature: "M162 100 V36 H196 V100 Z M166 36 V26 H192 V36 Z M172 26 Q179 16 186 26 Z",
    support: ["M216 100 V64 H232 V100 Z M240 100 V70 H254 V100 Z"],
    field: field([
      [0, 34, 11],
      [38, 28, 8],
      [70, 26, 12],
      [100, 24, 9],
      [128, 28, 13],
      [260, 26, 10],
      [292, 24, 13],
      [320, 28, 9],
      [352, 26, 12],
      [382, 18, 10],
    ]),
  },

  // ── WASHINGTON ────────────────────────────────────────────────────────────
  // The Monument and the Capitol dome. A capital held low by statute.
  WAS: {
    landmark: "Washington Monument and Capitol dome",
    signature: "M172 100 V26 L177 12 L182 26 V100 Z",
    support: [
      // The Capitol: dome, drum and statue over a low colonnade.
      "M240 100 V80 H320 V100 Z " +
        "M262 80 V70 H298 V80 Z M266 70 Q280 48 294 70 Z M278 48 V40 H282 V48 Z " +
        "M279 40 L280 34 L281 40 Z",
    ],
    field: field([
      [0, 36, 12],
      [40, 30, 9],
      [74, 28, 13],
      [106, 26, 10],
      [136, 30, 12],
      [196, 34, 11],
      [324, 28, 12],
      [356, 26, 9],
      [386, 14, 11],
    ]),
  },

  // ── MEMPHIS ───────────────────────────────────────────────────────────────
  // The Hernando de Soto bridge's twin arches - the "M" over the Mississippi.
  MEM: {
    landmark: "Hernando de Soto Bridge arches",
    signature:
      "M60 100 V78 Q60 34 116 34 Q172 34 172 78 V100 H160 V78 Q160 46 116 46 " +
      "Q72 46 72 78 V100 Z " +
      "M172 100 V78 Q172 34 228 34 Q284 34 284 78 V100 H272 V78 Q272 46 228 46 " +
      "Q184 46 184 78 V100 Z " +
      "M40 82 H304 V88 H40 Z",
    support: [
      // The Pyramid, small behind the span.
      "M310 100 V72 L330 40 L350 72 V100 Z",
    ],
    field: field([
      [0, 30, 12],
      [34, 22, 9],
      [356, 24, 13],
      [384, 16, 10],
    ]),
  },

  // ── PHOENIX ───────────────────────────────────────────────────────────────
  // Saguaro and butte: Phoenix reads by desert, not by its towers.
  PHX: {
    landmark: "Saguaro cactus and desert butte",
    signature:
      // A saguaro with two arms - the single most legible desert silhouette.
      "M64 100 V44 Q64 34 74 34 Q84 34 84 44 V100 Z " +
      "M44 100 V62 Q44 48 56 48 Q64 48 64 58 V66 H56 V60 Q56 56 52 56 Q48 56 48 62 V100 Z " +
      "M84 72 V58 Q84 50 92 50 Q100 50 100 60 V100 H92 V62 Q92 58 88 58 V72 Z",
    support: [
      // Camelback-style butte: flat-topped, sloping shoulders.
      "M180 100 V72 L200 56 H244 L262 72 V100 Z",
      "M300 100 V66 H314 V100 Z M322 100 V72 H334 V100 Z",
    ],
    field: field([
      [0, 32, 10],
      [104, 28, 8],
      [136, 26, 11],
      [268, 24, 9],
      [342, 26, 12],
      [372, 28, 9],
    ]),
  },

  // ── SACRAMENTO ────────────────────────────────────────────────────────────
  // Tower Bridge's gantry towers and the Capitol dome.
  SAC: {
    landmark: "Tower Bridge",
    signature:
      // Vertical-lift bridge: two portal towers with the lift span between.
      "M104 100 V36 H124 V100 Z M180 100 V36 H200 V100 Z " +
      "M104 36 H200 V44 H104 Z " +
      "M104 52 H200 V58 H104 Z " +
      "M60 74 H244 V82 H60 Z",
    support: [
      "M282 100 V80 H344 V100 Z M300 80 V72 H326 V80 Z M304 72 Q313 56 322 72 Z " +
        "M312 56 V48 H314 V56 Z",
    ],
    field: field([
      [0, 30, 11],
      [34, 24, 8],
      [248, 26, 12],
      [352, 24, 10],
      [380, 20, 13],
    ]),
  },

  // ── HOUSTON ───────────────────────────────────────────────────────────────
  // JPMorgan Chase Tower's sharply angled crown, and a launch-tower gantry.
  HOU: {
    landmark: "JPMorgan Chase Tower angled crown",
    signature: "M148 100 V40 H190 V100 Z M148 40 L190 40 L190 24 Z",
    support: [
      "M212 100 V48 H232 V100 Z M212 48 L232 48 L232 36 Z",
      // Williams Tower's stepped glass mass.
      "M256 100 V52 H278 V100 Z M260 52 V42 H274 V52 Z",
    ],
    field: field([
      [0, 30, 17],
      [34, 26, 12],
      [64, 24, 19],
      [92, 26, 14],
      [122, 22, 16],
      [194, 14, 15],
      [286, 24, 18],
      [314, 22, 13],
      [340, 26, 17],
      [370, 30, 12],
    ]),
  },

  // ── DALLAS ────────────────────────────────────────────────────────────────
  // Reunion Tower: a geodesic sphere on a stalk. Nothing else looks like it.
  DAL: {
    landmark: "Reunion Tower",
    signature:
      "M156 100 V52 H160 V100 Z M172 100 V52 H176 V100 Z M164 100 V52 H168 V100 Z " +
      "M150 40 A16 16 0 1 1 182 40 A16 16 0 1 1 150 40 Z " +
      "M165 12 H167 V24 H165 Z",
    support: [
      // Bank of America Plaza's slab, and the Fountain Place wedge.
      "M212 100 V38 H234 V100 Z",
      "M252 100 V56 L268 42 L284 56 V100 Z",
    ],
    field: field([
      [0, 30, 15],
      [34, 26, 11],
      [64, 24, 17],
      [92, 26, 12],
      [122, 24, 14],
      [192, 16, 13],
      [292, 24, 16],
      [320, 22, 12],
      [346, 26, 15],
      [376, 24, 11],
    ]),
  },

  // ── ATLANTA ───────────────────────────────────────────────────────────────
  // Bank of America Plaza's lattice spire - Atlanta's one unmistakable top.
  ATL: {
    landmark: "Bank of America Plaza spire",
    signature:
      "M158 100 V40 H190 V100 Z M162 40 V30 H186 V40 Z " +
      "M168 30 L174 20 H176 L180 30 Z M173 20 V10 H175 V20 Z",
    support: [
      // Westin Peachtree's cylinder.
      "M212 100 V46 Q212 40 224 40 Q236 40 236 46 V100 Z",
      "M254 100 V58 H272 V100 Z",
    ],
    field: field([
      [0, 30, 16],
      [34, 26, 12],
      [64, 22, 18],
      [90, 26, 13],
      [120, 26, 15],
      [194, 14, 14],
      [280, 24, 17],
      [308, 22, 12],
      [334, 26, 16],
      [364, 32, 12],
    ]),
  },

  // ── CLEVELAND ─────────────────────────────────────────────────────────────
  // Terminal Tower stepping to a lantern - and the Key Tower's pyramid.
  CLE: {
    landmark: "Terminal Tower",
    signature:
      "M150 100 V52 H186 V100 Z M156 52 V38 H180 V52 Z M160 38 V26 H176 V38 Z " +
      "M164 26 V18 H172 V26 Z M167 18 V10 H169 V18 Z",
    support: ["M206 100 V44 H228 V100 Z M206 44 L217 24 L228 44 Z M216 24 V14 H218 V24 Z"],
    field: field([
      [0, 30, 15],
      [34, 26, 11],
      [64, 22, 17],
      [90, 26, 12],
      [120, 24, 14],
      [190, 12, 13],
      [236, 24, 16],
      [264, 22, 12],
      [290, 26, 15],
      [320, 28, 11],
      [352, 26, 14],
      [382, 18, 10],
    ]),
  },

  // ── DETROIT ───────────────────────────────────────────────────────────────
  // The Renaissance Center: a tall central cylinder ringed by four shorter.
  DET: {
    landmark: "Renaissance Center",
    signature:
      "M156 100 V44 Q156 30 172 30 Q188 30 188 44 V100 Z " +
      "M134 100 V56 Q134 46 146 46 Q158 46 158 56 V100 Z " +
      "M186 100 V56 Q186 46 198 46 Q210 46 210 56 V100 Z " +
      "M116 100 V64 Q116 56 126 56 Q136 56 136 64 V100 Z " +
      "M208 100 V64 Q208 56 218 56 Q228 56 228 64 V100 Z",
    support: [
      // The Guardian Building's stepped brick tower.
      "M256 100 V54 H274 V100 Z M260 54 V42 H270 V54 Z",
    ],
    field: field([
      [0, 32, 14],
      [36, 26, 10],
      [66, 24, 16],
      [94, 20, 11],
      [284, 24, 15],
      [312, 22, 11],
      [338, 26, 14],
      [368, 32, 10],
    ]),
  },

  // ── INDIANA ───────────────────────────────────────────────────────────────
  // Soldiers' and Sailors' Monument - the circle at the city's centre.
  IND: {
    landmark: "Soldiers' and Sailors' Monument",
    signature:
      "M158 100 V76 H190 V100 Z M164 76 V40 H184 V76 Z " +
      "M168 40 V28 H180 V40 Z M172 28 Q174 20 176 28 Z M173 20 V12 H175 V12 Z " +
      "M172 20 H176 V14 H172 Z",
    support: [
      // Salesforce Tower's tiered crown.
      "M212 100 V46 H236 V100 Z M216 46 V36 H232 V46 Z M220 36 V28 H228 V36 Z",
    ],
    field: field([
      [0, 32, 14],
      [36, 26, 10],
      [66, 24, 16],
      [94, 26, 11],
      [124, 28, 13],
      [194, 14, 12],
      [244, 24, 15],
      [272, 22, 11],
      [298, 26, 14],
      [328, 28, 10],
      [360, 30, 13],
    ]),
  },

  // ── MILWAUKEE ─────────────────────────────────────────────────────────────
  // The Milwaukee Art Museum's brise soleil - the wings over the lake.
  MIL: {
    landmark: "Milwaukee Art Museum brise soleil",
    signature:
      // Wings raised from a central mast, drawn as tapering fins.
      "M172 56 V44 H176 V56 Z " +
      "M172 50 Q130 54 92 68 Q132 62 172 60 Z " +
      "M176 50 Q218 54 256 68 Q216 62 176 60 Z " +
      "M156 100 V64 Q156 58 174 58 Q192 58 192 64 V100 Z",
    support: [
      // US Bank Center's slab, kept below the museum's raised wings.
      "M272 100 V50 H292 V100 Z",
    ],
    field: field([
      [0, 32, 13],
      [36, 26, 10],
      [66, 22, 15],
      [300, 24, 14],
      [328, 22, 10],
      [354, 26, 13],
      [384, 16, 10],
    ]),
  },

  // ── MINNESOTA ─────────────────────────────────────────────────────────────
  // The IDS Center's zigzag "crystal court" corners over the Stone Arch Bridge.
  MIN: {
    landmark: "IDS Center",
    signature:
      // Notched corners: the building's signature stepped plan in silhouette.
      "M150 100 V36 H158 V32 H166 V36 H182 V32 H190 V36 H198 V100 Z",
    support: [
      // Capella Tower's open crown ring.
      "M218 100 V50 H240 V100 Z M218 50 Q229 38 240 50 Z M222 50 Q229 44 236 50 Z",
      // Stone Arch Bridge: repeated low arches.
      "M262 88 Q272 74 282 88 Z M286 88 Q296 74 306 88 Z M310 88 Q320 74 330 88 Z " +
        "M256 86 H336 V92 H256 Z",
    ],
    field: field([
      [0, 32, 15],
      [36, 26, 11],
      [66, 24, 17],
      [94, 26, 12],
      [124, 22, 14],
      [204, 10, 13],
      [344, 26, 14],
      [374, 26, 11],
    ]),
  },

  // ── ORLANDO ───────────────────────────────────────────────────────────────
  // Lake Eola's fountain - Orlando's civic emblem - with palms.
  ORL: {
    landmark: "Lake Eola fountain",
    signature:
      // Bowl, stem and the spray arcing outward.
      "M136 100 V88 H212 V100 Z " +
      "M162 88 V72 H186 V88 Z M156 72 Q174 60 192 72 Z " +
      "M172 60 V48 H176 V60 Z " +
      "M174 44 Q150 52 138 74 Q156 56 174 50 Z " +
      "M174 44 Q198 52 210 74 Q192 56 174 50 Z",
    support: [
      "M248 100 V60 H264 V100 Z M272 100 V68 H286 V100 Z",
      "M64 100 V80 Q62 72 68 68 Q62 70 58 64 Q66 62 70 66 Q72 58 78 56 " +
        "Q76 64 72 68 Q80 64 86 68 Q78 70 70 74 Q68 78 68 100 Z",
    ],
    field: field([
      [0, 34, 11],
      [96, 28, 9],
      [216, 26, 12],
      [294, 24, 10],
      [322, 28, 13],
      [354, 26, 9],
      [384, 16, 12],
    ]),
  },

  // ── CHARLOTTE ─────────────────────────────────────────────────────────────
  // Bank of America Corporate Center's crown - the "crown jewel" silhouette.
  CHA: {
    landmark: "Bank of America Corporate Center crown",
    signature:
      "M154 100 V42 H190 V100 Z M158 42 V32 H186 V42 Z " +
      // The crown: a ring of short spikes.
      "M160 32 V24 H164 V32 Z M168 32 V20 H172 V32 Z M176 32 V20 H180 V32 Z " +
      "M182 32 V24 H186 V32 Z",
    support: ["M212 100 V52 H232 V100 Z M216 52 L222 40 L228 52 Z", "M250 100 V60 H266 V100 Z"],
    field: field([
      [0, 32, 14],
      [36, 26, 10],
      [66, 24, 16],
      [94, 26, 11],
      [124, 24, 13],
      [194, 14, 12],
      [274, 24, 15],
      [302, 22, 11],
      [328, 26, 14],
      [358, 30, 10],
      [392, 8, 12],
    ]),
  },

  // ── RELOCATION DESTINATIONS ───────────────────────────────────────────────
  // A moved franchise genuinely looks out at somewhere else.

  // Space Needle: saucer on splayed tripod legs.
  Seattle: {
    landmark: "Space Needle",
    signature:
      "M150 100 L162 44 H166 L160 100 Z M180 100 L168 44 H172 L184 100 Z " +
      "M162 44 H172 V38 H162 Z " +
      "M144 34 Q167 22 190 34 Q190 42 167 44 Q144 42 144 34 Z " +
      "M152 30 Q167 24 182 30 Z M166 22 V10 H168 V22 Z",
    support: [
      // Columbia Center's dark curved slab.
      "M216 100 V34 Q216 28 232 28 Q248 28 248 34 V100 Z",
      // Mount Rainier, distant.
      "M290 100 V72 L322 44 L338 60 L356 48 L392 76 V100 Z",
    ],
    field: field([
      [0, 30, 12],
      [34, 24, 9],
      [62, 26, 13],
      [92, 22, 10],
      [118, 24, 12],
      [190, 20, 14],
      [254, 26, 13],
      [284, 20, 10],
    ]),
  },

  // The Strat's tapered tower and pod - Las Vegas's tallest, most legible form.
  "Las Vegas": {
    landmark: "The Strat tower",
    signature:
      "M158 100 L168 42 H176 L186 100 Z " +
      "M152 42 Q172 32 192 42 Q192 50 172 52 Q152 50 152 42 Z " +
      "M162 32 H182 V42 H162 Z M166 24 H178 V32 H166 Z " +
      "M171 10 H173 V24 H171 Z",
    support: [
      // A pyramid and a low resort slab - the Strip in two marks.
      "M228 100 V78 L256 40 L284 78 V100 Z",
      "M300 100 V62 H336 V100 Z",
    ],
    field: field([
      [0, 34, 11],
      [38, 28, 8],
      [70, 26, 12],
      [100, 26, 9],
      [128, 26, 13],
      [196, 26, 10],
      [344, 26, 12],
      [374, 26, 9],
    ]),
  },

  // Churchill Downs' twin spires - Louisville's unmistakable emblem.
  Louisville: {
    landmark: "Churchill Downs twin spires",
    signature:
      "M132 100 V66 H244 V100 Z " +
      "M150 66 V50 H166 V66 Z M152 50 L158 28 L164 50 Z M157 28 V20 H159 V28 Z " +
      "M210 66 V50 H226 V66 Z M212 50 L218 28 L224 50 Z M217 28 V20 H219 V28 Z",
    support: ["M276 100 V58 H294 V100 Z M302 100 V66 H316 V100 Z"],
    field: field([
      [0, 34, 12],
      [38, 28, 9],
      [70, 26, 13],
      [100, 28, 10],
      [248, 24, 11],
      [324, 26, 13],
      [354, 26, 9],
      [384, 16, 12],
    ]),
  },
};

/**
 * The fallback: a plain mid-density city. Deliberately unremarkable - if this
 * ever renders for a real franchise, that franchise is missing a composition
 * and the tests will say so.
 */
export const GENERIC: CityComposition = {
  landmark: "generic city",
  signature: tower(160, 34, 46) + " " + tower(168, 18, 56),
  support: [tower(206, 22, 38), tower(238, 18, 30)],
  field: field([
    [0, 30, 16],
    [34, 26, 12],
    [64, 24, 18],
    [92, 26, 13],
    [122, 24, 15],
    [266, 24, 16],
    [294, 22, 12],
    [320, 26, 15],
    [350, 28, 11],
    [382, 18, 14],
  ]),
};
