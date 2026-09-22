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
- Never use `eslint-disable`, `oxlint-disable`, or formatter ignores unless there is a documented reason.

---

# UI Engineering Rules

When working on UI, treat `DESIGN.md` as the project's source of truth.

The UI must be built using:

* shadcn/ui
* Tailwind CSS
* Radix primitives where used by shadcn/ui
* Existing project components and tokens
* Existing design patterns before introducing anything new

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

## 2. shadcn/ui First

Use shadcn/ui components whenever an appropriate component exists.

Prefer:

* Button
* Input
* Textarea
* Label
* Card
* Dialog
* Sheet
* Drawer
* DropdownMenu
* Select
* Tabs
* Tooltip
* Popover
* Command
* Alert
* Badge
* Avatar
* Separator
* Skeleton
* Table
* Form

Do not create a custom replacement for a shadcn/ui component unless there is a concrete project requirement.

Do not create custom UI primitives when shadcn/ui already provides them.

If a shadcn component exists but needs visual customization, customize its variants/classes instead of rebuilding the component.

When adding a component:

1. Check whether shadcn/ui already provides it.
2. Reuse existing components.
3. Keep variants using `class-variance-authority` where appropriate.
4. Keep shared components in the existing components directory.
5. Do not duplicate components with slightly different names.

---

## 3. Spacing Rules

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
p-4
mt-4
gap-4
px-6
```

Use arbitrary values only when they solve a documented technical or visual requirement.

Do not use negative margins to fix a layout that should be solved with proper structure.

---

## 4. Layout

Prefer:

* Flexbox
* CSS Grid
* shadcn/ui layout patterns
* Tailwind responsive utilities

Avoid:

* excessive absolute positioning
* fixed pixel positioning
* negative-margin hacks
* nested containers with inconsistent padding
* duplicated responsive rules

All major page content must align to the same container.

---

## 5. Responsive Design

Mobile-first is mandatory.

Every UI change must be checked at:

* Mobile
* Tablet
* Desktop
* Large desktop

Use the project's standard breakpoints.

Do not introduce custom breakpoints unless absolutely necessary.

Do not design desktop first and attempt to repair mobile afterward.

---

## 6. Component Sizing

Use the standard component sizes defined in `DESIGN.md`.

Do not randomly change:

* button height
* input height
* icon size
* card padding
* border radius
* typography
* modal dimensions

If an existing shadcn component already provides the correct size variant, use that variant.

---

## 7. Typography

Use the project's typography tokens.

Do not create arbitrary font sizes such as:

```tsx
text-[17px]
text-[21px]
text-[29px]
```

unless explicitly required.

Maintain a clear hierarchy:

* Page title
* Section title
* Component title
* Body
* Secondary text
* Caption

Do not use font size alone to create hierarchy. Use spacing, weight and semantic structure.

---

## 8. Colors

Use existing theme tokens.

Prefer:

```tsx
bg-background
bg-card
bg-muted
text-foreground
text-muted-foreground
border-border
text-primary
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

## 9. Borders and Radius

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

## 10. Icons

Use the project's existing icon library, which is Lucide.

Prefer consistent icon sizing:

* Small: 14–16px
* Default: 16–20px
* Large: 20–24px

Do not mix unrelated icon libraries without a reason.

---

## 11. Forms

Use shadcn/ui form patterns.

Forms must have:

* Label
* Input/control
* Validation state
* Error message where applicable
* Consistent spacing

Do not manually position form elements.

Prefer semantic form structure and existing form components.

---

## 12. Accessibility

UI must remain accessible.

Always consider:

* keyboard navigation
* focus states
* labels
* semantic HTML
* accessible names
* disabled states
* loading states
* error states
* sufficient contrast

Never remove focus indicators merely because they are visually inconvenient.

---

## 13. States

Interactive components should account for:

* default
* hover
* focus
* active
* disabled
* loading
* error
* empty

Do not implement only the happy path.

---

## 14. UI Consistency

If two components serve the same purpose, they must look and behave consistently.

Do not create:

* five different button styles for the same action
* different card padding across pages
* different input heights
* inconsistent heading spacing
* inconsistent modal sizes

If inconsistency already exists, prefer the established design system rather than copying the inconsistency.

---

## 15. No UI Overengineering

Do not add UI merely because there is empty space.

Do not add:

* unnecessary cards
* unnecessary badges
* decorative elements
* excessive borders
* unnecessary animations
* redundant buttons
* duplicate information

Every visual element must have a purpose.

---

## 16. Preserve Existing Functionality

UI work must not break:

* business logic
* API calls
* state management
* routing
* forms
* authentication
* wallet functionality
* responsive behavior

Do not rewrite working logic when only the UI needs modification.

---

## 17. Validation

After making code changes, run `npx oxlint --fix`, then run `npx oxfmt`.

After UI implementation:

1. Run the project's lint checks with `npx oxlint --deny-warnings --format=agent`.
2. Run formatting checks with `npx oxfmt --check`.
3. Run TypeScript checks with `npm run typecheck`.
4. Run the project's build with `npm run build`.
5. Inspect the changed page visually.
6. Check responsive behavior.
7. Check console errors.
8. Fix issues before considering the task complete.

Use the project's configured shadcn/ui lint conventions and existing lint configuration.

Never bypass lint rules just to make the implementation pass.

Do not disable a lint rule unless there is a documented reason.

---

## 18. Definition of Done

A UI task is complete only when:

* It follows `DESIGN.md`.
* It uses shadcn/ui where applicable.
* Existing components were reused.
* Spacing follows the design scale.
* Typography follows the design scale.
* Responsive behavior works.
* Accessibility is preserved.
* No unnecessary arbitrary Tailwind values were introduced.
* No unrelated components were changed.
* Lint passes.
* TypeScript passes.
* Build passes.
* The resulting UI is visually consistent with the rest of the application.
