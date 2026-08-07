# The Whole Simulator, Explained — How a Season Works

This walks through one full season in the sim, start to finish, in plain language: the
schedule, playing (simulating) games, the playoffs, and the busy "offseason" where players
age and the draft happens. No code; the matching code lives in the Track B `simulation/`
files and the big `actions/offseason` walkthrough.

---

## 1. First, the schedule

Before any games are played, the sim builds a **schedule** — a list of who plays whom, and
on which "day." A real NBA regular season is **82 games per team** (1,230 games across all
30 teams), and it's not random who you play:

- You play teams in your own **division** (your closest geographic rivals) the most.
- You play the rest of your **conference** (your half of the league) a medium amount.
- You play the _other_ conference the least.

The sim reproduces this exact mix, and it also spreads the games across a realistic
calendar (roughly October to April) with a rule that **no team plays three days in a row**
(matching how the real league avoids exhausting teams). You don't have to think about any
of this — it's set up automatically when your franchise starts. It just means the season
_feels_ real: you have rivals you see often and distant teams you rarely play.

---

## 2. Playing games — "simulating"

You don't control the players during a game. Instead you **simulate** — press a button and
the computer plays the games out and hands you the results (scores, who won, individual
player stat lines).

**How does the computer decide who wins?** It doesn't play out every bounce of the ball.
Instead:

1. It measures each team's overall **strength** — basically a weighted average of its
   players' ratings, with the best players counting the most (because in real basketball,
   stars matter more than bench players).
2. It turns the _difference_ in strength between the two teams into a **win probability** —
   a percentage chance the home team wins. A slightly better team might be ~60% likely to
   win; a much better team ~85%. Note it's _never_ 100% — that's on purpose, because in real
   life upsets happen.
3. It "flips a weighted coin" using that probability to pick the winner, then makes up a
   believable final score.

There's also a small **home-court advantage** baked in (home teams win a bit more often,
just like reality), and your **head coach's quality** nudges the odds slightly.

**Why not simulate every possession?** Because it would be slow, and this approach is fast,
believable, and — importantly — _predictable when testing_. (The randomness comes from a
"random number machine" the code can swap for a fake, predictable one during testing, so
the developers can check the logic gives the right answers.)

You can sim one game at a time, or "sim the next 10." Behind the scenes, to avoid the
website timing out, it plays games in **small batches** and keeps going until your team has
played the number you asked for — while every other team's games in that window get played
too, so the whole league stays in sync.

---

## 3. The standings

As games are played, each team piles up **wins and losses** — that's the **standings**, the
ranking of teams by record. The standings decide who makes the playoffs and who gets good
draft odds. They're also what the team owner watches to judge _you_.

---

## 4. Mid-season: All-Star Weekend

About halfway through, the season pauses for **All-Star Weekend** — an exhibition showcase
where the league's best players are selected and play a fun, low-stakes game, plus side
contests (like the slam-dunk contest). It doesn't affect the standings; it's flavor that
makes the season feel alive. The sim marks the break and won't let you sim past it until
you've viewed (or skipped) the weekend.

---

## 5. The playoffs

After all 82 games, the best teams enter the **playoffs** — a single-elimination-style
bracket to crown a champion. A few pieces:

- **The play-in tournament** — the teams ranked 7th–10th in each conference play a few
  extra games for the last two playoff spots. (This gives more teams something to play for
  late in the season.)
- **The bracket** — the qualifying teams are seeded (ranked), and higher seeds get
  **home-court advantage.**
- **Best-of-7 series** — unlike the regular season's single games, each playoff round is a
  _series_: the first team to win **4 games** advances. Home court alternates in the real
  NBA "2-2-1-1-1" pattern (the higher seed hosts games 1, 2, 5, and 7).
- Win four rounds and you're the **champion.**

The sim can play these out automatically, or — for _your own_ team's playoff games — show a
special **quarter-by-quarter "live" experience**, where the score builds up period by period
instead of just appearing. (It's carefully tuned so this dramatic version still agrees with
the normal odds over the long run.)

---

## 6. Awards

At season's end, the sim hands out the real NBA awards, decided by the players' stats:
**MVP** (Most Valuable Player), **Rookie of the Year**, **Most Improved Player**, **Defensive
Player of the Year**, **Sixth Man of the Year**, and **Coach of the Year**. These become part
of a player's legacy and show up in the news feed.

---

## 7. The offseason — the busiest part

Between seasons, a lot happens all at once. When you click "advance to next season," the sim
runs a long, careful sequence (it first checks you've actually finished the playoffs and the
draft, so nothing gets skipped). In order, roughly:

1. **Players get better or worse with age.** This is what gives your save a _timeline_:
   - Young players (up to ~26) with room to grow **improve** toward their potential — faster
     if you have a good development coach, they played real minutes, they're happy, and you
     invested in facilities.
   - Players in their prime (~27–29) drift a little up or down.
   - Players past ~30 **decline**, faster the older they get (though a good coach, minutes,
     and morale can soften it — never reverse it).
2. **Some old players retire.** Retirement risk climbs after age 33 and is forced by 41, so
   nobody plays forever, and the talent pool refreshes.
3. **The owner judges your season.** They set an _expectation_ before the season (based on
   how much you spent and how good your roster was), compare it to what actually happened,
   and adjust their **confidence** in you. (This is the "being a GM" system — its own Track A
   doc.)
4. **The books are closed.** Every team's season revenue and expenses are tallied into a
   profit or loss, cash and franchise value update, and the fanbase's happiness is
   recalculated. (The "money game" — also its own doc.)
5. **Computer teams re-sign their own free agents** and shuffle their rosters, so the whole
   league keeps evolving, not just your team.
6. **The next season is set up** — a fresh schedule, new draft picks added to the rolling
   window, and a new expectation for you.

Then, before that next season tips off, you go through the **draft** (add rookies) and **free
agency** (sign available players). And the loop begins again.

---

## 8. The big takeaway

A "season" isn't one system — it's the moment where _everything_ connects. Your roster
decides your strength, which decides your wins, which decide your playoff fate and the
owner's judgment; meanwhile the offseason quietly reshapes every player and every team's
future. Play enough seasons and you'll watch a young player you drafted grow into a star,
a beloved veteran age and retire, and your own reputation rise or fall. That long arc — not
any single game — is the real experience.

---

**Next in Track A:** the money game (how your team earns and spends, and why a rich, happy
franchise gives you more room to maneuver).

**Matching code (Track B):** the `simulation/` files, plus the `actions/offseason`
walkthrough already summarized in `docs/code-deep-dive/08-server-actions-runtime-flow.md`.
