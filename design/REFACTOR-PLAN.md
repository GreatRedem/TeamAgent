# Refactor plan: existing UI → SPEC.md + tokens.css

Source of truth: `update/SPEC.md` and `update/tokens.css` (identical copies also
under `update/nuraai-design/`). Nothing in `frontend/src` imports `tokens.css`
yet, and no `--nura-*` variable is referenced anywhere.

Scope of this document: a map from what exists to what the spec lists, an
inventory of hardcoded values, and an ordered checklist. No code was changed.

---

## 1 · Component map

Legend: **have** = exists and mostly matches · **partial** = exists, needs
reshaping · **missing** = nothing to build on.

| Spec component | Status | Where it lives today | Gap |
|---|---|---|---|
| `FloatingHeader` | partial | `components/Header.tsx` (+ `Layout.tsx` sticky wrapper) | Already an island with blur. Missing `--nura-shadow`, 16px inset (currently `px-4 py-3`), and the project switcher. Sign-out lives here **and** on `Dashboard.tsx`. |
| `ProjectSwitcher` | missing | `Header.tsx` renders a static badge link to the active team | No `TEAM` badge, no caret, no dropdown to the team list. Name cache (`names` Map) is reusable. |
| `RailNav` / `TabBar` | partial | `components/Tabs.tsx`, used only inside `pages/Team.tsx` | Tablist keyboard/ARIA logic is good and reusable. But it is a panel-level tab strip with **7** tabs (Overview, Settings, Telegram, Model, Agent, Conversation, Profile); spec wants **5** app-level destinations (Overview, Agents, Bots, Models, Activity), a rail on desktop and a bottom bar on mobile. Settings, Conversation and Profile have no spec home — see §4. |
| `Panel` | partial | CSS only: `.section`, `.panel` in `index.css`; header via `components/SectionHeader.tsx` | No component. `.section` is the closer match (border + radius + fill). Missing footer row and `--nura-line-soft` dividers. `.panel` is the page wrapper (max-w-4xl, blur), a different thing. |
| `MonoLabel` | missing | Nearest: `.field__label` (13px sans), `.doc__name` / `.doc__cost` (mono, ad hoc sizes) | `tokens.css` already ships `.nura-label`. Every `field__label`, `details__key`, `bubble__time`, `heatmap__day` should become one. |
| `LED` | missing | `Header.tsx`: `span.size-1.5.rounded-full.bg-primary` | `tokens.css` ships `.nura-led` / `.nura-led-lit`. No degraded/off states anywhere. |
| `StatTile` | missing | `TeamOverview.tsx` prints "N actions in the last 12 weeks · busiest day N" as a `.note` | Data exists (`heatmap.total`, `heatmap.busiest`); nothing tile-shaped. |
| `Heatmap` | partial | `TeamOverview.tsx` (`toWeeks`, `level`) + `.heatmap*` in `index.css` | Bucketing and level logic reusable. Cells are 12px (spec 18/14). Ramp is `bg-primary/10…100` not `--nura-heat-0…4`. **Bug:** CSS styles `[data-failed]`, TSX sets `data-errors` — the failure outline never renders. Spec wants a separate failure strip under the grid, not an outline. Legend cells reuse `.heatmap__cell`. |
| `PaginationFooter` | partial | `components/LoadMore.tsx` | Focus handling and live region are worth keeping. It is "Show N more", not range + total + prev/next. Backend returns `has_more` only, **no total** (`api.ts:196` documents this as deliberate). Spec rule 4 needs a `total` from every list endpoint. |
| `CapabilityRow` | partial, **duplicated** | `components/ProfilePermissions.tsx` and the Capabilities block in `pages/Agent.tsx` | Same markup twice: `.rows__item--row` + `ghost` / `ghost--danger` button labelled Allowed/Denied. Spec: mono label + description + **switch**, 56px, off = grey. Today off = **red** (`ghost--danger`), which breaks "red means broken". |
| `DataRow` | missing | `.rows__item--row` (flex-wrap) in Models, Bots, Overview audit list, Profile bots | No shared grid column template; columns wrap unpredictably. |
| `Bubble` | partial | `.bubble__text`, `.bubble__time` in `index.css`; used in `TeamConversations.tsx`, `pages/Profile.tsx` | **No `.bubble` base rule and no `[data-direction]` styling** — bubbles are currently unstyled paragraphs. No failure variant, no streaming caret. |
| `Chip` | partial | `.badge[data-mode]` (actor/mode) and `.probe[data-state]` in `index.css` | Two half-chips. `probe[data-state="pending"]` is emitted by `TeamBots`/`TeamModels`/`TeamOverview` but has **no CSS rule**. `ok` is coloured `text-info` (blue), not live teal. No neutral/live/pending/fail set. |

Not in the spec table but present and fine to keep: `Button.tsx` / `ButtonLink`
(primary action, 44px), `Brand.tsx` (mark scales with `currentColor`),
`LoadMore.tsx` a11y behaviour, `Tabs.tsx` keyboard model, `profileName.ts`,
`lib/tokens.ts` (token *estimate* — unrelated to design tokens despite the name).

---

## 2 · Hardcoded values that should come from tokens

### 2.1 Theme is a different theme
`frontend/src/index.css` defines a daisyUI theme `nura` in **oklch blue**,
sampled from `dashboard.png`. `tokens.css` is graphite + teal. Every mapping
differs, and two are inverted:

| daisyUI slot | index.css today | tokens.css says |
|---|---|---|
| `base-100` | page (`oklch(13.1% …)`) | **panel** `#121518` |
| `base-200` | card (`oklch(14.8% …)`) | **page** `#0B0D0F` |
| `base-300` | `oklch(17.5% …)` | raised `#1E2429` |
| `primary` | blue `oklch(61.2% 0.206 256)` | live teal `#3FCBB0` |
| `accent` / `info` | light blue | brass `#D9A441` / teal |
| `success` | green | teal `#3FCBB0` |
| `warning` | yellow | brass |
| `error` | `oklch(70% 0.17 25)` | `#E4705C`, content `#F0CFC8` |
| `--color-edge`, `--color-edge-strong` | blue-alpha borders (custom `@theme`) | `--nura-line`, `--nura-line-strong` (opaque) |
| radii | `0.625rem` field / `0.875rem` box / `999px` selector | `8px` / `12px` / `6px` chip / `999px` pill |

Because `base-100`/`base-200` are swapped, flipping the theme flips every
`bg-base-100` / `bg-base-200` in the codebase (`.panel`, `.section`, `.doc`,
`.doc__editor`, `Header.tsx`). Grep before, not after.

### 2.2 Fonts
- `frontend/index.html:13` loads **IBM Plex Sans / Mono** from Google Fonts.
- `index.css` `@theme`: `--font-sans: "IBM Plex Sans"…`, `--font-mono: "IBM Plex Mono"…`.
- Spec: **Archivo** for prose, **JetBrains Mono** for machine values (`--nura-font-ui`, `--nura-font-mono`).

### 2.3 Colour by opacity instead of by token
`text-base-content/55` is the de-facto "secondary text" everywhere. These should
become `--nura-text-2/3/4`:

| Pattern | Count | Files |
|---|---|---|
| `text-base-content/55` | 12 | `index.css` (`.rows__meta`, `.details__key`, `.field__label`, `.field__hint`, `.note`, `.probe`, `.doc__cost`, `.heatmap__legend`), `SectionHeader.tsx`, `LoadMore.tsx` |
| `text-base-content/60` | 4 | `Header.tsx`, `SignIn.tsx`, `NotFound.tsx`, `.badge[data-mode=owner]` |
| `/50`, `/45`, `/80` | 4 | `.field__hint`, `.heatmap__days`, `.bubble__time`, `.ghost` |
| `bg-primary/10 · /25 · /45 · /70 · /100` | 5 | heatmap ramp → `--nura-heat-0…4` |
| `bg-primary/15`, `bg-base-content/10` | 2 | `.badge[data-mode]` → chip washes |
| `border-error/40`, `bg-error/15`, `hover:bg-error/10` | 3 | `.ghost--danger`, `.ghost[data-state=armed]` → `--nura-fail-edge`, `--nura-fail-wash` |
| `bg-base-200/80` + `backdrop-blur-xl` | 2 | `.panel`, `Header.tsx` — spec panels are opaque `--nura-panel` |

### 2.4 Arbitrary sizes in JSX and CSS
| Value | Where | Token / rule |
|---|---|---|
| `text-[1.0625rem]`, `text-[0.8125rem]` | `SectionHeader.tsx:25,30` | panel header type scale |
| `text-[0.9375rem] tracking-[0.18em]` | `Brand.tsx:36` | wordmark |
| `text-[0.8125rem]` ×3, `text-[0.6875rem]` ×2, `text-[0.625rem]` | `index.css` (`.field__label`, `.probe`, `.doc__editor`, `.badge`, `.bubble__time`, `.heatmap__days`) | all should be `.nura-label` (10px / .16em) or body sizes |
| `size-3`, `repeat(7, 0.75rem)`, `gap-[3px]`, `rounded-[2px]` | `.heatmap*` | 18px desktop / 14px mobile cells |
| `size-1.5 rounded-full bg-primary` | `Header.tsx:99` | `.nura-led` (6px) |
| `min-h-14`, `max-w-5xl`, `rounded-box` | `Header.tsx:93` | header height / inset |
| `min-h-[60dvh]`, `max-w-lg` | `SignIn.tsx`, `NotFound.tsx` | sign-in layout |
| `max-w-4xl` | `.panel` | page column |
| `min-h-11` / `min-h-9` / `min-h-10` | `Button.tsx`, `.ghost`, `LoadMore.tsx` | 44 / 36 / 40 — matches rule 6, but should be named once |
| `[--tab-border-color:var(--color-primary)]` | `Tabs.tsx:63` | nav active colour |

### 2.5 Orphaned and broken references (fix regardless of tokens)
- **13 undefined CSS variables** in the sign-in scene: `--bg`, `--bg-deep`,
  `--glow`, `--glow-bright`, `--ink`, `--facet-hi/lo/deep`, `--rock-hi/deep/rim`.
  They were defined in the old `index.css` and removed in the uncommitted rewrite;
  `scene.css:22,84` and every file in `components/scene/*.tsx` still use them, so
  the illustration currently paints with invalid colours.
- `scene.css:21,34,62` — three raw `oklch()` literals (blue), not tokens.
- `scene.css:99–104, 111–121` — two `@media` blocks contain selector-less
  `{ … }` rules (a selector was deleted). Invalid CSS, silently dropped.
- Class `spin` (`WalletSignIn.tsx:85`) and `visually-hidden` (`LoadMore.tsx:56`)
  have **no definition**. Tailwind's `animate-spin` / `sr-only` cover both.
- `.heatmap__cell[data-failed]` (CSS) vs `data-errors` (TSX) — see §1.
- `.probe[data-state="pending"]`, `.bubble`, `.bubble[data-direction]`,
  `.badge[data-mode="agent"]` — emitted by JSX, no rule.

### 2.6 Semantic-colour violations (spec rules 1 and 3)
- Denied capability = red (`ghost--danger`). Off must be grey (`--nura-off`).
- OK probe = `text-info` blue. OK must be `--nura-live`.
- Audit outcome `pending` unstyled; spec: brass `--nura-pending`.
- `Tabs` active border = `primary`; fine once primary is teal.

---

## 3 · Ordered checklist

Order is chosen so each step leaves the app working and visibly closer, and so
nothing is styled twice. Steps 1–4 are foundation; 5–14 are the spec's
"components to build first"; 15+ are chrome and screens.

### Foundation
- [ ] **1. Import tokens.** Copy `update/tokens.css` to `frontend/src/tokens.css`
      and `@import` it from `index.css` before the daisyUI theme. Don't edit the
      copy; it is the contract.
- [ ] **2. Rewrite the daisyUI theme block** in `index.css` to the mapping at the
      bottom of `tokens.css` (base-100 = panel, base-200 = page, primary teal,
      accent brass, error rust, radii 12/8/999). Replace the custom `--color-edge*`
      with `--nura-line` / `--nura-line-strong`. Then grep `bg-base-100` /
      `bg-base-200` and swap where the intent was "page" vs "panel".
- [ ] **3. Fonts.** Swap the Google Fonts link in `index.html` to Archivo +
      JetBrains Mono; point `--font-sans` / `--font-mono` at `--nura-font-ui` /
      `--nura-font-mono`. Delete the IBM Plex comment.
- [ ] **4. Repair the scene.** Either define the 13 orphaned variables in
      `scene.css` from `--nura-*` (bg → `--nura-bg`, glow → `--nura-live`, rock →
      `--nura-raised`/`--nura-well`, ink → `--nura-text`), or drop the scene from
      signed-in pages entirely (spec draws no illustration behind the app; only
      sign-in has a left/right split). Fix the two selector-less `@media` rules.
      Replace the three `oklch()` literals.
- [ ] **4b. Dead classes.** `spin` → `animate-spin`; `visually-hidden` → `sr-only`.

### Primitives (spec table, in dependency order)
- [ ] **5. `MonoLabel`.** One component (or just adopt `.nura-label`). Replace
      `.field__label`, `.details__key`, `.bubble__time`, `.heatmap__day`,
      `.doc__cost`, `SectionHeader` subtitle. Kills most of §2.3/§2.4.
- [ ] **6. `Chip`.** Variants `neutral | live | pending | fail`, radius
      `--nura-r-chip`, washes from tokens. Replace `.badge[data-mode]` and
      `.probe[data-state]` (gives `pending` a colour and makes `ok` teal).
- [ ] **7. `LED`.** `lit | degraded | off` on `.nura-led`. Replace the header
      dot; add to bot rows (webhook/polling reachable) and model rows (probe).
- [ ] **8. `Panel`.** Component with `head` / `body` / `foot` slots, borders
      `--nura-line`, dividers `--nura-line-soft`, radius 12px, no blur. Fold
      `SectionHeader.tsx` into `Panel.Head`. Replace every `<section
      className="section">` and the `.doc` article wrapper. Retire `.panel`
      page wrapper.
- [ ] **9. `PaginationFooter`.** Needs backend: add `total` to every list
      response (`team`, `bot`, `agent`, `model`, `conversation`, `audit`,
      `exchange`, profile files). One `COUNT(*)` per list call — accept it, the
      spec makes range+total a rule. Then rebuild `LoadMore.tsx` as
      `1–12 OF 3,481` + prev/next, keeping its focus/live-region behaviour.
      Mobile buttons ≥ 44px.
- [ ] **10. `CapabilityRow`.** One component replacing both copies
      (`ProfilePermissions.tsx`, `Agent.tsx` Capabilities). `MonoLabel` key +
      description + real `<input type="checkbox" role="switch">`, 56px row.
      Off = `--nura-off` track and knob, muted label. Never red.
- [ ] **11. `DataRow`.** CSS-grid row taking a column template from its table.
      Use for Models (model · base URL · context · tools · actions) and the
      audit trail (time · actor · action · target · outcome). Replace
      `.rows__item--row` there; keep `.rows__link` for simple link lists.
- [ ] **12. `Bubble`.** Add the missing base rule and `data-direction="in|out"`
      (grey / `--nura-live-wash`), plus `data-state="failed"` rust wash. Streaming
      caret can wait until the reply path streams to the browser (it doesn't
      today — replies go to Telegram).
- [ ] **13. `StatTile`.** `MonoLabel` + 28px mono number + one context line.
- [ ] **14. `Heatmap`.** 18px/14px cells, `--nura-heat-0…4`, fix
      `data-errors` vs `data-failed` to one attribute, move failures to a separate
      strip row under the grid, keep `toWeeks`/`level`.

### Chrome
- [ ] **15. `FloatingHeader` + `ProjectSwitcher`.** Add `--nura-shadow`, 16px
      inset, opaque `--nura-panel`. Turn the team badge into a `<button
      aria-haspopup="listbox">` with `TEAM` chip + caret opening the team list
      (reuse `teamList()`). Remove the duplicate Sign out from `Dashboard.tsx`.
- [ ] **16. `RailNav` / `TabBar`.** Five destinations as **routes**
      (`/dashboard/team/:id/{overview,agents,bots,models,activity}`), not
      component state — deep links must work (SPA fallback already in place).
      Rail on `lg:`, bottom bar below, 44px targets. Reuse `Tabs.tsx` key
      handling for the tablist role. Decide where Settings, Conversation and
      Profile go (§4).

### Screens
- [ ] **17. Sign in.** Challenge card needs the nonce, address, issued-at and
      expiry shown; `walletNonce()` currently returns only `{ message }`
      (`api.ts:62`). Extend the backend response with the fields it already has
      on `account_nonce`. Add the brass countdown chip, expiry → "Get a new
      challenge", and the four undrawn error states (no wallet, wrong chain,
      rejected, nonce spent — the last maps to the existing 4xx result code).
- [ ] **18. Overview.** Three `StatTile`s, `Heatmap`, then Bots panel + Roster
      panel side by side. Roster: backend `GET/PUT /team/:id/roster` exists,
      **`api.ts` has no client for it** — add `teamRoster()` /
      `teamRosterWrite()`. Edit one member at a time in a drawer.
- [ ] **19. Agent.** Three columns on `lg:` (files / editor / capabilities),
      files + capabilities only on mobile. Split file list into instructions +
      `knowledge/`; the existing "on demand" cost hint becomes the brass note
      under the name. Unsaved = brass dot + `UNSAVED` chip (replace the
      Save/Saved label logic in `DocumentEditor`). Move exchanges out to Activity.
- [ ] **20. Bot.** Segmented webhook/polling (drives `public_url` blank vs set),
      masked secret + rotate, dedupe counter, threads + conversation +
      profile-side panel. **Needs backend:** a rotate-secret endpoint and a
      deduplicated-update counter — neither exists. Threads/profile side panel
      absorbs today's Conversation and Profile tabs.
- [ ] **21. Models.** `DataRow` table with context window (`context_tokens`,
      `0` → "— not read yet") and tool-call support. Detail panel: budget bar +
      fallback chain. **Needs backend:** tool-call capability flag, budget
      breakdown and fallback chain are not exposed; ship the table first.
- [ ] **22. Activity.** Team-wide round-trip list with permanent "Failures only"
      control, detail panel, audit trail underneath. Exchanges are per-agent
      today (`GET /team/:id/agent/:agentId/exchange`); a team-scoped listing
      with token counts is a new endpoint. Audit trail moves here from Overview.

### Cleanup
- [ ] **23.** Delete `.section`, `.panel`, `.rows__item--row`, `.probe`,
      `.badge[data-mode]`, `.ghost--danger` (only "Remove/Confirm" should stay
      rust), `dashboard.png` (the old reference), and the IBM Plex comments.
- [ ] **24.** `npm run typecheck`, `npm run build:web`, `npm run lint`. Grep
      for `text-base-content/`, `bg-primary/`, `text-\[`, `oklch(`, `#[0-9a-f]`
      under `frontend/src` — target is zero outside `tokens.css`.

---

## 4 · Decisions to make before step 16

1. **Where Settings / Conversation / Profile live.** Spec has five destinations.
   Proposal: team Settings → gear in the `ProjectSwitcher` menu; Conversations →
   the Bot screen's thread list; Profile → the right-hand panel on a thread
   (spec §4 shows exactly that).
2. **Capability naming.** Spec lists `notes.read`, `notes.write`, `history.search`,
   `roster.read`, `roster.write`, `web.fetch`. Backend catalog
   (`agent.permission.ts`) has `prefs.read`, `prefs.write`, `conversation.read`,
   `team.read`, `team.write`, `roster.read`, `roster.write`, `web.fetch`, `basics`.
   The UI renders whatever the catalog sends, so this is a backend label/key
   question, not a frontend one. Don't rename keys in the refactor — a renamed
   key is a revoked permission for every agent (deny-by-default).
3. **Keep the sign-in scene or not.** It is the one place blue lives and the only
   consumer of `scene.css`. Spec's sign-in is a split layout with no
   illustration drawn, so dropping it is allowed, not required.
4. **`total` on list endpoints.** Spec rule 4 vs. `api.ts:196`'s stated reason for
   `has_more` only. One is going to give.
