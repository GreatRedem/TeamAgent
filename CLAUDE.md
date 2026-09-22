# CLAUDE.md

NuraAI — agent platform. Wallet sign-in, Telegram bots, agents defined by
markdown files, OpenAI-compatible model endpoints, a `team.json` roster, and a
full record of every model round-trip.

## Design source

- `design/SPEC.md` — component list, screen-by-screen intent, states to build.
- `design/tokens.css` — colours, type, radii, elevation, DaisyUI theme mapping.
- `design/screens/*.html` — **reference comps only.** Read them for spacing,
  hierarchy and colour use. Never import them, never copy their inline styles
  into a component, never ship them.

Before changing any UI, read SPEC.md and tokens.css.

## UI rules

- **Red means broken.** `error` is for failures only. Volume, traffic and
  activity stay teal however high the number gets. A busy week is never red.
- **Mono for machine values.** Addresses, nonces, token counts, latency, model
  ids, file paths, handles, timestamps → JetBrains Mono. Prose → Archivo.
- **No new design values.** Every colour, radius, font size and shadow comes
  from `tokens.css`. If something is genuinely missing, ask before inventing it.
- **Deny by default is visible.** A capability that is off renders off — grey
  track, grey knob, muted label. Never pre-check one.
- **Every list is paginated**, with a footer showing range and total
  (`1–12 OF 3,481`), not bare arrows.
- **Failures get words.** Anywhere a model call can fail, render what failed and
  what to do next. Never a spinner that just stops.
- **Real elements.** `<button>`, `<a href>`, `<input>` + `<label>`. No clickable
  divs or spans. `aria-label` on icon-only buttons. Text at 4.5:1 minimum.
- **Touch targets:** 44px minimum on mobile. Desktop chrome may go to 36px,
  list-row icon buttons to 28px.

## Working rules

- **Stay in scope.** A UI task is presentation only — don't change routes, data
  fetching, props, state shape or API calls unless the task says so.
- **If a component isn't in SPEC.md, leave it alone.** Don't refactor adjacent
  code you happen to be reading.
- **One screen or one step per session.** Finish it, then stop.
- **Show diffs** for anything touching more than two files, before moving on.
- Don't add a dependency without asking. DaisyUI and Tailwind are already here.
- Sample data in the comps (names, handles, addresses, numbers) is placeholder.
  Wire real data; don't copy the strings.

## Before you say you're done

```
[YOUR TYPECHECK COMMAND]
[YOUR LINT COMMAND]
[YOUR BUILD COMMAND]
```

All three pass, or say plainly what's still failing.
