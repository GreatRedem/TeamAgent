---
name: frontend
description: "Use when implementing or reviewing the NuraAI React/Vite frontend, wallet flows, team dashboards, RTL support, i18n, or API integration."
---

# NuraAI Frontend

Follow `docs/19-tech-stack.md` and keep the interface consistent with the operational team-workspace product.

## Rules

- Use React + Vite and keep API access behind typed client helpers.
- Externalize user-facing strings through `react-i18next` from the first implementation.
- Set `dir` from the active locale and use logical layout properties so English and Persian both work.
- Treat wallet connection and authentication states as explicit loading, success, rejection, and error states.
- Do not put secrets or access tokens in local source files or logs.
- Keep pages focused on real workflows: teams, agents, runs, approvals, tools, and audit history.
- Add accessible labels, keyboard interaction, responsive states, and useful empty/error states.
- Keep presentation separate from API and domain policy logic.
