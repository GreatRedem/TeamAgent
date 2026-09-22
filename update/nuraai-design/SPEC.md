# NuraAI — design spec for implementation

## What's in here

```
tokens.css     colours, type, radii, elevation + a DaisyUI theme mapping
screens/       10 static reference screens, openable in a browser
SPEC.md        this file
```

The screens are **reference comps, not source**. Every value is an inline style so
the layout survives being read out of context. Don't ship them. Read them for
spacing, hierarchy and exact colour use, then build real components against
`tokens.css`.

Desktop screens are drawn at 1440×960, mobile at 390×844. Both are fixed-height
comps — in the real app the content column scrolls under the floating header.

A starting prompt for Claude Code:

> Read SPEC.md and tokens.css. Build the <screen> screen as a component in
> <stack>, using the DaisyUI theme from tokens.css. screens/<file>.html is the
> visual reference — match its spacing and colour use, but write real
> components, not inline styles.

## Non-negotiables

These are the rules the design is carrying. Breaking one breaks the point of it.

1. **Red means broken.** `error` is for failures only. Volume, traffic and
   activity are teal however high they get. The heatmap has its own red strip
   underneath precisely so a busy week never reads as a bad week.
2. **Mono for machine values.** Nonces, addresses, token counts, latency, file
   paths, handles, timestamps, model ids — all JetBrains Mono. Prose is Archivo.
   This is the main thing that makes it read as an instrument and not a website.
3. **Deny by default is visible.** A capability that is off looks off: grey
   track, grey knob, muted label. Never pre-check one in a form.
4. **Every list is paginated**, and the footer shows the range and the total
   (`1–12 OF 3,481`), not just arrows.
5. **Failures get words.** Anywhere a model call can fail, the person sees what
   failed and what to do — never a spinner that stops.
6. **44px minimum touch target on mobile.** Desktop chrome can go to 36px,
   list-row buttons to 28px.
7. Real `<button>`, `<a href>`, `<input>` + `<label>` everywhere. Icon-only
   buttons need `aria-label`. No clickable divs.

## Components to build first

| Component | Where it appears | Notes |
|---|---|---|
| `FloatingHeader` | every signed-in screen | detached bar, 16px inset, `--nura-shadow`. Holds the project switcher — the active project is always visible |
| `ProjectSwitcher` | header | name + `TEAM` badge + caret. Opens the team list |
| `RailNav` / `TabBar` | desktop / mobile | same 5 destinations: Overview, Agents, Bots, Models, Activity |
| `Panel` | everywhere | `--nura-panel`, 1px `--nura-line`, 12px radius. Header row, body, footer row separated by `--nura-line-soft` |
| `MonoLabel` | everywhere | 10px, .16em tracking, uppercase, `--nura-text-3` |
| `LED` | bots, models, rows | teal lit = live, brass = degraded, `--nura-off` = paused/unknown |
| `StatTile` | overview | mono label, 28px number, one line of context under it |
| `Heatmap` | overview | 12 cols × 7 rows, column = week, cell = day + separate failure strip |
| `PaginationFooter` | every list | range, total, prev/next |
| `CapabilityRow` | agent | label (mono) + description + switch, 56px tall |
| `DataRow` | models, activity | CSS grid, shared column template per table |
| `Bubble` | threads | inbound grey, agent teal-wash, failure rust-wash |
| `Chip` | everywhere | neutral / live / pending / fail variants |

## Screens

### 1 · Sign in — `screens/01-desktop-signin.html`, `07-mobile-signin.html`
Left (or top on mobile): the offer in one line. Right: the challenge card showing
the actual thing being signed — address, nonce, issue and expiry time — above two
buttons. The expiry chip counts down live and is brass, not red: expiring is not
failing. On expiry, swap the card for a **Get a new challenge** button rather
than silently re-issuing; the nonce is single-use and the person should see that.

States to build that aren't drawn: no wallet detected, wrong chain, signature
rejected, nonce already spent.

### 2 · Overview — `02-desktop-overview.html`, `08-mobile-overview.html`
Project home. Three stat tiles, the 12-week heatmap, then bots and the team.json
roster side by side (stacked on mobile). Heatmap cells are 18px desktop / 14px
mobile; hover shows the day's count and failure count. The roster panel is the
readable face of `team.json` — rank as a chip, handle in mono, description as one
line. Editing a member opens a drawer; the agent's `roster.write` edits one
member at a time, so the UI should too.

### 3 · Agent — `03-desktop-agent.html`, `10-mobile-agent.html`
Three columns: file list, markdown editor, capabilities. The file list separates
instructions and guardrails from `knowledge/`, and a file large enough to be
fetched on demand says so in brass under its name — that's the only hint the
person gets about what's in the prompt vs. what's fetched, so keep it.
Unsaved state is a brass dot on the file and a brass `UNSAVED` chip in the editor
bar. Mobile drops the editor and shows files + capabilities only.

Capabilities are the six agent tools: `notes.read`, `notes.write`,
`history.search`, `roster.read`, `roster.write`, `web.fetch`. Every toggle writes
to the audit trail.

### 4 · Telegram bot — `04-desktop-bot.html`
Top band: connection mode (segmented webhook/polling), the per-bot secret masked
with a rotate action, and the count of redelivered updates that were deduplicated
— that number is the proof the dedupe works, don't hide it in a log.

Below: threads list, then the conversation with a right panel showing the stored
profile and what the agent has learned about that person.

The agent bubble renders mid-stream with a block caret — the reply is written
into one message as words arrive, not posted whole. Build the failure bubble as a
real message in the thread (rust wash, plain language, what to do next).

### 5 · Models — `05-desktop-models.html`
Table of endpoints: model, base URL, context window, tool-call support. Context
is **read from the provider**, so show `— not read yet` until it has been; never
guess a number.

Detail panel shows the context budget as a bar — system / history / headroom —
with the count of trimmed messages, and the fallback chain: the model that can't
do tool calls, the reason, the model it falls back to. The swap happens on the
failing call, so the activity log shows both round-trips.

### 6 · Activity — `06-desktop-activity.html`
Left: round-trips, newest first — time, agent, model, in/out tokens, ms, result.
Results are `OK` teal, `TIMEOUT` rust, `FELL BACK` brass. The **Failures only**
filter is a permanent control, not a dropdown item.

Right, top: the selected round-trip — what was sent (system files, message count
and how many were trimmed, tools offered), what came back, and where the time
went as a three-part bar (queue / tool / model).

Right, bottom: the audit trail — every change with who made it, agent or wallet.

## Sample data

Names, handles, addresses, model ids and numbers in the comps are placeholders.
Wire real data in; don't copy the strings.
