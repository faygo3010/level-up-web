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
3. **Authentication > Emails > Templates > Magic Link**: make sure the body includes `{{ .Token }}`, since the app signs in with a 6-digit code. For example: `Your Level Up code is {{ .Token }}`.
4. **Authentication > URL Configuration**: set the Site URL to your app's address (e.g. `https://levelup-app.onrender.com`).
5. **Project Settings > API**: copy the Project URL and the `anon` public key. Put them in `app/.env.local` (see `.env.example`) for local dev, and in the Render service's environment variables.

The anon key is designed to be public. Security comes from the row-level security policies, not from hiding the key.

## Deploy on Render

`render.yaml` defines `levelup-app` alongside the landing page. In Render use **New > Blueprint** on this repo (or sync the existing Blueprint), then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when prompted. Each deploy runs the tests before building.

Without those two variables the app still works fully, with sync hidden.
