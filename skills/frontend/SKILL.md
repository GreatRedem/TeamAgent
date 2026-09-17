---
name: frontend
description: "Use when implementing or reviewing the NuraAI React/Vite frontend, wallet flows, team dashboards, RTL support, i18n, or API integration."
---

# NuraAI Frontend

Follow `docs/19-tech-stack.md` for the stack, and `docs/24-ui-standards.md` with `docs/25-ui-information.md` for anything visual — the design system, the quarantine primitive, RTL, and what each screen must show. `docs/25-ui-information.md` is a security document as much as a design one: the approval review screen is the last structural gate before a consequential action. `add-screen` covers that procedure.

The app lives in `apps/web/src/`, as `app/`, `components/`, `features/`, `i18n/`, `lib/`, and `styles/`. It builds to static assets that nginx serves; the API does not serve it.

## Rules

- Use React + Vite and keep API access behind typed client helpers in `lib/`; feature components do not call `fetch` directly.
- Externalize user-facing strings through `react-i18next` from the first implementation.
- Set `dir` from the active locale and use logical layout properties so English and Persian both work.
- Treat wallet connection and authentication states as explicit loading, success, rejection, and error states.
- Do not put secrets or access tokens in local source files or logs.
- Keep pages focused on real workflows: teams, agents, runs, approvals, tools, and audit history.
- Add accessible labels, keyboard interaction, responsive states, and useful empty/error states.
- Keep presentation separate from API and domain policy logic.
