# The Whole Simulator, Explained — Being a GM (Job Security, Firing & Career)

The sim isn't just "build a roster forever" — **you have a boss.** The team owner judges you
every season, and you can get **fired.** And your track record follows you from job to job.
This doc explains that career layer in plain language. No code; the matching code is in the
Track B `gm/` files.

---

## 1. You work for the owner

In real life the GM answers to the team's **owner.** The owner doesn't decide trades, but
they decide whether to _keep you._ The sim models this with a single meter: **owner
confidence**, a number from 0 to 100. Do well and it rises; do badly and it falls; hit the
bottom and you're out of a job.

Owner confidence gets translated into a plain-English "job security" label so you always
know where you stand — from _Very Secure_ at the top, down through _Stable_, _Under
Pressure_, _Hot Seat_, to _Critical_ at the bottom.

---

## 2. Expectations — the bar you're measured against

Here's the clever part: the owner doesn't judge you against some fixed standard. Before each
season, they set an **expectation** based on two things:

- **How much you're spending.** A team paying huge salaries is expected to _win_ — you paid
  for it. A cheap team is only expected to develop young players.
- **How good your roster actually is.** A genuinely elite roster gets held to a title
  standard; an expensive-but-mediocre roster (bad contracts) gets some benefit of the doubt;
  a cheap-but-surprisingly-good team earns a bump up.

So the expectation ranges from "just develop your young players" up to "compete for a
championship." **This is what makes it fair:** you're judged against _your own situation_, not
against the league's best team.

---

## 3. The verdict — did you meet the bar?

After the season, the sim compares what **actually happened** (how far you got — missed the
playoffs? lost in the first round? won the title?) against the **expectation** it set. The
result is one of four verdicts:

- **Exceeded** — you did better than expected. Confidence jumps up.
- **Met** — you hit the mark. Small bump up.
- **Fell short** — you underperformed. Confidence drops.
- **Drastically fell short** — a real disaster. Big drop.

And here's the twist that makes spending risky: **high payroll amplifies both the reward and
the punishment.** A cheap team that misses its (already low) bar barely registers. An
extremely expensive team that flops is a full-blown crisis — the confidence hit is multiplied.
Spending big raises the stakes in _both_ directions. (Two smaller factors also nudge
confidence: a thrilled or angry fanbase, and whether the franchise is making or losing
money.)

---

## 4. Getting fired — and what happens after

If owner confidence falls all the way to **zero**, you're **fired.** That franchise (your save
file) _ends_ — it becomes a permanent, read-only record you can look back on but never play
again. (You can also choose to **retire** from a team on your own terms.)

Because an ended league can't be replayed, the sim takes a **permanent snapshot** of your
tenure the moment it ends: how many seasons, your wins and losses, championships, playoff
appearances, your best finish, your career earnings, and how it ended. This snapshot survives
even if the old franchise's data is deleted — it's the durable record of what you did there.

---

## 5. Reputation — your career, not just one job

This is what ties it all together into a _career_. Separate from any single team's owner
confidence, **you** — the GM — carry a **reputation** score that persists across **every**
franchise you've ever run. When a tenure ends, your reputation changes based on what you
accomplished:

- **Championships** boost it a lot.
- **Playoff appearances** boost it.
- A winning overall record boosts it; a losing one hurts.
- **Getting fired** costs you.

Your reputation maps to a career **title** — from **Hall of Fame Executive** at the top, down
through _Respected Executive_, _Steady Hand_, _Journeyman GM_, _Under Scrutiny_, to
**Cautionary Tale** at the bottom.

---

## 6. The job market — reputation opens (or closes) doors

Reputation isn't just a badge — it **gates which teams will hire you.** When you start a new
franchise, you see a **job market**: all 30 teams, but only some will take you:

- A **title contender** (a stacked, ready-to-win roster) only calls a **proven** GM. A rookie
  reputation can't get that job.
- A **rebuild** (a bare-cupboard roster) will hire **anyone** — it's a chance to prove
  yourself.

And _where_ you take a job changes the difficulty. A contender comes with a **short leash** —
the owner expects to win _now_ and starts you with lower confidence. A rebuild comes with a
**patient owner**. So there's real risk/reward in the choice: take the glamorous contender job
and a disappointing season can get you fired fast, or take the rebuild and earn your stripes
with room to grow.

---

## 7. The long game

Put it all together and the sim becomes a **career**, not just a save file. You might start
by taking a rebuild nobody else wanted, grind out a few respectable seasons to build your
reputation, then get hired by a contender and chase a title — knowing that if you flame out,
it costs you, but if you win, you cement your legacy as a Hall of Fame Executive. That arc,
spanning multiple teams and many seasons, is the deepest layer of the whole simulator.

---

**Next in Track A:** how the _software_ is actually shaped — the three parts of the program
and how a single click flows through them. This is the bridge into the line-by-line Track B
docs.

**Matching code (Track B):** the `gm/` files (`jobSecurity`, `expectationLevel`,
`seasonEvaluation`, `careerRecord`, `jobMarket`).
