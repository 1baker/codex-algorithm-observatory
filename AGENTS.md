# Codex Algorithm Observatory

## Repo Context

- This repository is a local-first teaching observatory for structural Codex,
  agent-browser, and AuraCall runtime signals.
- The browser surface is educational and privacy-preserving. It must never
  expose prompts, reasoning text, commands, absolute paths, URLs, raw thread or
  turn identifiers, tool payloads, outputs, or diff content.
- Use bounded plans under `docs/dev/plans/` for substantive work. This
  lightweight repository does not require a standing `ROADMAP.md` or
  `RUNBOOK.md`.
- `public/`, `lib/`, `server.mjs`, and `systemd/` are source surfaces. `dist/`
  is the generated static teaching preview.

## Repo-Specific Guidance

- Preserve per-browser event isolation. A client may receive shared sanitized
  runtime health events, but Codex history and live events must remain scoped
  to the client that explicitly selected the thread.
- Keep Graphiti learning candidates structural-only and `review-required`.
  Never ingest a candidate automatically; reviewed repository artifacts remain
  the source of truth. Use `codex-algorithm-observatory` as the intended memory
  group if a reviewed Graphiti ingestion workflow is established.
- CodeGraph is not established for this repository. Use direct source reads and
  focused text search unless a reviewed index is explicitly configured; do not
  initialize an index as an incidental change.
- Install dependencies only through the project environment. The current
  project has no third-party runtime dependencies.
- Development commands:
  - `npm test` for focused tests; target under 2 seconds
  - `npm test && npm run build` for blocking presubmit; budget 30 seconds and
    one local Node process at a time
  - `npm start` for an ad hoc local server
  - restart `codex-algorithm-observatory.service` through user systemd after
    server or browser-source changes, then verify `http://127.0.0.1:4173`
- For runtime-boundary or privacy changes, presubmit also includes a two-client
  live smoke proving client isolation and absence of forbidden payload fields;
  budget 2 minutes. Unknown impact falls back to the full presubmit plus this
  smoke.
- Tests do not retry silently. A pass after retry is flaky, and a blocking flake
  must be fixed or explicitly quarantined with an owner and expiry in the same
  slice.
- Small, validated changes may land directly on `main`; risky or parallel work
  uses short-lived branches. Never rewrite a published branch that another
  lane may depend on.
- Treat package versions and Git tags as explicit releases. Do not cut a tag or
  claim a release without passing presubmit and recording user/operator impact.

## Policy Loading Contract

- `AGENTS.md` is a routing surface, not a one-time pointer.
- Re-read the relevant policy files under `docs/dev/policies/` at the start of any non-trivial turn.
- Re-read the relevant policy files when task scope changes mid-session.
- When behavior is ambiguous, prefer re-reading policy over improvising from stale assumptions.

## Policy Re-read Triggers

- re-read planning-related policy before opening, revising, or closing a substantive plan
- re-read documentation-related policy before changing docs, contracts, or canonical authorities
- re-read validation and closeout policy before claiming work complete

## Policy Entry

This repo keeps its durable repo-local policy under `docs/dev/policies/`.

Read and follow:
- `docs/dev/policies/0001-policy-management.md`
- `docs/dev/policies/0002-policy-upgrade-management.md`
- `docs/dev/policies/0003-policy-adoption-feedback-loop.md`
- `docs/dev/policies/0004-graph-backed-memory-usage.md`
- `docs/dev/policies/0005-planning-discipline.md`
- `docs/dev/policies/0006-codegraph-usage.md`
- `docs/dev/policies/0007-code-testing-discipline.md`
- `docs/dev/policies/0008-git-worktree-hygiene.md`
- `docs/dev/policies/0009-commit-history-discipline.md`
- `docs/dev/policies/0010-branch-and-integration-strategy.md`
- `docs/dev/policies/0011-commit-and-push-cadence.md`
- `docs/dev/policies/0012-versioning-and-release.md`
- `docs/dev/policies/0013-turn-closeout.md`
- `docs/dev/policies/0014-notes-and-memories.md`

## Scope

- `AGENTS.md` includes repo-local guidance plus the policy entry section.
- The durable policy body lives under `docs/dev/policies/`.
- Keep repo-specific commands, environment details, and operational caveats in this file or adjacent local docs.
