# NuraAI — design system

The source of truth `AGENTS.md` defers to. It describes what the interface
actually is, not an aspiration. When code and this file disagree, one of them is
a bug — say which.

Nura is an operator's console. The person using it owns the wallet, runs the
bots and needs two answers fast: is it working, and if not, what broke. The
interface is built around reading instruments, so the data is the loudest thing
on every screen and the chrome around it stays quiet.

## Where it lives

```
frontend/src/styles/index.css     every colour, radius, font and elevation, and the Tailwind theme that names them
frontend/src/ui/                  shadcn primitives plus this project's own
frontend/src/libs/constant.ts     every constant the app reads
```

There is no CSS component layer and no second naming system. Styling is either a
shadcn component, a Tailwind utility resolved from a token, or a constant.

---

## 1. Non-negotiables

1. **Red means broken.** `destructive` is for failures only. Volume, traffic and
   activity stay `primary` teal however high the number gets. A busy week is
   never red, and a capability that is off is grey, not red.
2. **Mono for machine values only.** Ids, addresses, token counts, latency,
   model slugs, file paths, handles and byte counts are mono. Labels, prose and
   sentences are not, even short ones.
3. **Deny by default is visible.** A capability that is off renders as an unset
   switch. Never pre-check one.
4. **Every list is paginated**, with a footer showing the range and the total.
5. **Failures get words.** Every failure says what broke in plain language and,
   where there is one, what to do next. Never a spinner that stops.
6. **Real elements.** shadcn primitives over hand-rolled ones, `<button>` over a
   clickable div, `<output>` over `role="status"`, a label for every control.
7. **Touch targets are 36px minimum**, 44px for the primary action on a phone.

---

## 2. Colour

One semantic set, shadcn's vocabulary, defined once in `styles/index.css`. The
Tailwind colour namespace is reset, so only these exist and a hex value outside
`styles/index.css` cannot be written by accident.

| Token              | Value     | Use                              |
| ------------------ | --------- | -------------------------------- |
| `background`       | `#0b0d0f` | the page                         |
| `foreground`       | `#e8ecee` | primary text                     |
| `card`             | `#121518` | every panel and card             |
| `popover`          | `#161b1f` | menus and dialogs                |
| `muted`            | `#161b1f` | quiet fills, skeletons           |
| `muted-foreground` | `#8b959b` | secondary text and labels        |
| `secondary`        | `#1b2126` | secondary buttons and chips      |
| `accent`           | `#1e252a` | hover and selected rows          |
| `border`           | `#242b31` | every hairline                   |
| `input`            | `#2f373e` | control borders                  |
| `ring`             | `#3fcbb0` | focus                            |
| `well`             | `#0e1114` | recessed code and message blocks |

Signals carry one meaning each and always pair with a foreground:

| Token         | Value     | Means                                              |
| ------------- | --------- | -------------------------------------------------- |
| `primary`     | `#3fcbb0` | live, granted, healthy, OK, and the primary action |
| `warning`     | `#d9a441` | pending, expiring, degraded, stood down            |
| `destructive` | `#e4705c` | a failure, and nothing else                        |
| `neutral`     | `#4a5257` | paused, unknown, off                               |

`scale-0` through `scale-4` is the heatmap ramp. `chart-1` through `chart-5` is
reserved for future charts.

No gradients anywhere except the sign-in scene, which is the one place the
interface is allowed to be decorative.

---

## 3. Type

Two faces. Vazirmatn carries everything the person reads; the platform mono
carries everything the machine produced.

- `--font-ui` is Vazirmatn, self-hosted from `frontend/public/fonts` as a
  variable woff2 in three subsets. No external font requests, no preload link:
  the `@font-face` rules are what load it.
- `--font-data` is the platform mono stack. Vazirmatn has no monospace cut, so
  machine values fall back to the system face rather than pulling a second
  family over the network.

The scale is Tailwind's, plus three named steps. Nothing outside it.

| Role                        | Class                        | Size |
| --------------------------- | ---------------------------- | ---- |
| Page title                  | `text-page font-semibold`    | 26px |
| Stat number                 | `text-stat font-medium` mono | 34px |
| Section and card title      | `text-base font-semibold`    | 16px |
| Body                        | `text-sm`                    | 14px |
| Caption                     | `text-xs`                    | 12px |
| Meta, chips, machine values | `text-2xs`                   | 11px |

**Line height is 1.5 everywhere.** It is set once, on `*` in
`styles/index.css`. The scale steps are font sizes only (`--text-*: initial`
clears Tailwind's own, each with its line height), so no size utility changes it,
and no component overrides it. There are no `leading-*` utilities in
this codebase; if one appears, it is a bug.

Hierarchy comes from weight, spacing and position. Never from size alone, and
never from an uppercase tracked-out label above a heading. Prose is capped near
60 characters per line.

---

## 4. Radius, elevation, spacing

`--radius` is 8px and everything derives from it: `rounded-xl` (12px) for cards
and dialogs, `rounded-lg` (8px) for tiles and wells, `rounded-md` (6px) for
controls and chips, `rounded-sm` (4px) for heatmap cells. Four steps, each a
different level of the hierarchy. Tailwind's own `rounded-2xl` and friends are
not used.

Three shadows: `shadow-raised` for a card, `shadow-float` for the header,
`shadow-lift` for a dialog. Nothing else casts one.

Spacing is Tailwind's 4px scale. Arbitrary values need a reason.

| Where            | Value                            |
| ---------------- | -------------------------------- |
| Page gutter      | `px-4` phone, `px-6` from `sm`   |
| Between sections | `gap-6`                          |
| Card padding     | `p-5`, internal `gap-5`          |
| Form             | `gap-5`, field internals `gap-2` |
| Card grids       | `gap-3`                          |

---

## 5. Component sizing

shadcn owns these. Read them from the component, do not restate them on the
instance.

| Element                 | Height |
| ----------------------- | ------ |
| Button default          | 36px   |
| Button `sm`             | 32px   |
| Button `lg`             | 40px   |
| Input, select, textarea | 36px   |
| Header bar              | 56px   |
| Header nav row          | 48px   |
| Capability row          | 56px   |
| Status dot              | 6px    |
| Heatmap cell            | 12px   |

---

## 6. Components

shadcn primitives in `src/ui`: `button`, `input`, `label`, `textarea`,
`select`, `card`, `dialog`, `dropdown-menu`, `badge`, `separator`, `skeleton`,
`table`, `switch`, `alert`, plus this project's `text` and `stack`, which carry
all copy and every layout box, and `pressable`, `code-block`, `image`,
`suggestions`, `data-value`, `brand`, `status-dot` and the `scene` background.
Nothing outside `src/ui` writes raw HTML or SVG; `AGENTS.md` section 2 has the
rule and lint enforces it. They sit on native elements: `dialog` is a
`<dialog>`, `dropdown-menu` a popover placed by CSS anchor positioning, `select` a
native `<select>`. `card` is customised to a 20px rhythm for
console density, and its spacing and surface are props (`gap`, `flush`, `variant`).

This project's own primitives sit beside them and compose those:

| Component           | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `page-header`       | title, one line of description, the page's primary action        |
| `field`             | label, control, hint and error as one unit with wired-up ids     |
| `empty-state`       | icon, what is missing, what to do about it, the action           |
| `confirm-button`    | arm then confirm for anything destructive, self-disarming        |
| `capability-row`    | mono key, description, switch. Off is grey                       |
| `stat`              | label, 34px mono number, optional meter and context line         |
| `status-dot`        | live, degraded, off, failed                                      |
| `pagination-footer` | range, total, previous, next                                     |
| `data-value`        | the mono treatment for a machine value, and `DataList` for pairs |
| `brand`             | the teal mark                                                    |

One component per concept. If a second version of any of these appears,
consolidate rather than fork.

---

## 7. Layout

One column, centred, capped at `max-w-5xl`. The header is capped the same, so
the two edges line up on every screen.

The header is fixed and collapses to a handle when the pointer has been away for
1.6 seconds. It reopens on hover, on focus, on entering the top strip, or after
120px of continuous upward pointer travel. Touch devices never collapse it.
Content clears it with `pt-24`, or `pt-32` inside a project where the nav row
adds a second row.

Breakpoints are Tailwind's. Three are used: `sm` for card grids going two-up,
`lg` for three-up, `xl` for a screen gaining its side panel. Mobile-first, and
no screen scrolls sideways.

---

## 8. Screens

**Sign in.** No header. The crystal scene fills the viewport and one card sits on
it. The button opens a wallet picker rather than connecting straight away, so
the person chooses between Nura Wallet and MetaMask. Wallets are discovered over
EIP-6963, so a row shows the wallet's own icon when it is installed and reads
"Not installed in this browser" when it is not. Failures appear in the picker,
against the wallet that produced them.

**Projects.** Card grid. Name, what it is for, when it was made, one way in.

**Overview.** Server load as six stat tiles, twelve weeks of activity as a
heatmap, then the trail as a table with a detail panel beside it from `xl`. The
trail carries a permanent All / Failures control.

**Agents.** Card grid. Name, what it does, the model as a chip, the file count.
Creating one is disabled until the project has a model, because an agent cannot
answer without one.

**Models.** Card grid. Name, slug, endpoint, key hint, and the context window,
which reads "Window not read yet" until the provider has been asked rather than
guessing a number. Test, Edit, and a Remove that arms before it fires.

**Bots.** Card per bot: connection mode, token hint, which agent answers, the
public address. Underneath, the people who have messaged them, each expanding
into their thread.

**Agent detail.** Instructions on the left as editable files, round-trips
underneath. Identity and capabilities on the right, sticky.

**Person detail.** Messages and agent notes on the left, identity and
permissions on the right.

---

## 9. Linting

Biome runs its recommended rule set over both workspaces (`biome.json`). One
rule is off: `useLiteralKeys`, because the tsconfigs set
`noPropertyAccessFromIndexSignature` and require the bracket form it rewrites.

Nothing checks Tailwind classes any more: an unknown class or a raw colour
outside `styles/index.css` is caught in review, not by lint.
