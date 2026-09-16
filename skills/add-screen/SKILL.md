---
name: add-screen
description: Build or review a NuraAI console screen against the design system — the quarantine block for externally-sourced content, denial-is-not-an-error colour semantics, the four required states, logical properties for RTL, and the accessibility floor. Use when creating or changing any frontend view or component.
---

# Add a screen

`docs/24-ui-standards.md` is the design system and `docs/25-ui-information.md` is the screen inventory. This is the procedure and the checks.

## 1. Find out whether the screen shows content the system did not write

This is the first question, not a detail, and it determines the whole design.

Content the system carries — message bodies, knowledge content, tool arguments and results, model completions, names people chose, anything from a connector — goes in a **quarantine block**. Content the system speaks — labels, actions, decisions, chrome — does not.

They must never be confusable. An approval screen shows the message that triggered an action, and that message is frequently hostile. If it can be styled to look like something the system said, the reviewer approves, and the last structural control before a consequential action becomes a rubber stamp with an audit trail.

### Quarantine block rules

1. **Origin header inside the block**, not a caption above it. A caption scrolls away from its content.
2. **Plain text.** No markdown, no HTML, no autolinking, no image loading. A markdown image is an exfiltration channel requiring no send permission at all (T6), and render time is where that is stopped. "We will sanitize it" is not an answer.
3. **No controls inside** — no buttons, links, or fields. If a quarantined value needs an action, the action lives in the chrome outside and refers to it.
4. **Visibly recessed**, with a real `border` (not `box-shadow` — forced-colors strips shadows) and an inner rule on the inline-start edge.
5. **Scrolls rather than truncates**, with a character count. `…` does not tell a reviewer how much more there is.
6. **IBM Plex Mono**, not the UI face. Monospace is banned elsewhere in this system as a generic tell; here it is load-bearing — it survives zoom and theme, renders bidi overrides visibly instead of letting them reorder the display, and cannot be styled into looking like the sans-serif chrome.

## 2. Get the colour semantics right

The mistake to avoid:

> **A denial is not an error.** It is the system working as designed, and on a healthy deployment it is the most common non-trivial outcome.

Colouring `denied` red teaches reviewers that the control firing is a fault, and makes the console look like an incident during normal operation.

| Meaning | Treatment |
|---|---|
| `allowed` | `--ink`, no marker |
| `denied` | `--muted` with a barred marker |
| `approval_required` | `--signal` (amber) — a human must decide |
| **alarm** (`--alarm`, red) | **Only** should-be-zero conditions: refresh-token reuse, cross-team access, R3 rejection |

Red appears on about three screens in the product. That is what makes it mean something.

**Colour never carries meaning alone.** Every state pairs colour with a shape, icon, or text — required by WCAG, and the only thing that works in forced-colors mode, in a screenshot pasted into a ticket, and for a colourblind reviewer.

## 3. Design four states, not one

- **Loading** — skeletons only where layout is predictable. Never a full-page spinner over a view that already has content.
- **Empty** — an invitation with the action attached. An empty *security* view is good news and reads that way: "No denied calls in this period", not "No data".
- **Error** — what happened and what to do, in the interface's voice. No apology, no stack trace, never a raw provider error. Include `request_id`.
- **Denied** — distinct from error. "This action needs approval because the request came from an untrusted source", linking to the approval it created.

## 4. Build it RTL-correct the first time

**Logical properties only**: `ms-*`, `pe-*`, `start-*`, `text-start`, `padding-block`, `inset-inline-end`. Never `ml-*`, `pr-*`, `left-*`, `text-right`.

Tailwind resolves these from `dir` on `<html>`, so the layout flips for Persian with no per-component work. Physical properties have to be audited class by class later — cheap now, expensive then, and the most expensive thing in the standards doc to retrofit.

One qualification: ask whether the value *should* flip. A chevron pointing at the next item flips. A logo, a chart's time axis, and a hex value do not — use the physical property there, deliberately.

**Identifiers are LTR always**, in both locales, isolated with `<bdi>` or `unicode-bidi: isolate`. A hex address reordered by surrounding RTL text is not a cosmetic bug; it is a different address.

Dates, numbers, and currency go through `Intl`. Persian calendar conventions differ enough that hand-formatting will be wrong.

## 5. Meet the accessibility floor

Build requirements, not a later pass:

- `:focus-visible` outline with `outline-offset` on everything interactive; never `outline: none` without a replacement
- 4.5:1 text contrast, 3:1 for UI boundaries and state indicators — including the quarantine border, which is a boundary that carries meaning
- Full keyboard operation, tab order matching visual order, no positive `tabindex`
- Native `<dialog>` with `.showModal()` — **do not write a focus trap**, the platform does it correctly
- Validation on `blur`, cleared on `input`, styled with `:user-invalid` not `:invalid` (`:invalid` flags a required-empty field on load, so a fresh form arrives pre-flagged)
- `aria-invalid` set at the same moment the visual error appears, not earlier
- One `polite` and one `assertive` live region per page; `assertive` is for session expiry, not "Saved"
- Text resizes to 200% without loss of content

## 6. Copy

- Name things as the user understands them: "Which destinations this agent can message", not "egress allowlist configuration".
- The verb survives the flow: "Approve" produces "Approved", "Revoke key" produces "Key revoked". Never "Submit", never "OK".
- Sentence case everywhere. Title case does not survive translation to Persian, which has no case.
- No all-caps labels, no eyebrow labels above headings, no `→` appended to buttons. All three are generic tells, and all-caps produces two visual languages in a bilingual product.

## Checklist

- [ ] Every externally-sourced value is quarantined with its origin visible
- [ ] No quarantine block contains a control, link, loaded image, or rendered markup
- [ ] Nothing communicates state through colour alone; checked in forced-colors mode
- [ ] `denied` does not read as an error; red only for should-be-zero
- [ ] Loading, empty, error, and denied states all designed
- [ ] Logical properties throughout; checked with `dir="rtl"`
- [ ] Identifiers bidi-isolated and mono
- [ ] Keyboard operable with visible focus
- [ ] Validation on `blur`, `:user-invalid`
- [ ] Renders at 400px and at 200% zoom

## If it is one of the five security-critical screens

Approval review, agent grants, run trace, API key issuance, and knowledge item trust are specified in detail in `docs/25-ui-information.md`, including what must be on screen together and why. Read that section before designing — these are not ordinary CRUD views, and the details in them are controls rather than preferences.
