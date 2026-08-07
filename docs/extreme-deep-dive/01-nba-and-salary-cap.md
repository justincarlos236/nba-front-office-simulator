# The Whole Simulator, Explained — The NBA & the Salary Cap

The salary cap is the **heart** of the simulator — it's what turns "pick the best players"
into a real strategy puzzle. This doc explains the real NBA money rules in plain language,
then shows how the sim copies them. No code; the matching code is in `cap/apron.md` and the
other Track B `cap/` files.

---

## 1. Why does a "salary cap" even exist?

Imagine a sports league where the richest team could simply buy every great player. The
games would be boring — the same team would win every year. To keep things competitive,
the NBA limits how much each team can spend on player salaries. That limit is the **salary
cap.**

The catch: it's not a hard wall. It's a **"soft" cap** — teams _are_ allowed to spend over
it, but only in specific, limited ways, and spending far over it triggers escalating
penalties and restrictions. So the GM's job becomes a balancing act: _build the best team
you can while respecting a web of spending rules._ That balancing act is the fun.

---

## 2. The key dollar lines (from lowest to highest)

Each NBA season has a set of dollar thresholds. Using realistic recent figures (the sim
uses numbers very close to these):

- **The salary cap** — roughly **$140 million** per team. Spend under this and you have
  "cap space" — room to freely sign new players.
- **The luxury-tax line** — roughly **$170 million.** Spend past this and you owe the league
  a **tax penalty** on the overage. (Real teams still do this to win — it's a _choice with a
  cost_, not a ban.)
- **The first apron** — roughly **$178 million.** Cross it and you lose access to some
  roster-building tools.
- **The second apron** — roughly **$189 million.** Cross this, the highest line, and you're
  the most restricted of all — you lose almost every special tool.

So a team's total spending places it in one of **five "tiers"**: under the cap, over the cap
but under the tax, over the tax, over the first apron, or over the second apron. The sim
calls these five tiers **apron levels**, and the whole cap system revolves around figuring
out which tier a team is in. (That's exactly what the `cap/apron.md` code does.)

**The core idea to remember:** _the more you spend, the fewer tools you get._ Spending
money is powerful but it progressively ties your hands.

---

## 3. How an over-the-cap team can still add players: "exceptions"

If the cap were a hard wall, a team already over it could never improve. In reality, the
league grants **exceptions** — specific, limited allowances to sign a player even while over
the cap. The main ones the sim models:

- **The mid-level exception** — lets an over-cap team sign one mid-priced player. There are
  different-sized versions, and (per the "more spending, fewer tools" rule) the higher your
  tier, the smaller the version you get — until the second apron, where you get none.
- **The minimum-salary exception** — _any_ team can always sign a player to a
  league-minimum contract, regardless of spending. This is why a broke, over-the-cap team can
  still fill out its roster with cheap veterans.
- **"Bird rights"** — a team is allowed to **re-sign its own** free agent even if that pushes
  it over the cap. (The real name comes from a 1980s rule involving Larry Bird.) This is
  huge: it's how teams keep their own homegrown stars. The sim models a simplified version.

---

## 4. Contracts — how players are paid

A player isn't paid a single lump sum; they sign a **contract**: an agreement for a certain
number of **years**, with a **salary for each year**. Real contracts have wrinkles the sim
copies:

- **Multiple years with raises** — a deal might pay $20M this year, $21M next, and so on.
- **Guarantees** — some money is "guaranteed" (owed even if the player is cut); some isn't.
- **Options** — a "player option" lets the _player_ choose to stay or leave for a final year;
  a "team option" gives that choice to the _team_.
- **No-trade clause** — a rare perk letting a star block being traded without their consent.
- **Rookie scale** — newly drafted players are paid on a fixed, below-market scale for their
  first few years (that's part of why draft picks are so valuable — cheap young talent).

Because salaries differ year to year, the sim stores a contract as **one record per year**,
so it can always answer "what does this team owe in 2027 specifically?" precisely.

---

## 5. Trades — and why they can't be lopsided on money

A **trade** swaps players (and/or future draft picks) between two teams. The interesting
rule: a team that's over the cap can't just take back _any_ amount of salary. The salary
coming _in_ has to roughly match the salary going _out_, by a formula.

**A simple worked example.** Suppose your team is over the cap and wants to trade a player
who makes **$10 million**. You can't take back a $30M player in return — the money doesn't
match. The rule (simplified) lets you take back a bit _more_ than you send: on a $10M
outgoing salary you could bring back roughly up to **$20M + a small cushion.** Send out
more, and the allowed cushion shrinks (very large salaries match closer to 1-to-1). And the
aprons tighten this further — a second-apron team must match almost exactly and can't even
combine several players' salaries into one big incoming contract.

This is why real NBA trades often include a random-looking extra player or two: teams are
**making the salaries match.** The sim enforces this exact logic before any trade goes
through (see `cap/salaryMatching.md` and `trade/validateTrade.md`).

There's one more trade rule the sim models — the **"Stepien rule"**: a team can't trade away
its first-round draft picks in **back-to-back** future years. (Named after an owner who
infamously traded away too many picks.) It stops a GM from mortgaging the entire future.

---

## 6. How the sim ties it all together

The sim bundles every season's dollar lines into one rulebook and asks a few simple
questions against it, over and over:

1. **"How much is this team spending, and which tier is that?"** → produces the team's apron
   level (`cap/apron.md`, `cap/capSheet.md`).
2. **"Given that tier, what tools can they use?"** → which exceptions are available
   (`cap/apron.md`).
3. **"Is this specific trade legal?"** → checks salary matching, the apron rules, no-trade
   clauses, and the Stepien rule (`trade/validateTrade.md`).
4. **"How much is this contract, per year?"** → drives everything above
   (`cap/capSheet.md`).

Crucially, **all of these rules live in exactly one place** in the code and are reused
everywhere — by the trade screen's live preview, by the server that actually approves the
trade, and by the computer opponents. That's on purpose: if the rule lived in three places,
they could disagree, and a trade might look legal on one screen but get rejected by another.
One rulebook, consulted by everyone.

---

## 7. The one rule that never bends

A theme you'll see throughout the sim: **money creates pressure, but it never lets you break
the cap.** Later systems (team finances, a rich owner, fan revenue) affect how _willing_
ownership is to spend and how much _patience_ you get — but no amount of cash ever grants
extra cap space or waves a player onto your roster illegally. The salary cap stays the
final referee. That separation — "money is consequence, the cap is law" — is a deliberate
design choice that keeps the strategy honest.

---

**Next in Track A:** how a _season_ actually plays out — the schedule, simulating games, the
playoffs, and the offseason where players age and the draft happens.

**Matching code (Track B):** `cap/apron.md` (done), then `cap/constants.md`,
`cap/capSheet.md`, `cap/salaryMatching.md`, `trade/validateTrade.md`.
