# Vendored skills

These are copies, checked in so the project carries its own design tooling and
anyone cloning the repo gets it without installing plugins.

| Skill | Source | Version |
|---|---|---|
| `design-critique` | `design` plugin | synced copy, 2026-09-22 |
| `frontend-design` | `frontend-design@claude-plugins-official` | `3deb821cb71c` |
| `modern-web-guidance` | `modern-web-guidance@claude-plugins-official` | `0.0.189` |
| `superdesign` | `superdesign@claude-plugins-official` | `0.6.0` |
| `run-nuraai` | written for this repo, not vendored | - |

The same three plugins are switched off in `.claude/settings.json`, so each
skill exists once rather than twice.

## Keeping them current

Copy the newer `skills/<name>` directory over the one here, then update the
version in the table above. The copies are self-contained: none of them reads
anything from its plugin root, which is what makes vendoring safe.

`modern-web-guidance` fetches its guides over the network with `npx`. On Windows
call `npx.cmd`; bare `npx` fails on the space in `C:\Program Files`.

## Project rules come first

These skills are generic. Where one suggests a value, a font or a component that
`DESIGN.md` already settles, `DESIGN.md` wins.
