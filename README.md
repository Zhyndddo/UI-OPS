# Task Tracking v2 — starter

A minimal Next.js app with exactly one job: prove the Vercel → Supabase
pipeline actually works end to end, before building any real features on
top of it. It shows two checkmarks and a live query result — nothing else.

## Push this to GitHub

1. Unzip this folder somewhere on your machine.
2. Push it to the (currently empty) GitHub repo you created for Vercel to
   import — either with GitHub Desktop ("Add Local Repository" → point at
   this folder → "Publish"), or from the terminal inside this folder:
   ```
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

## Add the environment variables in Vercel

Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase Project URL (`https://<project-id>.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the anon/publishable key from Supabase → Settings → API Keys

Then Deployments → "..." on the latest one → Redeploy, so it picks the vars up.

## What success looks like

Open the deployed URL. If both rows show ✅ and you see a table with
`category = project_type`, `value = Chi Phát Hành` (the seed row from
`schema.sql`), the entire pipeline — Vercel build, environment variables,
Supabase connection, live database query, render — is confirmed working.

If either shows ❌, the detail text next to it says exactly what's wrong.

## Local development (optional)

```
npm install
cp .env.local.example .env.local   # then fill in your real values
npm run dev                         # http://localhost:3000
```
