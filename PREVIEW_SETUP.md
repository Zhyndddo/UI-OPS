# Setting up a preview/staging environment

Goal: a separate URL where you (and whoever you've let in) can test changes
before they touch the live product at `ui-ops.vercel.app`, without risking
real production data. Since the app is already on Vercel + GitHub
(`Zhynddddo/UI-OPS`), you're mostly configuring things that already exist
rather than building new infrastructure.

There are two parts: **a separate database** (so testing can't corrupt real
data) and **a separate deployment** (Vercel does this automatically once the
database part is set up). Do them in this order.

---

## Part 1 — a staging Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project. Free tier is
   fine for this.
2. Name it something like `vieent-ops-staging` so it's obviously not
   production in the Supabase dashboard.
3. Once it's created, open its SQL Editor and run `schema.sql` from this zip
   (the full current schema) to build all the tables fresh. Then run, **in
   order**, every `add-*.sql` migration file from every round you've applied
   to production so far — staging needs to end up structurally identical to
   production. If you're not sure which migrations you've already run on
   prod, that's fine — running an already-applied migration against a fresh
   staging DB is harmless since it starts empty either way.
4. Staging will start **empty** — no releases, no tickets, no team members.
   Two options:
   - Add a few rows by hand through the app once it's pointed at staging
     (Part 2), just enough to click around and test with.
   - Export real data from production and import it, if you want a more
     realistic testing ground. Supabase's dashboard has a Table Editor
     export/CSV option per table for this, or `pg_dump`/`pg_restore` if you
     want everything at once — happy to write that script if you want it.
5. From the staging project's Settings → API page, copy three values —
   you'll need them in Part 2:
   - Project URL
   - `anon` / `public` key
   - `service_role` key (keep this one private — it bypasses all row-level
     security)

---

## Part 2 — point Vercel's Preview environment at staging

Vercel already deploys **every branch push and every pull request** to its
own throwaway URL, separate from production — that part needs no setup.
What needs setup is making sure those preview deployments use the staging
database instead of quietly reading/writing production data.

1. In the Vercel dashboard, open the project → **Settings → Environment
   Variables**.
2. You'll see your current variables (probably scoped to "Production" or
   "All Environments"). For each of these, add a **second** entry scoped to
   **Preview only**, using the staging project's values from Part 1:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` — set this to whatever preview URL pattern you
     land on (Vercel auto-generates one per deploy, e.g.
     `ui-ops-git-<branch>-<team>.vercel.app`; you can leave this one as a
     placeholder, it mainly affects links inside emails/notifications)
   - `YOUTUBE_API_KEY` if you've set that up — can point at the same key as
     production, or a separate one if you're worried about quota
   - `SMTP_*` / `DIGEST_FROM_EMAIL` / `CRON_SECRET` — up to you; usually
     safest to leave these **unset** for Preview so test runs don't
     accidentally email real people. The app is written to skip sending and
     just compute silently when SMTP isn't configured.
3. Double-check the **Production**-scoped versions of these still point at
   your real Supabase project — adding Preview-scoped values doesn't touch
   Production's.
4. Save. New preview deployments created after this point will pick up the
   Preview-scoped values automatically; nothing needs redeploying by hand.

---

## Part 3 — the day-to-day workflow

1. Instead of committing straight to `main`, create a branch for whatever
   you're testing:
   ```
   git checkout -b staging-round58
   ```
   (any branch name works — Vercel previews every branch, not just ones
   named "staging" or "preview.")
2. Push it:
   ```
   git push origin staging-round58
   ```
3. Vercel picks up the push automatically and builds a preview deployment.
   You'll find the URL in two places:
   - The Vercel dashboard → **Deployments** tab, next to the commit.
   - If you open a Pull Request for the branch on GitHub, Vercel's bot
     comments the preview URL directly on the PR.
4. Open that URL, log in (it's a fully separate app instance, so you'll need
   an account — either the same login if your staging Supabase project has
   auth users seeded, or create a throwaway one), and test.
5. Once it looks right, merge the branch into `main` (via PR or directly).
   That merge triggers Vercel's **Production** deployment, which uses the
   Production-scoped env vars — the real database, the real live URL.

Every future round of changes I hand you as a zip can go through this same
branch → preview URL → test → merge flow before it ever touches
`ui-ops.vercel.app`.

---

## What this doesn't cover

- **Storage/file buckets** (if any Supabase Storage buckets are in use) —
  those aren't included in `schema.sql` and would need to be recreated
  separately in the staging project if the app depends on uploaded files.
- **Auth users** — staging's Supabase Auth starts empty. You'll need to
  invite/create at least one login (Config → Team, or
  `scripts/bulk-create-team.js`) before anyone can sign into the staging
  app at all.
- **Automated schema sync** — right now, keeping staging's schema in sync
  with production is manual (re-running migration files). If this becomes
  frequent enough to be annoying, a small script that diffs/copies schema
  between the two Supabase projects would be worth building.
