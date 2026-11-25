# Level Up app

Follow your system across work, fitness, trading and finance: daily routines, playbook rules, goals with progress bars, and a journal for trades, workouts and money.

- `src/core/` is plain TypeScript with no browser APIs (types, progress, streaks, stats, reducer, storage, sync). The future Expo app reuses it as is.
- `src/web/` is the React PWA.
- Data is stored on the device. Signing in is optional and syncs one document per account through Supabase.

## Develop

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # unit + integration tests
npm run coverage
```

## Turn on accounts and sync (one-time, ~5 minutes)

1. Create a free project at supabase.com.
2. **SQL Editor > New query**: paste `supabase/migrations/001_user_state.sql` and run it. It creates the table and the row-level security that limits each account to its own data.
3. **Authentication > Emails > Templates**: edit **both** the **Magic Link** and the **Confirm signup** templates so the body includes `{{ .Token }}`, since the app signs in with a 6-digit code (brand-new accounts get *Confirm signup*, returning ones get *Magic Link*). For example: `Your Level Up code is {{ .Token }}`.
4. **Authentication > URL Configuration**: set the Site URL to your app's address (e.g. `https://levelup-app.onrender.com`).
5. **Project Settings > API**: copy the Project URL and the `anon` public key. Put them in `app/.env.local` (see `.env.example`) for local dev, and in the Render service's environment variables.

The anon key is designed to be public. Security comes from the row-level security policies, not from hiding the key.

## Before real users rely on it

- **Backups:** Supabase's free tier has no point-in-time restore, and free projects pause after a week without traffic (that also stops the AI connector). For anything you can't lose, use a paid Supabase plan or schedule regular exports. In the app, people without sync see a reminder to export after a week.
- **Monitoring:** add an uptime check on `https://<connector>/healthz` (any free uptime monitor works). Consider error tracking (e.g. Sentry) on the connector.
- **Housekeeping (required):** schedule `select public.levelup_cleanup();` daily in Supabase (Database > Cron). It clears expired sign-ins and tokens, old activity, and AI app registrations that never connected.
- **Test after deploying:** sign in with a brand-new and an existing email; confirm two accounts can't see each other's data; sync two devices with edits and deletions; install the PWA on an iPhone and check it still has your data after a week.

## Deploy on Render

`render.yaml` defines `levelup-app` alongside the landing page. In Render use **New > Blueprint** on this repo (or sync the existing Blueprint), then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when prompted. Each deploy runs the tests before building.

Without those two variables the app still works fully, with sync hidden.
