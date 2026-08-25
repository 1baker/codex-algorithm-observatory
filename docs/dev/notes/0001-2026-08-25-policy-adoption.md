# Policy Adoption | 2026-08-25

## Provenance

- Source: `https://github.com/CochranResearchGroup/agent-policies.git`
- Installed bundle: `repo-policy-selector` `v0.1.20`
- Source commit: `6a67ab044e1110d18f5f12d8b5b9a9a6fc3a6265`
- Selected profile: `standalone-library`

## Decision

Adopt the complete recommended standalone-library profile. The installed
modules cover policy management and upgrades, adoption feedback, graph-backed
memory, planning, optional CodeGraph use, testing, Git/worktree discipline,
branch integration, commit and push cadence, versioning, closeout, and durable
notes and memories.

No existing repository policy surface needed migration. Repo-local overrides
in `AGENTS.md` define the Observatory privacy boundary, per-client event
isolation, WSL service verification, concrete test budgets, reviewed-only
Graphiti ingestion, and the current absence of a CodeGraph index.

The selector's post-adoption scan recommends the heavier
`repo-product-engineering` profile because the newly installed policy text
itself contains roadmap, goal, and multi-agent vocabulary. Those modules are
deferred: `goal-execution-governance`, `parallel-plan-design`,
`roadmap-runbook-governance`, `architecture-guardrails`,
`documentation-change-control`, `active-lane-coordination`,
`multi-agent-reconciliation`, `subagent-workflow-optimization`, and
`validation-and-handoff`. The pre-adoption repository signals do not justify
that coordination overhead. Revisit this decision if the actual repository
gains long-running goals, multiple active lanes, or roadmap/runbook authority.

## Adoption Evidence

- Installation: the pinned selector and its policy library are under
  `.codex/skills/repo-policy-selector/`.
- Wiring: `AGENTS.md` names every adopted policy under `docs/dev/policies/`.
- Deterministic selection: `standalone-library`, full-profile, clean-adoption,
  with no validation problems.
- Enacted behavior: not yet evidenced beyond installation and adoption audits;
  the next substantive repository change should record any policy friction.

## Feedback

- Worked cleanly: the local released tag provided deterministic provenance and
  produced a complete clean-adoption plan.
- Friction: a fresh public HTTPS clone stalled, so installation used the exact
  `v0.1.20` tag from the already fetched personal-routed Cochran checkout. The
  durable install record points to the authoritative Git URL and tag.
- Friction: selector policy prose influences post-adoption purpose detection;
  profile fit should be assessed from pre-adoption repo signals and reviewed
  again only when the repository operating model changes.
- Keep repo-local: privacy invariants, runtime client isolation, WSL service
  commands, Graphiti review gates, and testing budgets.
- Upstream candidate: no reusable selector change is justified yet.
