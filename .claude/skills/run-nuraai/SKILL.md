---
name: run-nuraai
description: Build, run and drive NuraAI (Fastify API + React web app). Use when asked to start or run NuraAI, build it, test it, take a screenshot of its UI, preview a page, click through a screen, or check that a UI change renders.
---

NuraAI is one npm workspace: the API (`backend`, Fastify, :1000) and the web app (`frontend`, React + Vite, :1001). An agent drives the UI by serving the **built** frontend on :1011 and loading it in the Playwright MCP browser with the API mocked by `.claude/skills/run-nuraai/mock-api.js`. The backend is covered by `curl` against the already-running API and by the standalone self-check scripts. Paths are relative to the repo root. Verified on Windows with Git Bash.

## Prerequisites

- Node 24 (verified on v24.12.0) and dependencies installed at the repo root (`npm install`, workspaces; not re-run for this skill).
- `.env` at the repo root with `NODE_PORT`, `NODE_DB`, `NODE_DB_CA`, `NODE_ENV`, `NODE_COOKIE`, `SESSION_ACCESS_SECRET`, `SESSION_REFRESH_SECRET`. The self-checks read it too. `NODE_DB` is a remote Postgres.
- The Playwright MCP server (`playwright` in `.mcp.json`) approved and connected; check with `/mcp`.

## Build

```bash
npm run build:web
```

`npm run build` does the backend `tsc` and then the web bundle.

## Run (agent path)

1. Serve the build on :1011. Start it with your shell tool's background mode, then wait for it:

```bash
cd frontend && npx.cmd vite preview --port 1011 --strictPort
```

```bash
timeout 60 bash -c 'until curl -sf http://127.0.0.1:1011/ >/dev/null; do sleep 1; done'
```

2. Drive it with the Playwright MCP tools, in this order:

| tool | input | does |
|---|---|---|
| `browser_run_code_unsafe` | `filename: ".claude/skills/run-nuraai/mock-api.js"` | fake session + mocked `/api/**` on the browser context |
| `browser_navigate` | `http://127.0.0.1:1011/dashboard/team/1/plugins` | opens a page |
| `browser_wait_for` | `text: "News channel"` | the fetched data has rendered |
| `browser_click` | `target: 'button:has-text("Activity") >> nth=0'` | one real interaction |
| `browser_wait_for` | `text: "By action"` | the dialog has its data |
| `browser_take_screenshot` | `filename: ".playwright-mcp/<name>.png"` | then Read the PNG and look at it |
| `browser_console_messages` | `level: "error"` | nothing threw |

Routes: `/dashboard`, `/dashboard/team/:id/:tab` (`overview`, `agents`, `bots`, `models`, `tasks`, `team`, `tools`, `plugins`, `settings`), `/dashboard/team/:id/agent/:agentId`, `/dashboard/team/:id/profile/:profileId`.

`mock-api.js` answers team 1, its agents, and the plugin list, catalog and calls for plugin 1. Anything else gets a 501 whose `result` is `MOCK_MISSING <METHOD> <path>`, and the page prints it in its error alert. To cover another screen, add an entry to `fixtures` keyed `'<METHOD> <path>'`, shaped like the types in `frontend/src/apis/*.ts`, re-run the file, reload.

3. Smoke the running API (read-only):

```bash
curl -s -o /dev/null -w "GET /team/1/plugin -> %{http_code}\n" http://127.0.0.1:1000/team/1/plugin
curl -s -w " <- POST /plugin/999999/hook\n" -X POST -H 'content-type: application/json' --data '{}' http://127.0.0.1:1000/plugin/999999/hook
```

Expect `401` and `{"result":"PLUGIN_NOT_FOUND"}`.

4. Stop the preview server and confirm the user's ports are untouched:

```bash
for p in $(netstat -ano | awk '/127.0.0.1:1011 .*LISTENING/{print $5}' | sort -u); do taskkill //PID $p //T //F; done
netstat -ano | grep LISTENING | grep -E ":10(00|01|11) "
```

Only :1000 and :1001 should remain. Then `browser_close`, and delete your PNGs and the `page-*.yml` / `console-*.log` files from `.playwright-mcp/`.

## Direct invocation (backend internals)

Each file in `backend/src/tests` is a standalone self-check with a fake database; none connects to Postgres.

```bash
npx.cmd tsx --tsconfig backend/tsconfig.json backend/src/tests/plugin.test.ts
```

## Run (human path)

`npm run dev` starts the API (`tsx watch`, :1000) and Vite (:1001) together; it is what the user's own session runs, so it was not re-run here. Real data needs a wallet sign-in in the user's own browser. An agent must not forge a session token from `SESSION_ACCESS_SECRET` or create wallet accounts against the remote database.

## Test

```bash
npm run format
npm run typecheck
npm run lint
npm run build
```

`typecheck` covers the frontend only; backend types are checked by `npm run build`.

## Gotchas

- **Never start a second backend while :1000 is listening.** It polls the same Telegram bots (they fight with 409 Conflict), runs scheduled tasks twice, and in development TypeORM `synchronize` rewrites the schema of the remote database in `.env`.
- **Don't start a second Vite dev server.** `cacheDir` is `node_modules/.vite`, shared with the user's :1001. `vite preview` of the build is safe.
- **`browser_navigate` returns before the page's data arrives.** Panels fetch after mount, so clicking straight away fails. Always `browser_wait_for` a piece of fetched text first.
- **The session token lives in sessionStorage** (`accessToken`), not localStorage. Setting it in localStorage lands on the sign-in card.
- **The user's Chrome is no shortcut.** `claude-in-chrome` tabs at `localhost:1001` / `127.0.0.1:1001` show the sign-in card: the session is per tab and signing needs the user's wallet.
- **`browser_run_code_unsafe` has no `URL` global** (`ReferenceError: URL is not defined`); `mock-api.js` parses paths with string slicing. Its `filename` must hold a bare `async (page) => {…}` expression.
- **Playwright MCP writes only inside the repo** (`.playwright-mcp/` is gitignored). Paths elsewhere fail with `outside allowed roots`.
- **`npx` from Git Bash fails** on the space in `C:\Program Files`: use `npx.cmd`. For a package npx has to download, even `npx.cmd -y` fails with `'C:\Program' is not recognized`; run that one from PowerShell.

## Troubleshooting

- **Page shows `MOCK_MISSING GET /team/1/task`**: that endpoint has no fixture. Add one to `mock-api.js`.
- **`browser_click` says `does not match any elements`** on a button you can see in a screenshot: the click ran before the list rendered. Add `browser_wait_for` with text from the list.
- **Navigating lands on the sign-in card**: the mock isn't installed on this browser context (it is new after `browser_close`). Run `mock-api.js` first, then navigate.
