# Photo Sourcing Brief — Phase D

**Status:** awaiting selection. The authored layer (skylines, phase light,
textures) shipped in `fdd946e`. This brief covers the photography that layer
was deliberately built *around*.

---

## Read this first

**Only four surfaces get a photograph.** Everything else is authored, and that
is a decision rather than a shortfall.

The reason is The Wire's premise: a front-office document system whose
documentary baseline exists so that a small number of moments can break it. A
photograph is the loudest possible break. Spend it on thirty surfaces and there
is no baseline left to break — the product becomes a sports website with a
stock-photo header, which is precisely the outcome the redesign is fighting.

**Why I am not choosing these myself.** `WebFetch` returns text, not pixels. I
cannot look at a photograph and tell you whether it is any good, whether the
crop works, or whether a face is in the wrong third of the frame. I can specify
exactly what each slot needs and why, and I can wire in what you pick. I cannot
pretend to have judged an image I have never seen. Every candidate link below is
a *search starting point*, not an endorsement of a specific image.

**Licensing.** Every source listed is CC0 / public-domain-equivalent
(Unsplash, Pexels, Wikimedia Commons PD). No Getty, no AP, no NBA.com. This is a
portfolio project with **no IP licence**, so there must be **no NBA logos, no
team marks, no identifiable current NBA players, and no arena signage that names
a real franchise**. A generic arena interior is fine; Madison Square Garden with
Knicks branding visible is not. This constraint is non-negotiable and rules out
most "NBA arena" search results.

**File placement.** Put chosen files in `public/photo/` using the exact filename
in each slot. Then tell me and I will wire them in, add the halftone treatment,
and record every source and licence in `CREDITS.md`.

**Format.** Supply the largest clean version you can find; I will generate
`.avif` + `.webp` at the listed widths and keep an `.jpg` fallback. Do not
pre-crop — I need the original framing to art-direct the crop in code.

---

## Slot 1 — Draft night stage

| | |
|---|---|
| **Surface** | `PickRevealStage` — the Broadcast moment behind the pick reveal |
| **File** | `public/photo/draft-stage.jpg` |
| **Aspect / size** | 21:9, ≥2400×1030 |
| **Treatment** | Halftone screen + heavy darkening; sits *behind* type |

**Subject.** An empty or near-empty stage under theatrical lighting, shot from
the floor looking toward it. A podium is ideal. Not a basketball court.

**Camera.** Low and frontal, roughly eye-level with the stage edge. Wide.

**Light.** Hard directional pools against deep shadow. High contrast, mostly
dark — this image must sit under white type at 4.5:1 without a scrim doing all
the work.

**Composition.** Negative space through the **centre and upper third**, where
the prospect's name renders. Visual interest at the edges only.

**People.** None, or unlit silhouettes in the far background. No recognisable
faces.

**Brightness.** Dark. Average luminance under ~25%.

**Search phrases:** `empty stage spotlight dark`, `podium theatrical lighting`,
`auditorium stage low angle`, `conference stage dark backdrop`

**Candidates:**
- https://unsplash.com/s/photos/empty-stage-spotlight
- https://www.pexels.com/search/stage%20lights%20dark/
- https://unsplash.com/s/photos/podium
- https://www.pexels.com/search/auditorium/

---

## Slot 2 — The arena, from the tunnel

| | |
|---|---|
| **Surface** | Playoffs / `LiveGameExperience` header |
| **File** | `public/photo/arena-tunnel.jpg` |
| **Aspect / size** | 16:9, ≥2000×1125 |
| **Treatment** | Halftone + accent-tinted duotone |

**Subject.** An arena bowl seen from a tunnel or vomitory — the threshold view,
with the dark tunnel framing a lit bowl beyond. This is the single most
evocative sports image that requires no branding.

**Camera.** From inside the tunnel mouth, looking out and slightly up. The
tunnel's darkness should occupy the outer ~30% as a natural vignette.

**Light.** Bowl lit, tunnel dark. The contrast between them is the whole photo.

**Composition.** The bright opening off-centre, ideally right-of-centre.

**People.** A distant, non-identifiable crowd is good — it supplies scale and
occasion. No players, no faces in focus, no jerseys legible.

**Brightness.** Dark overall with a bright core.

**Search phrases:** `arena tunnel entrance`, `stadium tunnel view bowl`,
`sports arena interior empty seats`, `basketball arena wide empty`

**Candidates:**
- https://unsplash.com/s/photos/stadium-tunnel
- https://www.pexels.com/search/arena/
- https://unsplash.com/s/photos/basketball-arena
- https://commons.wikimedia.org/w/index.php?search=arena+interior+empty

⚠️ **Highest branding risk of the four.** Most arena photos carry sponsor
boards and team marks. Check the full frame at 100% before choosing.

---

## Slot 3 — Championship confetti

| | |
|---|---|
| **Surface** | Title-won moment; `BannerRafters` header on the history page |
| **File** | `public/photo/championship.jpg` |
| **Aspect / size** | 16:9, ≥2000×1125 |
| **Treatment** | Halftone, heavy crush toward black, accent duotone |

**Subject.** Confetti falling in an arena, or a rafter view with banners in
shadow. The abstraction is the point — this reads as *a* championship, not a
specific one.

**Camera.** Looking up, or a tight crop on falling confetti with the bowl thrown
out of focus behind.

**Light.** Bright sources flaring against dark structure.

**Composition.** Loose and abstract. This is the one slot where texture beats
subject; a near-abstract confetti field is preferable to a legible celebration.

**People.** Strongly prefer none. Any crowd must be unidentifiable.

**Brightness.** Dark with bright specks.

**Search phrases:** `confetti falling dark`, `arena rafters banners`,
`celebration confetti stadium`, `gold confetti black background`

**Candidates:**
- https://unsplash.com/s/photos/confetti
- https://www.pexels.com/search/confetti/
- https://unsplash.com/s/photos/celebration-confetti
- https://commons.wikimedia.org/w/index.php?search=championship+banners+arena

---

## Slot 4 — The desk

| | |
|---|---|
| **Surface** | Sign-in / marketing landing; optionally the empty-save state |
| **File** | `public/photo/desk.jpg` |
| **Aspect / size** | 3:2, ≥2000×1333 |
| **Treatment** | Paper grain, desaturated nearly to monochrome |

**Subject.** A working desk surface, shot from above — paper, a pen, a folder.
No computer, no phone, nothing that dates the image. This is the most
on-premise image in the set: it *is* the product's metaphor.

**Camera.** Directly overhead (flat lay), or a steep three-quarter angle.

**Light.** One soft directional source from upper-left, per the **One Lamp**
rule the rest of the system obeys.

**Composition.** Objects toward one side; a broad empty region of desk or paper
for the sign-in form.

**People.** None. Hands are acceptable if unidentifiable, but empty is better.

**Brightness.** Mid-to-dark. Dark wood or a grey surface, not a bright white
scandi desk — it must sit inside a `#0B0F14` interface.

**Search phrases:** `dark desk flat lay paper`, `documents desk overhead moody`,
`office desk dark wood notebook`, `paperwork desk top view`

**Candidates:**
- https://unsplash.com/s/photos/desk-flat-lay
- https://www.pexels.com/search/desk%20paper/
- https://unsplash.com/s/photos/documents
- https://www.pexels.com/search/notebook%20desk%20dark/

---

## Explicitly excluded

Recording these so the reasoning survives, and so nobody re-adds them later:

- **Dashboard header** — has the authored office window (your city, phase
  light). A photo here would show the same building for all 30 franchises,
  which is strictly worse than what already ships.
- **All Workbench surfaces** (trade builder, free agency, rotation) — these are
  tools. A photograph behind a working instrument is noise.
- **All Ledger surfaces** (finances, transactions, standings) — dense figures.
  Photography actively damages legibility here.
- **Player pages** — would require real player likenesses. No licence, and
  fabricating them would misrepresent real people.
- **Team pages** — would require team marks. No licence.

---

## After you choose

1. Drop files into `public/photo/` with the filenames above.
2. Tell me which slots you filled — partial is fine; each slot degrades
   independently to the authored treatment already in place.
3. I will generate the responsive formats, wire in halftone/duotone, verify text
   contrast over each image at every breakpoint, and write `CREDITS.md` with
   source URL, photographer, and licence per file.

**Nothing here is load-bearing.** Every one of these four surfaces works right
now without a photograph. If a slot never gets filled, the product is complete.
