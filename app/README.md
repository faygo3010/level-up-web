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

## Turn on accounts and sync

Sign-in options: **Apple**, **Google**, **email and password**, or a **6-digit email code**. Whatever someone signs in with, their data syncs and loads on every device they sign in on.

### 1. Supabase project

1. Create a project at supabase.com, or add Supabase from Vercel's Storage tab.
2. **SQL Editor**: run `supabase/migrations/001_user_state.sql`. It creates the table, plus row-level security so each account can only ever read and write its own data. (Run `002_connector.sql` too when you set up the AI coach.)
3. **Authentication > URL Configuration**:
   - **Site URL:** your app address, e.g. `https://level-up-updated-look.vercel.app`
   - **Redirect URLs:** add the same address. Google and Apple sign-in, and password reset links, return there.
4. **Authentication > Emails > Templates**: put `{{ .Token }}` in **Magic Link** and **Confirm signup** so the email-code option works (e.g. `Your Level Up code is {{ .Token }}`).
5. **Project Settings > API**: copy the Project URL and the `anon` public key.

### 2. Sign-in providers (Supabase > Authentication > Sign In / Providers)

- **Email:** on by default. Keep "Confirm email" on so new password accounts verify their address.
- **Google:** in Google Cloud Console, create an OAuth client (type: Web application). Add Supabase's callback URL (shown on the Google provider page) as an authorised redirect URI. Paste the client ID and secret into Supabase. Free.
- **Apple:** needs an **Apple Developer Program** membership ($99/year). Create a Services ID and a key for "Sign in with Apple", add Supabase's callback URL, then paste the details into Supabase's Apple provider. Until this is done, the Apple button shows a friendly error and the other options keep working.

### 3. Vercel environment variables (Project > Settings > Environment Variables), then redeploy

- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon public key (safe to ship; security comes from the row-level security rules)
- `VITE_CONNECTOR_URL` = your connector address (AI coach; see below)

Never put the `service_role` key in a `VITE_` variable.

## AI coach (users bring their own Claude or ChatGPT)

The Coach tab shows users how to add Level Up to **their own** Claude or ChatGPT, so their subscription pays for the AI. The connector (`server/`) signs them in to their Level Up account and only ever touches that account. To turn it on, deploy `server/` (see `server/README.md`: Render Starter, about $7/month, because it must stay awake), set `APP_ORIGINS` there to your Vercel address, then set `VITE_CONNECTOR_URL` on Vercel and redeploy.

## Before real users rely on it

- **Backups:** Supabase's free tier has no point-in-time restore, and free projects pause after a week without traffic (that also stops the AI connector). For anything you can't lose, use a paid Supabase plan or schedule regular exports. In the app, people without sync see a reminder to export after a week.
- **Monitoring:** add an uptime check on `https://<connector>/healthz` (any free uptime monitor works). Consider error tracking (e.g. Sentry) on the connector.
- **Housekeeping (required):** schedule `select public.levelup_cleanup();` daily in Supabase (Database > Cron). It clears expired sign-ins and tokens, old activity, and AI app registrations that never connected.
- **Test after deploying:** sign in with a brand-new and an existing email; confirm two accounts can't see each other's data; sync two devices with edits and deletions; install the PWA on an iPhone and check it still has your data after a week.

## Deploy on Render

`render.yaml` defines `levelup-app` alongside the landing page. In Render use **New > Blueprint** on this repo (or sync the existing Blueprint), then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when prompted. Each deploy runs the tests before building.

Without those two variables the app still works fully, with sync hidden.
