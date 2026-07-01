# SMM Order Automator

Automates SocPanel orders from your social posts. X is fully automatic (poll →
detect new post → order). Instagram, TikTok, and LinkedIn are "paste the link,
everything after that is automatic" — see why in **Platform limits** below.

## What it does

- **Services page** — pull your live service catalog from SocPanel, map each
  service type (views/likes/retweets/comments/shares) to a real SocPanel
  service ID, per platform and per tier (Priority / Regular), with editable
  quantities.
- **X Accounts page** — add the X handles you want auto-polled. A cron job
  checks each one, and the moment a new post appears, it fires an order using
  that account's tier presets.
- **Comment Pools page** — upload a CSV of comments. Any order that includes
  a "comments" service pulls a fresh, never-reused comment from the pool you
  assign.
- **Overview page** — manual order form (for IG/TikTok/LinkedIn links) and a
  live feed of every order placed, with per-service success/error status.
- **Settings page** — SocPanel API key and X bearer token, stored server-side
  only.

## Platform limits (read this before you rely on it)

- **X (Twitter):** Fully automatic, using the official X API. Requires a
  **paid** X API developer tier (Basic or higher) — the free tier can't poll
  arbitrary accounts.
- **Instagram / TikTok:** Their official APIs only let you monitor content on
  accounts *you* own and have connected as a Business/Creator account — not
  arbitrary accounts. Since that's not your setup, this app treats them as
  manual: paste the link, the order fires automatically from there.
- **LinkedIn:** No practical API for monitoring new posts as an independent
  developer. Manual paste only.

If your situation changes for IG/TikTok (e.g. you connect a Business account
you own), the auto-detect logic used for X can be adapted for them — it's
isolated in `lib/x-api.ts` and `app/api/cron/poll-x/route.ts`.

## SocPanel API note

This uses the standard SMM-panel API format (single endpoint, `key` +
`action` params) in `lib/socpanel.ts`. **Before going live, check your own
SocPanel account's API page** (Account → API in your dashboard) and confirm
the field names match — most panels agree on this format, but if yours
differs, only `lib/socpanel.ts` needs editing.

## Setup

### 1. Supabase

1. Create a new Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy your Project URL and `service_role` key (Project Settings → API).

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=any-random-string-you-generate
```

### 3. Run locally

```
npm install
npm run dev
```

Open http://localhost:3000, go to **Settings**, and paste in your SocPanel
API key and X bearer token (these live in Supabase, not in `.env`).

### 4. Configure your tiers

Go to **Services**, click "Pull services from SocPanel", then for each
platform/tier, map each service type to the right SocPanel service ID and
set your quantities (e.g. X / Priority: Views 30000, Likes 25, Retweets 25,
Comments 20).

### 5. Add your X account(s)

Go to **X Accounts**, add your priority handle, assign it the `priority`
tier and a comment pool (upload one first on the Comments page if you want
custom comments included).

### 6. Deploy to Vercel

1. Push this project to a GitHub repo, import it in Vercel.
2. Add the same three env vars in Vercel's Environment Variables settings.
3. Vercel Cron (defined in `vercel.json`) hits `/api/cron/poll-x` every 5
   minutes. **Note:** frequent cron schedules require a Vercel Pro plan —
   the Hobby plan only allows once-daily cron jobs. Given your volume (3
   priority posts/day), you may want Pro for timely detection, or you can
   trigger polling manually/less frequently on Hobby.
4. Once deployed, add the `CRON_SECRET` you set as an env var named
   `CRON_SECRET`. Vercel Cron automatically sends it as the `Authorization:
   Bearer <secret>` header to protect the endpoint.

## Notes on your standing preferences

Follows your usual conventions: Next.js + Supabase + Vercel, `git add [file]`
over `git add .`, individual file edits over full ZIPs for small changes
going forward.
