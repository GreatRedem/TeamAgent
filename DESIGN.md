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

No gradients and no decorative background anywhere. Every page sits on the solid
`background` colour.

---

## 3. Type

Two faces. Vazirmatn carries everything the person reads; the platform mono
carries everything the machine produced.

- `--font-ui` is Vazirmatn, self-hosted from `frontend/public/fonts` as a
  variable woff2 in three subsets. No external font requests, no preload link:
  the `@font-face` rules are what load it.
- `--font-data` is the platform mono stack. Vazirmatn has no monospace cut, so
  machine values fall back to the system face rather than pulling a second
  family over the network. Its first entry, `Vazirmatn Persian`, is the same
  Arabic-script woff2 limited to Persian code points, so a translated value in
  a data slot keeps Vazirmatn's letterforms while Latin letters and ASCII digits
  stay mono.

The scale is Tailwind's, plus three named steps. Nothing outside it.

| Role                        | Class                        | Size |
| --------------------------- | ---------------------------- | ---- |
| Page title                  | `text-page font-semibold`    | 26px |
| Stat number                 | `text-stat font-medium` mono | 34px |
| Section and card title      | `text-base font-semibold`    | 16px |
| Body                        | `text-sm`                    | 14px |
| Caption                     | `text-xs`                    | 12px |
| Meta, chips, machine values | `text-2xs`                   | 11px |

**Line height is chosen by role.** The type scale steps are font sizes only
(`--text-*: initial` clears Tailwind's own, each with its line height). Line height
is a separate token, one of four, defined in `styles/index.css` (`--leading-*: initial`
clears Tailwind's named steps, so these are the only ones):

| Role    | Class             | Value | Used for                                                                                                  |
| ------- | ----------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| Display | `leading-display` | 1.2   | page titles, stat figures                                                                                 |
| Heading | `leading-heading` | 1.3   | card, dialog, section, list-item and empty-state titles, legends                                          |
| Control | `leading-control` | 1.25  | one line in a fixed-height box: buttons, badges, labels, inputs, selects, menu items, nav tabs, table cells |
| Body    | `leading-body`    | 1.5   | anything that reads or wraps: paragraphs, descriptions, helper and error text, captions, data values, text areas, code blocks; the page default |

Large, short text sits tight; text that reads or wraps gets room. A control's box has
a fixed height, so its line height only has to hold one line without clipping. Body
is the page default, set on `body`; `Text` types and `src/ui` primitives set the
rest. No other line height is used.

Vazirmatn's vertical metrics (ascent 1.03em, descent 0.54em) are sized for Arabic and
sat Latin text 0.11em high in every line box. The Latin `@font-face` subsets override
them to 0.95em and 0.25em, which fits Latin ink including accents and descenders and
centres capitals in buttons, badges and inputs. The Arabic subset keeps its own.

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
| Button default          | 40px   |
| Button `sm`             | 36px   |
| Button `lg`             | 44px   |
| Input, select, textarea | 36px   |
| Header bar              | 56px   |
| Header nav row          | 48px   |
| Capability row          | 56px   |
| Status dot              | 6px    |
| Heatmap cell            | fills the week column, 10px minimum |

---

## 6. Components

shadcn primitives in `src/ui`: `button`, `input`, `label`, `textarea`,
`select`, `card`, `dialog`, `dropdown-menu`, `badge`, `separator`, `skeleton`,
`table`, `switch`, `alert`, plus this project's `text` and `stack`, which carry
all copy and every layout box, and `pressable`, `code-block`, `image`,
`suggestions`, `data-value`, `brand`, `status-dot` and `tabs`.
Nothing outside `src/ui` writes raw HTML or SVG; `AGENTS.md` section 2 has the
rule. They sit on native elements: `dialog` is a
`<dialog>`, `dropdown-menu` a popover placed by CSS anchor positioning, `select` a
native `<select>`, `tabs` keyboard-driven buttons with every panel kept
mounted. `card` is customised to a 20px rhythm for
console density, and its spacing and surface are props (`gap`, `flush`, `variant`).
Its `signal` prop draws a 2px left rail in a status colour, for cards whose first
answer is whether the thing they show is working.

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

The header is fixed and always fully open: it does not narrow or hide when the
pointer is idle.
Content clears it with `pt-24`, or `pt-32` inside a project where the nav row
adds a second row.

Breakpoints are Tailwind's. Three are used: `sm` for card grids going two-up,
`lg` for three-up, `xl` for a screen gaining its side panel. Mobile-first, and
no screen scrolls sideways.

A scrollbar never moves content. The page always reserves its gutter, and a box
that scrolls on its own (`overflow-y-auto` with a max height) adds `scroll-stable`,
so its text does not re-wrap when the scrollbar appears.

---

## 8. Screens

**Sign in.** No header. One card sits centred on the solid background. The button opens a wallet picker rather than connecting straight away, so
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

**Plugins.** Card per connection, led by its health: a signal rail on the card's
edge and one plain sentence beside a status dot, saying who it is connected as,
who answers for it, or what broke. Under it four readings (this week, failed,
received, last used), the agents allowed to use it as chips, and where it forwards
events. Test, Activity, Modify and an arming Remove; the on/off switch sits in the
header because it is a state, not an action. Activity opens every request with a
breakdown by action.

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
