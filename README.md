# Algorithm Observatory

Algorithm Observatory is a local teaching interface for understanding the control flow around coding agents. It visualizes observable Codex events, explains source-backed algorithms in `agent-browser`, and compares those traces with well-known language-agent patterns.

It deliberately separates three kinds of claims:

- **Direct evidence** comes from the Codex App Server event contract or inspected source code.
- **Behavioral inference** describes what an observable sequence resembles without claiming that it reveals the model's internal implementation.
- **Reference pattern** is a research concept used for teaching and comparison only.

## Run it

Requirements: Node.js 20+ and a working `codex` command.

```bash
cd /home/bak3r/projects/codex-algorithm-observatory
npm test
npm run build
npm start
```

Open <http://127.0.0.1:4173>. The server starts a local Codex App Server and lists local threads. If it can resume the selected thread, it loads structural history and subscribes to future event notifications. If another Codex client already owns that thread, the Observatory falls back to read-only polling every two seconds and labels the mode as near-live. It also includes a deterministic teaching demo and JSON/JSONL event import.

The live WSL view also polls two read-only local contracts every three seconds:

- `agent-browser service events --json` for bounded browser lifecycle, health, and reconciliation signals
- AuraCall `GET http://127.0.0.1:18095/status` for compact service and runner health

Both adapters use allowlists. They discard URLs, profile/session/browser identifiers, messages, process details, credentials, and provider payloads before publication.

Set `OBSERVATORY_PORT` to change the port:

```bash
OBSERVATORY_PORT=4300 npm start
```

## Keep it available in WSL

Install the included user service once:

```bash
mkdir -p ~/.config/systemd/user
cp systemd/codex-algorithm-observatory.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now codex-algorithm-observatory.service
```

Then open <http://127.0.0.1:4173> whenever WSL is running. The observer starts independently of a Codex chat and reconnects to agent-browser and AuraCall through their read-only local contracts.

## Privacy boundary

The browser receives a strict structural projection of events. The server drops thread previews, prompt/message content, raw or summarized reasoning text, tool arguments, command output, tool results, and diff contents. It retains explicit user-assigned thread names, thread IDs, workspace paths, event names, lifecycle status, redacted command labels, filenames, exit codes, durations, plan labels, and aggregate usage counts.

This interface does not reveal private chain-of-thought, model weights, token-level search procedures, or other proprietary internals. Educational or noncommercial intent does not change what information is technically exposed or licensed. Reasoning **summary events** may exist in the protocol, but their text is intentionally removed here.

Use **Prepare learning note** to create a structural aggregate under `learning-candidates/`. Candidates are marked `review-required`; raw events are never sent to Graphiti. After human review, stage the note through Codex Research's `stage_external_source` workflow so provenance, digest gates, retrieval evaluation, and readback remain authoritative.

## What the live view can teach

The current Codex App Server contract exposes turn and item lifecycle events, plan updates, commands, file changes, tool calls, collaboration, web search, approvals, diffs, token usage, and readable reasoning-summary events where supported. Those events support direct visualization of lifecycle state, approval gates, incremental changes, and execution feedback. A repeated plan → action → output → change → test sequence can be described as a behavioral control-loop inference, not proof of a particular hidden model algorithm.

Primary contract: [OpenAI Codex App Server](https://learn.chatgpt.com/docs/app-server).

## agent-browser source study

The catalog was inspected against clean source commit `7dcbd647911440d8ab3248deb44787786b44d23b` (2026-06-13). Confirmed mechanisms include:

- Chrome accessibility-tree construction, semantic role filtering, and compact element references.
- Cached backend-node fast paths with role/name-based stale-node recovery.
- Semantic DOM activation, coordinate fallbacks, and verify-then-retry control interaction.
- Myers line diff for accessibility snapshots.
- Thresholded Euclidean RGB distance for screenshot comparison.
- Capped exponential backoff with retry budgets.
- Browser/control-plane reconciliation that merges only fields owned by the reconciler.

Each card links to the exact source revision and relevant line range.

## Research comparisons

- [ReAct](https://arxiv.org/abs/2210.03629): interleaved reasoning, acting, and observation.
- [Plan-and-Solve](https://arxiv.org/abs/2305.04091): task decomposition followed by subtask execution.
- [Tree of Thoughts](https://arxiv.org/abs/2305.10601): deliberate branch generation, evaluation, and search.
- [Reflexion](https://arxiv.org/abs/2303.11366): language feedback and episodic reflection across attempts.

These papers are comparison tools. The Observatory never labels them as Codex's internal algorithm without direct implementation evidence.

## Event import shape

Import either a JSON array, `{ "events": [...] }`, or one JSON event per line. Codex App Server notifications work directly:

```json
{
  "method": "item/completed",
  "params": {
    "item": {
      "id": "command-1",
      "type": "commandExecution",
      "command": "npm test",
      "status": "completed",
      "exitCode": 0,
      "durationMs": 842
    }
  }
}
```

Imported events pass through the same server-side sanitizer before reaching the interface.
