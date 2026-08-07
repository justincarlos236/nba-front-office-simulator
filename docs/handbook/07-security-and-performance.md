# 07 — Security & Performance

## Part A — Security

### 1. Authentication (proving _who you are_) — `src/auth.ts`, `actions/auth.ts`

- **Library:** Auth.js (NextAuth v5) with the **Credentials** provider (email +
  password). Auth.js handles the session cookie, CSRF protection, and the
  sign-in/out plumbing so I'm not hand-rolling security-critical code.
- **Password hashing:** passwords are hashed with **bcrypt** (`bcrypt.hash(pw, 10)`)
  before storage. The database only ever stores the hash (`User.passwordHash`),
  never the plaintext. On login, `bcrypt.compare` checks the entered password
  against the stored hash.
  - **Why bcrypt (and the "10"):** bcrypt is a _slow, salted_ hashing algorithm
    designed for passwords. The salt means two users with the same password get
    different hashes (defeats rainbow tables); the "10" is the **cost factor** —
    it makes each hash deliberately expensive so brute-forcing stolen hashes is
    slow. A fast hash like SHA-256 would be the _wrong_ choice here.
- **Sessions:** **JWT strategy** — after login, the user gets a signed token
  (stored in a cookie) carrying their user id. Each request verifies the token
  instead of hitting the database for a session row. A callback copies the user
  `id` into the token/session so server code can read `session.user.id`.
- **`trustHost: true`:** required off-Vercel so Auth.js accepts the deployment
  host (documented in the config).

### 2. Authorization (what you're _allowed to do_)

Authentication ≠ authorization. Every server action does **two** checks:

1. **Authenticated?** `const session = await auth()` → no session → redirect to
   sign-in.
2. **Owns the resource?** Load the league and confirm `league.ownerId ===
session.user.id` before reading or writing it.

**Why this matters:** without the ownership check, a signed-in user could pass
someone else's `leagueId` and manipulate a league that isn't theirs (an "insecure
direct object reference" — a classic vulnerability). The check makes the server the
authority, not the URL.

### 3. Server-authoritative logic (never trust the client)

Important rules are enforced **on the server**, even when the UI already prevents
them. Example: the **GM job-market reputation gate**. The page hides jobs your
reputation can't clear, _and_ `createLeagueAction` re-checks the gate server-side
and throws if you try to start a job you're not qualified for. **Why:** the browser
is untrusted — anyone can forge a form POST — so the authoritative rule lives on
the server. The client-side hiding is just UX.

### 4. Input validation — Zod

Free-text/untrusted input (sign-up, sign-in) is validated with **Zod** schemas at
the top of the action (e.g. email is a valid email, password ≥ 8 chars). **Why a
runtime validator when I have TypeScript?** TypeScript types are erased at runtime;
form data arrives as untyped `FormData`. Zod re-checks the actual shape at the
trust boundary and returns friendly errors.

### 5. SQL-injection prevention — Prisma

All database access goes through **Prisma**, which **parameterizes** every query —
user input is always sent as a bound parameter, never concatenated into a SQL
string. So input like `'; DROP TABLE users; --` is treated as a literal value, not
executable SQL. I never build raw SQL from user input.

### 6. Security interview Q&A

**Q: How do you store passwords?** _bcrypt hashes with a salt and a cost factor —
never plaintext; verified with `bcrypt.compare`. bcrypt is deliberately slow to
resist brute force._

**Q: Difference between authentication and authorization here?** _Authentication is
Auth.js verifying the session (who you are). Authorization is the per-action
ownership check (`league.ownerId === session.user.id`) that gates what you can
touch._

**Q: How do you prevent SQL injection?** _I never write raw SQL from user input;
Prisma parameterizes all queries, so input can't be executed as SQL._

**Q: A user edits the form to submit another user's league id — what happens?**
_The action loads that league and rejects it because the owner id doesn't match the
session. Authorization is server-side, so forging the request doesn't help._

## Part B — Performance

### 1. Server-side rendering (the biggest lever)

Pages are **React Server Components** — they fetch their data on the server and
send finished HTML. The browser doesn't download a big client bundle just to then
fetch data. For a data-heavy, read-mostly app (rosters, standings, dashboards),
this means fast first paint and small JS payloads. Only interactive pieces (the
drag-and-drop rotation editor, charts) ship as client components.

### 2. Database indexes

Columns used to filter the hot queries are indexed — e.g. `LeaguePlayer.leagueTeamId`
(load a team's roster), the `Game` day index (load the schedule in order),
`PlayerSeasonStat.playerId`. Indexes turn a full-table scan into a fast lookup,
which matters as a long save accumulates thousands of games and players.

### 3. Precomputed snapshots

`FinancialSnapshot` and `FanHappinessSnapshot` store one row per season, so a
multi-season **trend chart is a cheap `SELECT`** instead of replaying every past
season's math on each page load. Trading a little storage for a lot less compute.

### 4. Chunked season simulation

As in doc 04, simulating a season is done in **bounded chunks** to stay under
serverless time limits — a performance/reliability decision driven by the
deployment model.

### 5. Caching & revalidation

Next.js caches rendered pages. After a write, the action calls
`revalidatePath(...)` to invalidate exactly the affected pages so they re-render
with fresh data. Pages whose correctness depends on live session/DB state (like the
job market) are marked `dynamic = "force-dynamic"` so they never serve a stale
cached copy.

### 6. Cheap core, expensive edges

The pure logic (cap math, one game) is O(1)–O(n) and trivial; the real cost is
**database I/O**. So the optimizations target I/O (indexes, snapshots, chunking,
selecting only needed columns) rather than micro-optimizing arithmetic.

## Part C — Trade-offs (have these ready)

| Decision                                            | Upside                         | Trade-off / what I'd revisit                     |
| --------------------------------------------------- | ------------------------------ | ------------------------------------------------ |
| Statistical game sim (not possession-by-possession) | Fast, deterministic, testable  | Approximate box scores                           |
| Box-score ratings (no BPM/VORP)                     | Free, legal data               | Ratings less precise than a paid/advanced source |
| Generated draft prospects                           | Always works                   | Not real prospects (planned to replace)          |
| Server actions instead of REST                      | Less code, built-in auth       | No public API for third parties                  |
| JWT sessions                                        | No DB hit per request          | Can't instantly revoke a token server-side       |
| Single-user leagues                                 | Simple state model             | No real-time multiplayer                         |
| Approximate CBA figures                             | Realistic enough, maintainable | Not an official audited record                   |

**How to talk about trade-offs:** the point isn't that these are flaws — it's that
each was a _deliberate_ choice matching the project's goals (a fast, legal,
maintainable, well-tested single-player game), and you know exactly what you'd
change if the goals changed.
