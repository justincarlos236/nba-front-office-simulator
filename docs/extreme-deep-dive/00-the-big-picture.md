# The Whole Simulator, Explained — The Big Picture

This doc explains what the simulator _is_, start to finish, for someone brand new to both
programming **and** the NBA. No code here — just the idea, the real-world rules it copies,
and how all the pieces fit together. Later docs zoom into each piece.

---

## 1. What is this thing?

It's a **website you can play like a game.** You take over a real NBA basketball team, not
as a player or coach, but as the **General Manager** (GM) — the person in charge of
building the team. You decide who's on the roster: who to trade, who to sign, who to draft.
Then you **simulate** (fast-forward) games and seasons and live with the results.

Think of it like a very detailed fantasy-sports/manager game, built as a real web app you
sign into with an email and password.

### What's a "General Manager"?

In real basketball there are a few different jobs:

- **Players** play the games.
- The **Head Coach** decides strategy and who's on the floor.
- The **General Manager (GM)** builds the _roster_ — which players the team even has. The GM
  makes trades, signs free agents, and drafts new players, all while staying inside the
  league's spending rules.

**You are the GM.** The simulator is about the _front-office_ job — assembling the team —
not about coaching individual plays. (That's why it's called a "Front Office Simulator.")

---

## 2. The real-world things it copies

To understand the sim, it helps to know the real NBA concepts it models. Here are the big
ones in plain terms:

- **A roster** — the ~15 players on a team.
- **Player ratings** — how good each player is, as a number (roughly 60 to 99). A superstar
  might be a 98; a deep-bench player a 65. The sim gives every real player a rating based on
  their real statistics.
- **The salary cap** — the NBA limits how much a team can spend on player salaries. It's a
  "soft" limit: you _can_ go over it, but only in specific ways, and going far over triggers
  penalties. This is the central puzzle of being a GM: build the best team you can _within
  the money rules_.
- **The luxury tax and "aprons"** — extra spending thresholds above the cap. The more you
  spend past them, the more it costs and the fewer roster tools you're allowed to use.
- **A trade** — swapping players (and/or future draft picks) with another team. Trades have
  to be "legal" under the salary rules — you can't just take back way more salary than you
  send out.
- **Free agency** — signing a player who isn't currently under contract with anyone.
- **The draft** — once a year, teams pick new young players (rookies) coming into the league.
  The worst teams get the best odds at the top picks (via a "lottery").
- **A season** — ~82 games per team, which produce standings (win/loss records).
- **The playoffs** — after the season, the top teams compete in a bracket to win the
  championship.
- **Contracts** — each player is signed for a certain number of years at a certain salary
  per year.

If some of these are fuzzy, that's fine — each gets its own Track A doc later. The point
for now: the sim is a faithful (if simplified) copy of how running an NBA team actually
works.

---

## 3. What you actually _do_ — the core loop

Playing the sim looks like this:

1. **Sign up / sign in** with an email and password.
2. **Start a franchise** ("save file") by choosing a team to run. There's a twist: a "job
   market" — a great team will only hire you if you've built up a good reputation, while a
   rebuilding team will hire anyone.
3. Your team is set up with the **current real NBA roster** — real players, on their real
   teams, with realistic ratings.
4. **Manage the team:** make trades, sign free agents, set your lineup/rotation, adjust the
   business side (ticket prices, facility spending).
5. **Simulate games** — the computer plays out your games (and every other team's) and
   produces scores, standings, and stats.
6. **Reach the playoffs, then the offseason** — where players get better or worse with age,
   some retire, awards are handed out, the draft happens, and free agency opens.
7. **Live with consequences over many seasons:** the team owner judges you each year against
   expectations. Do well and you're secure; do badly and you can get **fired**. Your
   **reputation** as a GM carries across every team you've ever run.

That loop — manage, simulate, face consequences, repeat — is the whole game.

---

## 4. A tour of the big pieces

Here are the major systems, and a one-paragraph "what it does." Each has its own deep-dive
later.

- **Rosters & ratings.** Every real player is given a rating from their real stats, plus a
  "potential" (how good they might become). Young players can improve; older players
  decline. Your team is built from these players.
- **The salary cap engine.** The rulebook. It knows every team's total spending, which
  "tier" that puts them in, and whether a given move is allowed. It's the referee that makes
  team-building a real strategic puzzle instead of "grab all the best players."
- **Trades.** You propose swaps of players and picks. The computer team on the other side
  decides whether the deal is good _for them_ (based on its own strategy), and the salary
  rules decide whether it's even legal.
- **Free agency & the draft.** Two other ways to add players: sign available veterans, or
  draft young prospects (with the worst teams getting the best draft odds).
- **The simulation.** Turns your roster into results. Instead of playing out every basketball
  possession, it uses each team's overall strength to decide, game by game, who's likely to
  win, then produces believable scores and individual stat lines.
- **The season & playoffs.** A full schedule, standings, a play-in tournament, a playoff
  bracket, a champion, and end-of-season awards (MVP, etc.).
- **The business side.** Your team makes money (tickets, TV, merchandise) and spends it
  (salaries, staff, facilities). Winning and star power grow the fanbase and the franchise's
  value. Money creates _pressure_ — but it never lets you break the salary cap.
- **Being a GM (career mode).** The team owner sets a yearly expectation based on your
  spending and roster. Meeting or missing it moves an "owner confidence" meter; hit rock
  bottom and you're fired. Your long-term reputation opens (or closes) better jobs.
- **Supporting systems.** Injuries, player morale and personalities, coaching staff, an
  All-Star weekend, a news feed of everything happening around the league — all the texture
  that makes a season feel alive.

---

## 5. How the pieces connect (the mental map)

The systems aren't separate islands — they feed each other. A simple way to picture it:

```
     your roster ─► team strength ─► simulate games ─► wins/losses & stats
          ▲                                                  │
          │                                                  ▼
   trades / free agency / draft ◄──── the salary cap says what's allowed
          ▲                                                  │
          │                                                  ▼
   your reputation & the owner's confidence ◄─── did you meet expectations?
                                                             │
   fans & money ◄─── winning + stars ─────────────────────► pressure to perform
```

Read it as: your roster decides how strong your team is, which decides how many games you
win, which decides whether you met the owner's expectations, which moves your job security
and reputation — and meanwhile winning and star players grow your fanbase and money, which
adds its own pressure. Every decision ripples outward. That interconnectedness is what makes
it feel like a real front office.

---

## 6. How the _software_ is shaped (very high level)

You don't need this to _play_, but since these docs are about understanding the whole thing,
here's the shape of the program itself, in everyday terms. There are three parts:

1. **The pages you see** (the "front end"). The screens in your browser — your roster, the
   trade builder, the standings. These are built with tools called **React** and **Next.js**.
   Most pages simply _show_ information; a few are interactive (like dragging players to set
   your lineup).
2. **The brain** (the "rules and math"). Behind the pages is a big collection of small,
   focused "machines" (functions) that hold all the actual rules: the salary-cap math, the
   game simulation, the trade logic, the rating formulas. This is the bulk of the code, and
   it's written to be simple and trustworthy — each machine takes some information and hands
   back an answer, nothing more.
3. **The memory** (the "database"). A **PostgreSQL** database — think of it as a giant, very
   organized set of spreadsheets — remembers everything: your account, your franchise, every
   team, player, contract, game result, and trade. When you make a move, the app updates
   these records; when you open a page, it reads them back.

A single action ties all three together: you click a button on **a page**, the app runs the
matching rules in **the brain**, and saves the result to **the memory** — then re-shows the
page with the new information. Every doc in Track B is really about one small piece of "the
brain."

---

## 7. Where to go next

- To keep learning the **concepts**, continue with the other Track A docs (the NBA & cap
  primer, how a season works, the money game, the draft, being a GM).
- To see how any piece is **actually built**, open the matching Track B doc (like
  `cap/apron.md`) and read the real code line by line.
- For a faster, less beginner-focused version, the sibling folders `docs/handbook/`,
  `docs/code-guide/`, and `docs/code-deep-dive/` cover the same ground for readers who
  already know how to program.

Welcome in. None of this is as complicated as it looks once you see how the pieces snap
together — that's exactly what the rest of these docs are for.
