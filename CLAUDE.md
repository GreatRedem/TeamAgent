# CLAUDE.md

NuraAI — agent platform. Wallet sign-in, Telegram bots, agents defined by
markdown files, OpenAI-compatible model endpoints, a `team.json` roster, and a
full record of every model round-trip.

## Where the rules live

- `AGENTS.md` — how to work on the UI. Read it before changing any interface.
- `DESIGN.md` — the design system itself: tokens, type, sizing, components.
  `AGENTS.md` defers to it, so it is the file to check a value against.
- `.claude/skills/` — design skills vendored into the repo, with a README
  saying where each came from and how to refresh it.

Do not restate UI rules here. One rulebook, one design system.

## Layout

```
backend/src/routes/<area>/   entity, schema, service, route per area
backend/src/plugins/         auth, rate limit, typeorm, telegram polling
frontend/src/api/            one module per backend area, re-exported from index
frontend/src/components/ui/  shadcn primitives plus this project's own
frontend/src/components/     layout, project panels, agent, scene
frontend/src/pages/          one file per route
frontend/src/lib/constant.ts every constant the frontend reads
frontend/src/styles/         tokens.css and the Tailwind theme over it
```

Routes are autoloaded from `*.route.ts` and entities from `*.entity.ts`, so a
new area needs no registration.

## Commands

```
npm run dev              api and web together
npm run typecheck        frontend only
npm run build            backend tsc, then the web bundle
npm run lint             oxlint across both workspaces
npm run format:check     oxfmt
```

Backend types are checked by `npm run build:api`, not by `npm run typecheck`.

Backend self-checks are standalone scripts, one per area:

```
npx tsx backend/src/routes/<area>/<name>.test.ts
```

## Tooling notes

- On Windows, call `npx.cmd` rather than `npx` from a bash shell; bare `npx`
  fails on the space in `C:\Program Files`.
- oxfmt is the house style. Run `npm run format` before committing. It also
  sorts imports and Tailwind classes, so expect those to move.
- The vendored skills under `.claude/skills` are excluded from the formatter, so
  they stay byte-identical to the copies upstream.
- `@shadcn/lint` is registered in `.oxlintrc.json` under `jsPlugins`. Two rules
  are on and clean; four more are available and off. `DESIGN.md` explains which
  and why.

## Working rules

- **Stay in scope.** A UI task is presentation only. Do not change routes, data
  fetching, props, state shape or API calls unless the task says so.
- **Reuse before writing.** A primitive for the concept probably already exists
  in `components/ui`. Check before adding a second one.
- **Constants live in `lib/constant.ts`.** Do not declare module-level values in
  a component file. shadcn primitives keep their own `cva` variants, which is
  their contract and the one exception.
- **Show diffs** for anything touching more than two files, before moving on.
- **Do not add a dependency without asking.** React, react-router, Tailwind,
  shadcn/ui with Radix, `class-variance-authority`, `cn`, `tw-animate-css` and
  lucide are already here.
- **Placeholder data is placeholder.** Wire real data; do not ship the sample
  names, handles or addresses.

## Before you say you're done

```
npm run format
npm run typecheck
npm run lint
npm run build
```

All four pass, or say plainly what is still failing.
