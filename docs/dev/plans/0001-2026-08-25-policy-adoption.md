# Plan | Install Cochran Agent Policies

Status: CLOSED

## Scope

Install a pinned Cochran `agent-policies` selector bundle, select a proportional
profile, wire its modules into repository-local policy, add Observatory-specific
overrides, and verify the adoption contract.

## Non-goals

- Introduce a standing roadmap or runbook for this lightweight repository.
- Enable autonomous goal execution or multi-agent coordination policy without
  corresponding repository workflow signals.
- Initialize CodeGraph or ingest Graphiti learning candidates.

## Current State

The `v0.1.20` bundle and standalone-library policy set are installed and wired.
The repo-local privacy, testing, WSL service, Graphiti, and CodeGraph boundaries
are documented in `AGENTS.md`.

## Acceptance Criteria

- The installed release manifest identifies `v0.1.20` and its source commit.
- Every adopted module exists under `docs/dev/policies/` and is wired from
  `AGENTS.md`.
- Full and active planning audits pass.
- The selector test suite and Observatory test/build checks pass.
- Pre-existing QA evidence and learning candidates remain untouched.

## Definition of Done

All acceptance criteria are evidenced in the adoption closeout and the policy
changes are captured in one reviewable local commit.
