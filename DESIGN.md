# NuraAI — design system

The source of truth `AGENTS.md` defers to. It describes what the interface
actually is today, not an aspiration. When code and this file disagree, one of
them is a bug — say which.

The implementation lives in three places:

```
frontend/src/styles/tokens.css   every colour, font, radius and shadow
frontend/src/styles/index.css    the Tailwind theme that names them
frontend/src/lib/constant.ts     the class strings every component composes from
```

There is no CSS component layer. Every rule that used to live in a stylesheet is
a Tailwind class string exported from `constant.ts`, so a component is styled by
importing a constant rather than by matching a selector.

---

## 1. Non-negotiables

These are the rules the design carries. Breaking one breaks the point of it.

1. **Red means broken.** `fail` is for failures only. Volume, traffic and
   activity stay teal however high the number gets. A busy week is never red.
2. **Mono for machine values.** Addresses, nonces, token counts, latency, model
   ids, file paths, handles, timestamps and byte counts are mono. Prose is
   Vazirmatn. This is the main thing that makes it read as an instrument rather
   than a website.
3. **Deny by default is visible.** A capability that is off renders off: grey
   track, grey knob, muted label. Never pre-check one in a form.
4. **Every list is paginated**, with a footer showing the range and the total
   (`1–12 OF 3,481`), not bare arrows.
5. **Failures get words.** Anywhere a model call can fail, render what failed and
   what to do next. Never a spinner that just stops.
6. **Real elements.** `<button>`, `<a href>`, `<input>` with `<label>`, `<dialog>`
   for modals. No clickable divs. `aria-label` on icon-only buttons.
7. **Touch targets are 44px on mobile.** Desktop chrome may go to 36px, list-row
   icon buttons to 28px.

---

## 2. Colour

Defined once in `tokens.css` as `--nura-*`, exposed to Tailwind under short
names. The Tailwind colour namespace is reset, so only these exist.

| Token | Tailwind | Value | Use |
|---|---|---|---|
| `--nura-bg` | `page` | `#0B0D0F` | the page ground |
| `--nura-panel` | `panel` | `#121518` | cards, header, panels |
| `--nura-panel-hover` | `panel-hover` | `#171C20` | selected or hovered row |
| `--nura-raised` | `raised` | `#1E2429` | buttons, chips, cards inside a panel |
| `--nura-well` | `well` | `#0E1114` | inputs and code blocks, recessed |
| `--nura-line` | `edge` | `#262D33` | panel border |
| `--nura-line-soft` | `edge-soft` | `#1F262B` | divider between panel sections |
| `--nura-line-row` | `edge-row` | `#161B1F` | divider between rows in a list |
| `--nura-line-strong` | `edge-strong` | `#323A41` | control border |
| `--nura-text` | `ink` | `#EBEEEF` | primary text |
| `--nura-text-2` | `ink-2` | `#AAB3B8` | secondary text |
| `--nura-text-3` | `ink-3` | `#7E888E` | captions and mono labels |
| `--nura-text-4` | `ink-4` | `#5C656B` | timestamps, disabled glyphs |
| `--nura-live` | `live` | `#3FCBB0` | live, granted, healthy, OK |
| `--nura-pending` | `pending` | `#D9A441` | pending, expiring, degraded |
| `--nura-fail` | `fail` | `#E4705C` | failures only |
| `--nura-off` | `off` | `#4A5257` | paused, unknown, switch knob off |

Each signal also has a wash and an edge (`live-wash`, `live-edge`, and the same
for `pending` and `fail`), plus `live-ink` for text on a live fill and
`fail-text` for text inside a failure block.

The heatmap ramp is `heat-0` through `heat-4`, least to most.

Do not write a hex value outside `tokens.css`. Do not introduce gradients except
in the sign-in scene, which is the one place they are allowed.

---

## 3. Type

| Role | Size | Weight | Class |
|---|---|---|---|
| Page title | 26px | 600 | `text-[26px] font-semibold tracking-tight` |
| Stat number | 26px | 500 | mono, `leading-none` |
| Panel title | 15px | 500 | `text-[15px] font-medium` |
| Card name | 15px | 600 | `CLASS_CARD_NAME` |
| Body | 14px | 400 | `text-sm` |
| Secondary | 13px | 400 | `text-[13px] text-ink-3` |
| Caption | 12px | 400 | `text-xs` |
| Chip, meta | 11px | 400 | mono |
| Mono label | 10px | 400 | `CLASS_MONO_LABEL`, uppercase, `.16em` tracking |

Two faces, both resolved from tokens:

- `--nura-font-ui` is Vazirmatn, self-hosted from `frontend/public/fonts` as a
  variable woff2 in three subsets. No external font requests. The `@font-face`
  rules in `index.css` are the only thing that loads it; there is no preload link.
- `--nura-font-mono` is the platform mono stack. Vazirmatn has no monospace cut,
  so machine values fall back to the system face rather than pulling a second
  family over the network.

Do not build hierarchy from size alone. Use spacing, weight and semantic
structure.

---

## 4. Radius and elevation

| Token | Tailwind | Value | Use |
|---|---|---|---|
| `--nura-r-panel` | `rounded-panel` | 12px | panels, cards, modals |
| `--nura-r-control` | `rounded-control` | 8px | buttons, inputs, rows |
| `--nura-r-chip` | `rounded-chip` | 6px | chips, badges, pagers |
| `--nura-r-pill` | `rounded-pill` | 999px | the header handle |

Never mix Tailwind's own `rounded-sm` through `rounded-2xl` with these. Two
shadows exist: `shadow-float` for the header, `shadow-lift` for modals and
dropdowns.

---

## 5. Spacing

Tailwind's 4px scale. Prefer `2`, `3`, `3.5`, `4` and `6`; the half-steps carry
the difference between a dense list and a padded panel.

- Panel body padding: `p-4`
- Panel header and footer: `px-4 py-3.5`
- Card padding: `p-4`, internal gap `gap-2.5`
- Form gap: `gap-3.5`, field gap `gap-2`
- Card grid gap: `gap-3`
- Page column gap: `gap-4`

Arbitrary spacing needs a reason. Negative margins are not a layout tool.

---

## 6. Component sizing

| Element | Height | Notes |
|---|---|---|
| Primary button | 44px | `min-h-11`, `px-4`, medium weight |
| Ghost button | 36px | `min-h-9`, `px-3`, normal weight |
| Icon button | 36px | `size-9`, square |
| Input, select, textarea | 44px | `min-h-11`, recessed on `well` |
| Menu item | 40px | `h-10` |
| Header row | 56px | brand, project switcher, sign out |
| Header nav row | 48px | the four destinations |
| Pager button | 44px mobile, 28px desktop | `size-11 lg:size-7` |
| Filter toggle | 44px mobile, 34px desktop | |
| LED | 6px | plus a 3px ring when live |
| Heatmap cell | 12px | 3px gap |

---

## 7. Components

Primitives live in `frontend/src/components/ui`. Everything else composes them.

| Component | Purpose |
|---|---|
| `Panel` | the surface everything sits on, with head, body and footer slots. `PageHead` is the screen heading beside it |
| `Button`, `ButtonLink` | the primary action. One solid button per screen |
| `Modal` | a native `<dialog>` opened with `showModal()`. The platform supplies focus trapping, inertness, Escape and the backdrop |
| `MonoLabel` | the 10px uppercase label every machine value and section eyebrow wears |
| `LED` | `live` teal, `degraded` brass, `off` grey. Deliberately no red state |
| `StatTile` | mono label, 26px number, optional meter and one line of context |
| `PaginationFooter` | range, total, previous, next |
| `Brand` | the 26px teal mark, drawn rather than imported |

Recurring patterns are class constants rather than components: `CLASS_CARD`,
`CLASS_ROW`, `CLASS_FIELD`, `CLASS_GHOST`, `CLASS_BADGE`, `CLASS_PROBE` and the
rest. Reach for one before writing a new class string.

---

## 8. Layout

One column, centred, capped at 1024px. The header is capped at the same width so
the two edges line up.

Breakpoints are Tailwind's defaults. Only three are used: `sm` at 640px for card
grids going two-up, `lg` at 1024px for desktop chrome sizing, `xl` at 1280px for
the activity trail gaining its side panel.

Mobile-first. Every change is checked at phone, tablet, desktop and wide.

The header is fixed, so the content column carries `pt-[7.5rem]` to clear it.

---

## 9. Screens

### Sign in
No header. The crystal scene fills the viewport and the sign-in card sits on an
opaque panel over it, centred, max 28rem. One button. Failures render as words
under it, never as a stalled spinner.

States still to build: wrong chain, signature rejected, nonce already spent, and
the challenge card showing the address, nonce, issue and expiry time with a brass
countdown. The nonce endpoint returns only the message today, so the card cannot
be drawn until the backend sends the fields it already holds.

### Projects
Card grid of every team this wallet owns, with a **Create project** button in the
page head opening a modal. Each card is a link: name, description, then team id
and creation date in mono.

### Overview
The project home, and the only place activity lives. Three bands:

1. **Machine.** Six stat tiles: CPU, memory, disk, active users, TCP connections
   and uptime, refreshed every ten seconds. CPU, memory and disk carry a meter
   that turns brass past 75% and rust past 90%.
2. **Activity, 12 weeks.** The heatmap, 12 columns by 7 rows, column is a week.
   Colour is volume on the teal ramp; a day carrying a failure gets a 1px rust
   inset outline. The original spec wanted failures on a separate strip under the
   grid — the outline is what exists.
3. **Trail.** The audit list with a permanent **All / Failures only** control in
   its header, and a detail panel beside it from `xl` up.

### Agents
Card grid, one card per agent: name, description, the model it is bound to as a
chip and its file count. **Create agent** opens a modal and is disabled until the
team has at least one model, because an agent must be bound to one.

### Models
Card grid of endpoints: label, model slug, base URL, key hint and context window.
The window is read from the provider, so a model that has never been probed reads
`window unknown` rather than guessing a number. Each card carries Test, Modify
and Remove; Remove arms first and confirms second. Create and Modify both open
modals.

### Bots
Bot list, then conversations, then the people directory. A conversation is
something a bot has, so all three live together. Still on rows rather than cards.

### Agent detail
File list, markdown editor and capabilities. A file large enough to be fetched on
demand says so under its name — that is the only signal about what is in the
prompt versus what is fetched, so keep it.

---

## 10. Open decisions

- **shadcn/ui.** `AGENTS.md` requires it. It is not installed, and neither are
  Radix or `class-variance-authority`. The primitives above are hand-written, and
  the token names here are not shadcn's `background` / `foreground` / `border`
  set. Either the migration happens or `AGENTS.md` sections 2 and 8 need
  rewriting against this file.
- **Failure strip.** The heatmap outlines failing days instead of drawing them on
  their own row.
- **Bots on cards.** The bots screen is the last one still on rows.
