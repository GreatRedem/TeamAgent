# Agent Rules

## UI

- Use shadcn/ui components whenever a suitable component exists.
- Do not create custom UI primitives when shadcn/ui already provides them.
- Use Tailwind CSS for styling.
- Use Lucide icons.
- Keep components accessible and responsive.
- Follow the existing design system and tokens.
- Do not introduce gradients unless explicitly requested.
- Do not add unnecessary dependencies.

## Code Quality

- TypeScript strict mode is required.
- Prefer small, composable React components.
- Avoid duplicated logic.
- Do not use `any` unless absolutely necessary.
- Do not disable lint rules to hide problems.
- Never use `eslint-disable`, `oxlint-disable`, or formatter ignores unless there is a documented reason.

## shadcn/ui

When adding a component:

1. Check whether shadcn/ui already provides it.
2. Reuse existing components.
3. Keep variants using `class-variance-authority` where appropriate.
4. Keep shared components in the existing components directory.
5. Do not duplicate components with slightly different names.

## Agent Behavior

- First inspect the existing project structure.
- Read existing components before creating new ones.
- Reuse existing utilities and patterns.
- Do not rewrite unrelated code.
- Make the smallest correct change.
- Verify the implementation after changes.

## Linting and formatting

- After making code changes, run `npx oxlint --fix`, then run `npx oxfmt`.
- Before finishing, run `npx oxlint --deny-warnings --format=agent`.
