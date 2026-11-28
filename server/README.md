# Level Up connector

Lets people use their Level Up account from AI chat apps such as Claude and ChatGPT. It's an [MCP](https://modelcontextprotocol.io) server with its own OAuth 2.1 sign-in. A user adds the connector URL in their chat app, signs in with their Level Up email code, and approves access. After that the chatbot can read their schedule and change their data in plain conversation:

> "What's left on my list today?" · "I trained, tick it off." · "Log a trade: NQ short, +£220, followed my plan." · "Change my training goal to 5 a week." · "How are my trading rules going this month?"

Every change is saved to the same synced document the app uses. The app picks it up within a minute while open, and straight away when reopened. Each change also appears in the app under **Settings → AI apps → Recent AI activity**, where the user can disconnect any chat app.

## Tools

| Read | Daily tracking | Edit the system |
|---|---|---|
| `get_today` | `complete_routine` | `add_/update_/archive_routine` |
| `get_system` | `check_rule` | `add_/update_/archive_rule` |
| `get_journal` | `log_goal_progress` | `add_/update_/archive_goal` |
| `get_insights` | `add_journal_entry` | `add_/update_/archive_area` |
| `get_weekly_review`, `get_spending`, `pre_trade_check` | `delete_journal_entry`, `update_journal_entry` | `update_settings` |
| `recall`, `list_goal_entries` | `remember`, `forget`, `delete_goal_entry` | `restore_item` |

Tools that change data need an exact name or id (near-misses get suggestions). Archive and delete tools are marked destructive, so chat apps ask the user before running them. Read-only connections (`levelup:read` scope) only see the read tools.

## How it's built

- `src/tools/`: pure functions `(state, input) -> new state + reply`. They use the app's own reducer from `app/src/core`, so a chatbot edit follows exactly the same rules as a tap in the app.
- `src/mcp.ts`: loads the user's document, runs the tool, and saves with optimistic concurrency. If the app saves at the same moment, it retries on the fresh copy so neither change is lost. Then it writes the activity entry.
- `src/oauth/`: the OAuth provider (dynamic registration, PKCE, hashed opaque tokens, refresh rotation) and the server-rendered sign-in and consent pages.
- `src/api.ts`: the app's endpoints for listing and revoking connected apps and reading activity, authenticated with the user's app session.
- `src/stores/`: Supabase-backed stores for production and in-memory ones for tests and local development.

## Run locally

```bash
cd server
npm install && npm --prefix ../app install
PUBLIC_URL=http://localhost:8787 USE_MEMORY_STORES=true npm run dev
# Sign-in code is always 123456 in memory mode.
npx @modelcontextprotocol/inspector   # then connect to http://localhost:8787/mcp
```

`npm test` runs 100 tests. The end-to-end suite performs the whole flow a chat app does: registration, sign-in, consent, PKCE token exchange, then real MCP tool calls. It also covers the attack cases.

## Deploy

Prerequisite: the app's Supabase project is set up (see `app/README.md`).

1. In the Supabase SQL Editor, run `app/supabase/migrations/002_connector.sql`.
2. Required: schedule `select public.levelup_cleanup();` daily (Database → Cron) to clear expired sign-ins and tokens, old activity, and unused app registrations.
3. On Render, sync the Blueprint. It now includes `levelup-connector`. Fill in:
   - `PUBLIC_URL`: the connector's own address, e.g. `https://levelup-connector.onrender.com`
   - `APP_ORIGINS`: the app's address, e.g. `https://level-up-updated-look.vercel.app`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`: a **secret** (Supabase → Project Settings → API). It goes only here, never in the app.
4. Set `VITE_CONNECTOR_URL` on the app (Vercel: Project > Settings > Environment Variables) to the same connector address and redeploy it. The Coach tab then shows users how to connect. The **AI apps** section then appears in Settings.

The connector uses Render's paid Starter instance (about $7 a month), because chat apps time out when calling a server that's asleep.

## Security

- Each sign-in is tied to the browser that opened it with a cookie, so a link forwarded to someone else can't be approved on their behalf.
- Sign-in codes are limited per email and per IP. Sending codes is limited per email and overall.
- Only **existing** Level Up accounts can connect (create one in the app first). Unknown emails get the same response as known ones.
- Tokens are opaque 256-bit values stored only as SHA-256 hashes. They're bound to this server's `/mcp` resource. Refresh tokens rotate on every use.
- Chat apps register as public clients using PKCE, so the server stores no client secrets.
- The service-role key lives only in the server's environment. The connector's tables have RLS on with no policies, so the app's public key can't touch them.
- `TRUST_PROXY` is the number of reverse proxies in front of the server (Render: `1`, the default). Set it correctly or the IP rate limits are weakened.

## Connect a chat app

Add `https://<your-connector>/mcp` as a custom connector:

- **Claude:** Settings → Connectors → Add custom connector.
- **ChatGPT:** Settings → Connectors (developer mode) → Create.
- Others: any MCP client that supports remote servers with OAuth.

Which plans allow custom connectors is up to each chat app and changes over time.

## Known limits

- Rate limits are kept in memory, so they apply per server instance. Run a single instance, or move limits to a shared store before scaling out.
- The production Supabase stores (`src/stores/supabase.ts`) aren't covered by automated tests here; the in-memory stores that share their interface are. Verify against a real project after deploying.
