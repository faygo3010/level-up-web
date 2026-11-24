# Level Up

Monorepo: `index.html` (landing page), `app/` (React PWA, with `app/src/core` shared and platform-free), `server/` (MCP connector for AI chat apps). Deploy config: `render.yaml`.

## Owner's toolkit (use on every app or feature request)

Load the `levelup-toolkit` skill. It covers the Astryx design system (`astryx` skill), the 53 Agency specialist agents in `.claude/agents/` (used to check and test everything), and the awesome-ai-apps pattern catalogue. Run `scripts/fetch-toolkit.sh` to pull the full sources.

## Commands

- App: `cd app && npm test && npm run build`
- Connector: `cd server && npm test && npm run build` (also needs `npm --prefix ../app ci`)
