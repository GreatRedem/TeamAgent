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
backend/src/constant.ts      every module-level value the backend needs, and the logger
backend/src/plugins/         auth, rate limit, typeorm, telegram polling
backend/src/tests/           self-checks, one standalone script each
frontend/src/apis/           one module per backend area, re-exported from index
frontend/src/ui/             shadcn primitives plus this project's own
frontend/src/components/     layout, project panels, agent
frontend/src/pages/          one file per route
frontend/src/libs/constant.ts every constant the frontend reads
frontend/src/styles/         index.css: tokens and the Tailwind theme over them
```

Routes are autoloaded from `*.route.ts` and entities from `*.entity.ts`, so a
new area needs no registration.

## Commands

```
npm run dev              api and web together
npm run typecheck        frontend only
npm run build            backend tsc, then the web bundle
npm run lint             Biome lint, recommended rules, both workspaces
npm run format:check     Biome format and import order, no writes
```

Backend types are checked by `npm run build:api`, not by `npm run typecheck`.

Backend self-checks are standalone scripts in `backend/src/tests`, one file each:

```
npx tsx --tsconfig backend/tsconfig.json backend/src/tests/<name>.test.ts
```

## Tooling notes

- On Windows, call `npx.cmd` rather than `npx` from a bash shell; bare `npx`
  fails on the space in `C:\Program Files`.
- Biome is the formatter and the linter; `biome.json` holds both. Run
  `npm run format` before committing. It also sorts imports, so expect those to
  move. It does not sort Tailwind classes.
- Biome keeps `/>` of a multi-line self-closing tag on its own line. Its
  `bracketSameLine` moves only the `>` of an element with children, and there
  is no option for `/>`.
- `useLiteralKeys` is off: both tsconfigs set
  `noPropertyAccessFromIndexSignature`, which requires the `x['key']` form that
  rule would rewrite.
- The vendored skills under `.claude/skills` are excluded from the formatter, so
  they stay byte-identical to the copies upstream.

## Working rules

- **Stay in scope.** A UI task is presentation only. Do not change routes, data
  fetching, props, state shape or API calls unless the task says so.
- **Reuse before writing.** A primitive for the concept probably already exists
  in `src/ui`. Check before adding a second one.
- **Constants live in `libs/constant.ts`.** Do not declare module-level values in
  a component file. Primitives in `src/ui` keep their own variant maps,
  which is their contract and the one exception.
- **Show diffs** for anything touching more than two files, before moving on.
- **Do not add a dependency without asking.** React, react-router, Tailwind,
  shadcn-style primitives on native HTML, `cn` (`@/libs/cn`), `motion` and
  lucide are already here. Radix, `class-variance-authority` and `tw-animate-css`
  were removed on purpose; do not bring them back.
- **No raw HTML outside `src/ui`.** Pages and features compose components from
  `@/ui` (`Text`, `Stack`, `Button`, `Pressable`, …). A missing primitive is
  added to `src/ui`. No raw HTML, SVG, `createElement` or `dangerouslySetInnerHTML`
  anywhere else. `AGENTS.md` section 2 has the rule.
- **Line height is one of four roles** (`leading-display`, `-heading`, `-control`,
  `-body`), defined in `styles/index.css`. Use no other.
  `AGENTS.md` Typography has the table.
- **`cn` joins, it does not merge.** A `className` that fights a primitive's own
  class (`gap-0` on a Card) loses to it. Add a prop or variant to the primitive
  instead.
- **Placeholder data is placeholder.** Wire real data; do not ship the sample
  names, handles or addresses.
- **No comments.** Write none unless a tool needs one to work (`biome-ignore`,
  `@ts-` directives). Names and structure carry the meaning.
- **No ARIA.** No `aria-*` attributes and no `role` attributes, anywhere, until
  the owner asks for them back.
- **Primitives in `src/ui` take no `className`.** Each has its own defaults;
  what varies is a prop or a variant on the primitive.
- **Backend module scope.** Outside `backend/src/main.ts` and
  `backend/src/constant.ts`, no file declares a variable at module level. A value
  that has to live there goes in `constant.ts`.

## Before you say you're done

```
npm run format
npm run typecheck
npm run lint
npm run build
```

All four pass, or say plainly what is still failing.
