# Getting local dev off the production database

**Status: Proposal. Nothing here is built.** Written 2026-10-18, after a local
session wrote fixture data into production.

---

## Why this exists

On 2026-10-18 a local dev session pointed at the production Supabase project
wrote, to real rows:

- six Duluth comps onto 1653 Sylvan Rd SW, a house in Atlanta
- that house's blank facts, filled from the fixture subject — lot size, last
  sale date, last sale price, beds and baths
- `facts_source = 'rentcast'` over data that came from a JSON file

None of it was malicious or even careless in the usual sense. `RENTCAST_MODE`
defaulted to mock, which is correct — it stopped the request from being spent.
But mock was a *read-side* idea, and nothing stopped the fixture it returned
from being written. The database it was written to was production, because
`.env.local` points there and always has.

The write-side half is fixed in this PR: `assertNotMockMode` refuses the write
at the point the data lands. **That closes the fixture hole and nothing else.**
A local session can still write real-looking data to production by accident —
deleting a lead while clicking around, running a batch add against live rows,
testing a stage change. The only durable fix is for local dev to point
somewhere that is not production.

## What has to stay true

1. **Playwright keeps working.** The suite logs in as a real user against a real
   Postgres with RLS. An in-memory fake would not exercise the policies, and
   RLS is where a context bug becomes a data leak.
2. **Migrations stay the source of truth.** `supabase/migrations/` already
   describes the whole schema. Whatever we point at has to be built from those
   files, not hand-assembled.
3. **No production credentials in a dev shell.** The current `.env.local`
   carries the production service-role key, which bypasses RLS entirely. That
   is the actual weapon in the room.
4. **One command to get a working database.** Anything longer gets skipped and
   someone points at production "just for a minute".

---

## Option A — local Supabase (`supabase start`)

A full Supabase stack in Docker on the machine: Postgres, GoTrue, PostgREST,
Storage, Studio.

**What it takes**

| Step | Detail |
|---|---|
| Docker | Docker Desktop installed and running. ~2GB of images, a few GB of disk |
| `supabase start` | Already possible — `supabase/config.toml` exists and the CLI is installed (2.101.0) |
| Apply the schema | `supabase db reset` replays every migration into the local database |
| Env | A `.env.development.local`, or a documented swap, carrying the local URL and the local anon/service keys the CLI prints. These are fixed, well-known dev keys and are not secrets |
| Seed | A `supabase/seed.sql` with a test user plus a handful of properties, so a fresh reset is immediately usable. **New file, and the one piece of real work here** |
| Playwright | `TEST_EMAIL`/`TEST_PASSWORD` become the seeded user. `global-setup.ts` needs no change — it logs in through the app |
| Auth | The seeded user has to exist in `auth.users` with a known password. The CLI supports this in `seed.sql` |

**Good**
- Free, offline, and fast. A reset is seconds.
- Destroying it costs nothing, which is the whole point — you stop being careful
  in the way that makes you slow.
- RLS, triggers and the partial unique indexes all behave exactly as production,
  because it is the same Postgres and the same migrations.
- No credential in a dev shell can reach production.

**Bad**
- Docker has to be running. On a laptop that is a real daily cost.
- Nothing is shared: a house added locally is invisible to anyone else.
- Edge functions and cron need separate handling if they ever matter locally.
- RentCast still needs mock mode — unchanged, and now enforced on the write side
  too.

**Effort:** roughly half a day, nearly all of it writing `seed.sql` and proving
the Playwright suite passes against it.

---

## Option B — a separate Supabase dev project

A second hosted Supabase project, `chonopoly-dev`, that local work points at.

**What it takes**

| Step | Detail |
|---|---|
| Create the project | Owner action. A second free-tier project on the same account |
| Link and push | `supabase link --project-ref <dev>` then `supabase db push` to replay migrations |
| Env | `.env.local` points at the dev project. The production keys leave the dev machine entirely |
| Seed | Same `seed.sql` need as Option A, or a one-time manual setup through Studio |
| Keep in step | Every future migration has to be pushed to both. A step that is easy to forget |

**Good**
- No Docker. Works the same on any machine, including a phone-tethered laptop.
- Shared: a second person sees the same dev data.
- Closest to production's actual behaviour — same managed Postgres version, same
  connection pooler, same edge runtime.

**Bad**
- Two projects to keep migrated, and drift between them is silent until
  something breaks.
- Free tier pauses after a week of inactivity; waking it is slow and surprising.
- Still a hosted database reachable from anywhere with the key. It reduces the
  blast radius but does not remove it — a mistake still lands in a database
  someone else is using.
- Production credentials still exist on the machine if `.env.local` is only
  edited rather than replaced.

**Effort:** an hour or two, plus a standing cost on every migration forever.

---

## Recommendation

**Option A, local Supabase.** The failure being prevented is "a dev machine
writes to a database other people rely on", and only A removes the possibility
rather than narrowing it. The Docker requirement is the real cost and it is
worth paying; the free-tier pause in B would waste more time over a month than
Docker does.

A hybrid is worth noting and rejecting: keep production in `.env.local` and rely
on discipline. That is what was in place on 2026-10-18.

**Sequenced, if approved:**

1. Owner confirms Docker is acceptable on the machine.
2. Write `supabase/seed.sql`: one auth user, a buyer profile, three properties
   with pipeline entries, one primary financing analysis.
3. `supabase db reset`, then run the full Playwright suite against the local
   stack and fix whatever assumes production data.
4. Move the production keys out of `.env.local` into something that is not
   loaded by default, and document the deliberate steps to run against
   production when it is genuinely needed.
5. Only then: a README section, so the next person never has to ask.

Step 4 is the one that actually closes the hole. Steps 1–3 make it painless
enough that nobody undoes it.

## Out of scope

- Deciding where CI's database comes from. CI already stubs the API and runs no
  live calls; pointing it at a local stack is a separate question.
- Anonymising a production snapshot for dev. Worth considering later; it needs a
  scrubbing step for income and debts before it is safe to copy anything.
