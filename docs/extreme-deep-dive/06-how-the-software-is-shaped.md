# The Whole Simulator, Explained — How the Software Is Shaped

This is the bridge between "what the sim does" (Track A) and "here's the actual code" (Track
B). It explains, for a beginner, how the _program itself_ is organized — the parts, how they
talk to each other, and what happens when you click a button. Once you get this, the
line-by-line code docs will make much more sense.

---

## 1. Three parts

Almost every web app has three parts, and this one is no different. A helpful analogy: a
restaurant.

1. **The pages you see — the "front end"** (the dining room). This is what shows up in your
   web browser: your roster screen, the trade builder, the standings table. It's what you
   look at and click. Built with tools called **React** and **Next.js**.
2. **The rules and math — the "brain"** (the kitchen). Behind the pages is a large collection
   of small, focused functions that hold all the actual logic: the salary-cap math, the game
   simulation, the rating formulas, the trade rules. This is most of the code. You never see
   it directly, but it does all the real work.
3. **The memory — the "database"** (the pantry and the recipe book). A **PostgreSQL**
   database (imagine a giant, extremely organized set of spreadsheets) permanently remembers
   everything: your account, your franchise, every team, player, contract, game, and trade.

The parts have clear jobs: the front end _shows and collects_, the brain _decides_, the
database _remembers._

---

## 2. The most important idea: "rules" are kept separate from "plumbing"

If you remember one thing about how this code is built, make it this.

The "brain" is split into two kinds of code:

- **Pure rules** (the recipes). These are functions that take some information and hand back
  an answer, and do _nothing else_ — they don't touch the database, the internet, or the
  clock. Feed the same inputs in, you always get the same answer out. Example: "given these
  contracts, what's this team's total spending and apron level?" These are easy to trust and
  easy to test, because there are no surprises.
- **Plumbing** (the waiters). These are the functions that deal with the messy real world:
  read information out of the database, hand it to the pure rules, take the answer back, and
  save it to the database. In this project they're called **server actions.**

**Why split them?** Because the hard part — the actual rules — becomes simple, predictable,
and testable, while all the messy "talk to the database" stuff is quarantined in a thin
layer. It also means a rule (like "is this trade legal?") is written **once** and reused
everywhere, so different parts of the app can never disagree about it.

If you open a code file and it never mentions the database, you're looking at **pure rules.**
If it starts with the words `"use server"` and talks to the database, you're looking at
**plumbing.** That one distinction unlocks the whole codebase.

---

## 3. What happens when you click a button

Let's trace a real example — you click **"Simulate next game."** Here's the journey, in
order:

1. **The page** (front end) sends your request to a **server action** (plumbing).
2. The server action first checks **who you are** — are you logged in? — and **that you own
   this franchise.** (You can't mess with someone else's save.)
3. It **reads** the needed information from the **database**: the teams, their players'
   ratings.
4. It hands that information to the **pure rules** — the game simulator — which figures out
   who wins and produces a believable score. (The rules don't know or care about the
   database; they just do math.)
5. The server action **saves** the results back to the **database** (the new game, the
   updated standings).
6. It tells the front end to **refresh** the page, so you now see the updated score and
   record.

Every action in the whole app follows this same shape: **check who you are → read → run the
rules → save → refresh.** Once you've seen one, you've seen them all.

A neat detail: there's no separate "app" for the brain and the pages — they're one program in
one language (TypeScript). A page can ask the database for data directly when it loads, and a
button can call a server-side rule directly. This keeps the whole thing in one place instead
of two apps that have to be wired together.

---

## 4. How they make sure it works: testing

Because the rules are "pure" (same input → same answer), the developers can write
**tests** — little programs that feed a rule specific inputs and check it gives the right
answer. For example: "a team spending exactly at the tax line should come back as a
_taxpayer_." There are around **780 of these tests**, and they run automatically. If someone
changes a rule and accidentally breaks it, a test fails and flags it before it ever reaches
you. This is a big part of why a project this large stays trustworthy.

---

## 5. The tools, named (so the words aren't scary)

You'll see these names in the code and the other docs. Here's what each _is_, in one line:

- **TypeScript** — the language everything is written in (JavaScript + safety-checking types).
- **React** — the tool for building the interactive pages.
- **Next.js** — the framework that organizes the pages and lets the front end call server
  code directly.
- **PostgreSQL** — the database (the permanent memory).
- **Prisma** — a translator that lets the code talk to the database using normal-looking code
  instead of raw database language, and keeps everything typed and safe.
- **Auth.js** — handles logging in securely (including scrambling passwords so they're never
  stored as plain text).
- **Tailwind CSS** — the tool for styling how the pages _look._
- **Vitest / Playwright** — the tools that run the tests.

You don't need to master any of these to understand the sim. They're just the branded names
for "the language," "the pages," "the database," and so on.

---

## 6. Where to go from here

You now have the full picture: what the sim _is_ (docs 00–05) and how the program is _shaped_
(this doc). From here, **Track B** takes any single piece of "the brain" and walks through its
actual code line by line, in the same plain language. A good first stop is
[cap/apron.md](./cap/apron.md) — a short, real file that decides which "spending tier" a team
is in. With everything you've read, that code will read like plain English.

Welcome to the machine. It's big, but it's built out of small, understandable pieces — and now
you know how they fit.
