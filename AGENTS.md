# Agent Rules

## Agent Behavior

- First inspect the existing project structure.
- Read existing components before creating new ones.
- Reuse existing utilities and patterns.
- Do not rewrite unrelated code.
- Make the smallest correct change.
- Do not add unnecessary dependencies.
- Verify the implementation after changes.

## Code Quality

- TypeScript strict mode is required.
- Prefer small, composable React components.
- Avoid duplicated logic.
- Do not use `any` unless absolutely necessary.
- Do not disable lint rules to hide problems.
- Never use `biome-ignore` or other lint or formatter suppressions unless there is a documented reason, written into the comment.

---

# UI Engineering Rules

When working on UI, treat `DESIGN.md` as the project's source of truth.

The UI must be built using:

- shadcn/ui
- Tailwind CSS
- Native HTML behind the primitives: `<dialog>`, the popover API, `<select>`. No Radix.
- `motion` for animation that CSS cannot do
- Existing project components and tokens
- Existing design patterns before introducing anything new

Do not invent a new visual system for individual pages.

---

## 1. Before Changing UI

Before modifying any UI:

1. Inspect the existing page.
2. Inspect existing components.
3. Inspect `DESIGN.md`.
4. Inspect existing Tailwind/theme tokens.
5. Search for an existing shadcn/ui component before creating a custom component.
6. Reuse existing components whenever possible.
7. Identify the page's existing spacing and layout system.
8. Do not modify unrelated UI.

Never start by rewriting the entire page.

---

## 2. No raw HTML outside `src/ui`

This is an architectural rule, not a style preference:

```text
Feature / Page / Layout  →  components from @/ui  →  native HTML
```

- Native HTML and SVG (`div`, `span`, `p`, `button`, `form`, `ul`, `img`, `svg`,
  `path`, …) are written only inside `frontend/src/ui`.
- Everywhere else composes components from `@/ui`. If the primitive you need does
  not exist, add it to `src/ui` and reuse it; never reach for raw markup because
  an existing component is inconvenient.
- No workarounds: no `createElement`, no `dangerouslySetInnerHTML`, no member tags
  such as `motion.div` that render a raw element.
- Custom SVG, such as the background scene, lives in `src/ui` too
  (`src/ui/scene`).
- Lint enforces it. `lint/no-raw-html.grit` is a Biome plugin that fails
  `npm run lint` on any of the above outside `src/ui`.

The primitives that carry the app:

| Need                         | Use                                                    |
| ---------------------------- | ------------------------------------------------------ |
| Any copy                     | `Text`                                                 |
| Any box, list, form, landmark | `Stack` (`as="ul"`, `as="li"`, `as="form"`, …)     |
| An action with a label       | `Button`                                               |
| A clickable row with content | `Pressable`                                            |
| Label and value pairs        | `DataList` with `DataRow`                              |
| Preformatted machine text    | `CodeBlock`                                            |
| An image                     | `Image` (`alt` required, `""` when decorative)         |
| Input suggestions            | `Suggestions`, pointed at by the Input's `list`        |

### Text

Copy goes through `<Text />`. Use
`<Text type="…" message="…" />` from `@/ui/text`, and `as` when the
element matters (`as="dt"`, `as="time"`). `Text` never takes children: `message`
is a string or number. Copy that mixes styles, such as a mono number inside a
sentence, is a horizontal `Stack` of sibling `Text`s.

`type` carries the typography, so do not pass text size, weight or font classes
to `Text`; `className` is for layout (truncate, margins, grid) and for a status
colour read from a constant map such as `PROBE_TONE`.
A new combination is a new `type` in `text.tsx`, not a class on the instance.

### Stack

Every box is `<Stack direction="Horizontal" />` or `<Stack direction="Vertical" />`
from `@/ui/stack`. `as` keeps the
element (`as="header"`, `as="form"`, `as="li"`); `className` carries gap and
alignment. A wrapper with no layout of its own is `Vertical`, which lays its
children out the way block flow would. A responsive grid is a `Vertical` stack
that turns into a grid at its breakpoint: `className="gap-3 sm:grid sm:grid-cols-2"`.
Inside a stack, align a child with `self-*`, not the grid-only `justify-self-*`,
and centre it vertically with `justify-center`, not the grid-only `content-center`.
A spacer or swatch inside inline content is `as="span"`.

### Button

Actions are `<Button message="…" icon={<Icon />} />`, never children. `link="/path"`
makes it navigation, `iconPosition="end"` puts the icon after the label, and the
icon is hidden from screen readers for you. An icon-only button needs
`aria-label`.

A row that is pressed as a whole and holds more than a label, such as a person or
a wallet in a list, is a `Pressable` with its content inside.

---

## 3. shadcn/ui First

Use shadcn/ui components whenever an appropriate component exists.

Installed and ready to import from `@/ui`:

- Alert
- Badge
- Button
- Card
- Dialog
- DropdownMenu
- Input
- Label
- Select
- Separator
- Skeleton
- Switch
- Table
- Text
- Textarea

Anything else in the registry (Sheet, Drawer, Tabs, Popover, Command, Avatar,
Form) is not installed yet. Add it with `npx shadcn@latest add <name>` rather
than hand-rolling a substitute.

This project's own primitives sit beside them and are listed in `DESIGN.md`.
Reach for one of those before writing a new component.

Do not create a custom replacement for a shadcn/ui component unless there is a concrete project requirement.

Do not create custom UI primitives when shadcn/ui already provides them.

If a shadcn component exists but needs visual customization, customize its variants/classes instead of rebuilding the component.

When adding a component:

1. Check whether shadcn/ui already provides it.
2. Reuse existing components.
3. Keep variants as plain object maps keyed by variant name, joined with `cn` from `@/libs/cn`.
   `cn` does not merge Tailwind classes, so never pass a `className` that fights a
   primitive's own class. Give the primitive a prop or variant instead, as `Card`
   (`gap`, `flush`, `variant`), `CardContent` (`padding`) and `Skeleton`
   (`radius`) do.
4. Keep shared components in the existing components directory.
5. Do not duplicate components with slightly different names.

---

## 4. Spacing Rules

Follow the spacing scale defined in `DESIGN.md`.

Do not invent arbitrary spacing.

Avoid:

```tsx
p-[13px]
mt-[17px]
gap-[19px]
px-[27px]
```

Prefer:

```tsx
p - 4;
mt - 4;
gap - 4;
px - 6;
```

Use arbitrary values only when they solve a documented technical or visual requirement.

Do not use negative margins to fix a layout that should be solved with proper structure.

---

## 5. Layout

Prefer:

- Flexbox
- CSS Grid
- shadcn/ui layout patterns
- Tailwind responsive utilities

Avoid:

- excessive absolute positioning
- fixed pixel positioning
- negative-margin hacks
- nested containers with inconsistent padding
- duplicated responsive rules

All major page content must align to the same container.

---

## 6. Responsive Design

Mobile-first is mandatory.

Every UI change must be checked at:

- Mobile
- Tablet
- Desktop
- Large desktop

Use the project's standard breakpoints.

Do not introduce custom breakpoints unless absolutely necessary.

Do not design desktop first and attempt to repair mobile afterward.

---

## 7. Component Sizing

Use the standard component sizes defined in `DESIGN.md`.

Do not randomly change:

- button height
- input height
- icon size
- card padding
- border radius
- typography
- modal dimensions

If an existing shadcn component already provides the correct size variant, use that variant.

---

## 8. Typography

Use the project's typography tokens.

Do not create arbitrary font sizes such as:

```tsx
text-[17px]
text-[21px]
text-[29px]
```

unless explicitly required.

Maintain a clear hierarchy:

- Page title
- Section title
- Component title
- Body
- Secondary text
- Caption

Do not use font size alone to create hierarchy. Use spacing, weight and semantic structure.

Line height is one rule, set once on `*` in `styles/index.css`:
`calc(1em + 0.25rem)`, 4px of lead on top of the text. 11px text gets 15px lines,
14px body 18px, a 26px title 30px. The type scale carries font sizes only, so no
size utility changes it. Do not write a `leading-*` class.

---

## 9. Colors

Use existing theme tokens.

Prefer:

```tsx
bg - background;
bg - card;
bg - muted;
text - foreground;
text - muted - foreground;
border - border;
text - primary;
```

Do not introduce random colors.

Avoid hardcoded colors such as:

```tsx
bg-[#123456]
text-[#777777]
border-[#eeeeee]
```

when an existing semantic token can be used.

Do not introduce gradients unless the project explicitly requires them.

---

## 10. Borders and Radius

Use the existing shadcn/theme radius system.

Do not give every component a different radius.

Do not randomly combine:

```text
rounded-sm
rounded-md
rounded-lg
rounded-xl
rounded-2xl
```

Use the radius appropriate to the component defined in `DESIGN.md`.

---

## 11. Icons

Use the project's existing icon library, which is Lucide.

Prefer consistent icon sizing:

- Small: 14–16px
- Default: 16–20px
- Large: 20–24px

Do not mix unrelated icon libraries without a reason.

---

## 12. Forms

Use shadcn/ui form patterns.

Forms must have:

- Label
- Input/control
- Validation state
- Error message where applicable
- Consistent spacing

Do not manually position form elements.

Prefer semantic form structure and existing form components.

---

## 13. Accessibility

UI must remain accessible.

Always consider:

- keyboard navigation
- focus states
- labels
- semantic HTML
- accessible names
- disabled states
- loading states
- error states
- sufficient contrast

Never remove focus indicators merely because they are visually inconvenient.

---

## 14. States

Interactive components should account for:

- default
- hover
- focus
- active
- disabled
- loading
- error
- empty

Do not implement only the happy path.

---

## 15. UI Consistency

If two components serve the same purpose, they must look and behave consistently.

Do not create:

- five different button styles for the same action
- different card padding across pages
- different input heights
- inconsistent heading spacing
- inconsistent modal sizes

If inconsistency already exists, prefer the established design system rather than copying the inconsistency.

---

## 16. No UI Overengineering

Do not add UI merely because there is empty space.

Do not add:

- unnecessary cards
- unnecessary badges
- decorative elements
- excessive borders
- unnecessary animations
- redundant buttons
- duplicate information

Every visual element must have a purpose.

---

## 17. Preserve Existing Functionality

UI work must not break:

- business logic
- API calls
- state management
- routing
- forms
- authentication
- wallet functionality
- responsive behavior

Do not rewrite working logic when only the UI needs modification.

---

## 18. Validation

After UI implementation:

1. `npm run format`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`
5. Inspect the changed page visually at phone, tablet and desktop widths.
6. Check the console for errors.
7. Fix everything before considering the task complete.

Run `npm run format` before you finish. Biome is the house style, and it also
sorts imports, so let it move them rather than ordering them by hand.

`npm run lint` runs Biome's recommended rules and must stay clean.

Never bypass lint rules just to make the implementation pass.

Do not disable a lint rule unless there is a documented reason.

---

## 19. Definition of Done

A UI task is complete only when:

- It follows `DESIGN.md`.
- It uses shadcn/ui where applicable.
- Existing components were reused.
- Spacing follows the design scale.
- Typography follows the design scale.
- Responsive behavior works.
- Accessibility is preserved.
- No unnecessary arbitrary Tailwind values were introduced.
- No unrelated components were changed.
- Lint passes.
- TypeScript passes.
- Build passes.
- The resulting UI is visually consistent with the rest of the application.
