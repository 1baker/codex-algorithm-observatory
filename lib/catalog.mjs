export const confidenceLevels = {
  direct: {
    label: "Direct evidence",
    description: "The event contract or inspected source explicitly implements this mechanism."
  },
  inferred: {
    label: "Behavioral inference",
    description: "The event sequence resembles this pattern, but does not prove internal implementation."
  },
  reference: {
    label: "Reference pattern",
    description: "A teaching comparison from primary research, not a claim about Codex internals."
  }
};

export const commonPatterns = [
  {
    id: "react",
    name: "ReAct",
    family: "Agent loop",
    confidence: "reference",
    summary: "Interleave reasoning summaries, actions, and observations so new evidence can update the next action.",
    steps: ["Reason", "Act", "Observe", "Update"],
    source: "https://arxiv.org/abs/2210.03629",
    sourceLabel: "Yao et al., ReAct"
  },
  {
    id: "plan-solve",
    name: "Plan-and-Solve",
    family: "Task decomposition",
    confidence: "reference",
    summary: "Divide a problem into explicit subtasks, then execute those subtasks in sequence.",
    steps: ["Decompose", "Order", "Execute", "Check"],
    source: "https://arxiv.org/abs/2305.04091",
    sourceLabel: "Wang et al., Plan-and-Solve"
  },
  {
    id: "tree-thoughts",
    name: "Tree of Thoughts",
    family: "Search",
    confidence: "reference",
    summary: "Explore and evaluate multiple candidate reasoning branches with lookahead or backtracking.",
    steps: ["Generate", "Evaluate", "Branch", "Select"],
    source: "https://arxiv.org/abs/2305.10601",
    sourceLabel: "Yao et al., Tree of Thoughts"
  },
  {
    id: "reflexion",
    name: "Reflexion",
    family: "Feedback and memory",
    confidence: "reference",
    summary: "Use task feedback to form verbal reflections that improve a later attempt without changing model weights.",
    steps: ["Attempt", "Evaluate", "Reflect", "Retry"],
    source: "https://arxiv.org/abs/2303.11366",
    sourceLabel: "Shinn et al., Reflexion"
  }
];

export const agentBrowserAlgorithms = [
  {
    id: "ax-tree",
    name: "Accessibility-tree traversal",
    family: "Perception",
    confidence: "direct",
    summary: "Builds a semantic tree from Chrome's accessibility nodes, chooses useful roles, and assigns compact element references.",
    steps: ["Fetch AX tree", "Build tree", "Filter roles", "Assign refs"],
    source: "https://github.com/CochranResearchGroup/agent-browser/blob/7dcbd647911440d8ab3248deb44787786b44d23b/cli/src/native/snapshot.rs#L216-L405",
    sourceLabel: "agent-browser snapshot.rs"
  },
  {
    id: "stale-recovery",
    name: "Fast path with stale-node recovery",
    family: "Resilience",
    confidence: "direct",
    summary: "Uses a cached backend node when connected; otherwise re-queries the same accessibility tree by role, name, and occurrence.",
    steps: ["Try cached node", "Check connected", "Re-query AX tree", "Resolve fresh node"],
    source: "https://github.com/CochranResearchGroup/agent-browser/blob/7dcbd647911440d8ab3248deb44787786b44d23b/cli/src/native/element.rs#L149-L218",
    sourceLabel: "agent-browser element.rs"
  },
  {
    id: "action-fallback",
    name: "Action fallback and verification",
    family: "Interaction",
    confidence: "direct",
    summary: "Chooses semantic DOM activation for native controls, falls back to coordinates, then verifies checkbox state and retries through JavaScript if needed.",
    steps: ["Resolve target", "Semantic click", "Coordinate fallback", "Verify and retry"],
    source: "https://github.com/CochranResearchGroup/agent-browser/blob/7dcbd647911440d8ab3248deb44787786b44d23b/cli/src/native/interaction.rs#L9-L79",
    sourceLabel: "agent-browser interaction.rs"
  },
  {
    id: "myers-diff",
    name: "Myers line diff",
    family: "Change detection",
    confidence: "direct",
    summary: "Computes additions, removals, unchanged lines, and a unified accessibility-snapshot diff using the Myers algorithm.",
    steps: ["Split lines", "Find edit path", "Tag changes", "Render unified diff"],
    source: "https://github.com/CochranResearchGroup/agent-browser/blob/7dcbd647911440d8ab3248deb44787786b44d23b/cli/src/native/diff.rs#L91-L140",
    sourceLabel: "agent-browser diff.rs"
  },
  {
    id: "pixel-diff",
    name: "Thresholded pixel distance",
    family: "Visual comparison",
    confidence: "direct",
    summary: "Compares RGB Euclidean distance per pixel against a threshold and renders mismatches in red.",
    steps: ["Decode", "Align dimensions", "Measure RGB distance", "Score mismatch"],
    source: "https://github.com/CochranResearchGroup/agent-browser/blob/7dcbd647911440d8ab3248deb44787786b44d23b/cli/src/native/diff.rs#L20-L88",
    sourceLabel: "agent-browser diff.rs"
  },
  {
    id: "backoff",
    name: "Capped exponential backoff",
    family: "Recovery",
    confidence: "direct",
    summary: "Doubles the retry delay by attempt, caps it at a configured maximum, and enforces a retry budget.",
    steps: ["Count attempts", "Double delay", "Cap delay", "Enforce budget"],
    source: "https://github.com/CochranResearchGroup/agent-browser/blob/7dcbd647911440d8ab3248deb44787786b44d23b/cli/src/native/service_health.rs#L154-L228",
    sourceLabel: "agent-browser service_health.rs"
  },
  {
    id: "reconcile",
    name: "Ownership-aware reconciliation",
    family: "Control plane",
    confidence: "direct",
    summary: "Observes live browser state, repairs duplicates and leases, records transitions, then merges only reconciliation-owned fields to preserve newer mutations.",
    steps: ["Observe", "Repair", "Record", "Merge owned fields"],
    source: "https://github.com/CochranResearchGroup/agent-browser/blob/7dcbd647911440d8ab3248deb44787786b44d23b/cli/src/native/service_health.rs#L359-L405",
    sourceLabel: "agent-browser service_health.rs"
  }
];

export const codexAlgorithms = [
  {
    id: "turn-state",
    name: "Turn lifecycle state machine",
    family: "Orchestration",
    confidence: "direct",
    summary: "Observable turn and item events move through started, updated, completed, interrupted, or failed states.",
    steps: ["Turn starts", "Items run", "State updates", "Turn completes"],
    source: "https://learn.chatgpt.com/docs/app-server",
    sourceLabel: "OpenAI Codex App Server"
  },
  {
    id: "plan-loop",
    name: "Plan-act-observe loop",
    family: "Agent loop",
    confidence: "inferred",
    summary: "Plan updates followed by tools, outputs, diffs, and validation resemble an iterative control loop. Events show the behavior, not private model internals.",
    steps: ["Plan", "Act", "Observe", "Revise"],
    source: "https://learn.chatgpt.com/docs/app-server",
    sourceLabel: "OpenAI Codex App Server events"
  },
  {
    id: "approval-gate",
    name: "Approval gate",
    family: "Safety control",
    confidence: "direct",
    summary: "Command, file-change, permission, and tool requests can pause at an explicit approval boundary before execution.",
    steps: ["Propose", "Request", "Review", "Allow or deny"],
    source: "https://learn.chatgpt.com/docs/app-server",
    sourceLabel: "OpenAI Codex App Server"
  },
  {
    id: "incremental-diff",
    name: "Incremental change aggregation",
    family: "Change tracking",
    confidence: "direct",
    summary: "File-change deltas and turn-level diff updates expose code changes as they accumulate.",
    steps: ["Patch starts", "Delta arrives", "Diff updates", "Patch settles"],
    source: "https://learn.chatgpt.com/docs/app-server",
    sourceLabel: "OpenAI Codex App Server"
  }
];

export const demoEvents = [
  { method: "turn/started", params: { turn: { id: "demo-turn", status: "inProgress" } }, emittedAtMs: 0 },
  { method: "turn/plan/updated", params: { turnId: "demo-turn", plan: [{ step: "Inspect repository", status: "completed" }, { step: "Implement change", status: "inProgress" }, { step: "Run tests", status: "pending" }] }, emittedAtMs: 850 },
  { method: "item/started", params: { item: { id: "cmd-1", type: "commandExecution", command: "rg --files", status: "inProgress" } }, emittedAtMs: 1550 },
  { method: "item/completed", params: { item: { id: "cmd-1", type: "commandExecution", command: "rg --files", status: "completed", exitCode: 0, durationMs: 180 } }, emittedAtMs: 2150 },
  { method: "item/started", params: { item: { id: "patch-1", type: "fileChange", changes: [{ path: "src/feature.ts" }], status: "inProgress" } }, emittedAtMs: 2700 },
  { method: "turn/diff/updated", params: { turnId: "demo-turn", diff: "+ export function feature() {}" }, emittedAtMs: 3450 },
  { method: "item/completed", params: { item: { id: "patch-1", type: "fileChange", changes: [{ path: "src/feature.ts" }], status: "completed" } }, emittedAtMs: 4100 },
  { method: "item/started", params: { item: { id: "cmd-2", type: "commandExecution", command: "npm test", status: "inProgress" } }, emittedAtMs: 4550 },
  { method: "item/completed", params: { item: { id: "cmd-2", type: "commandExecution", command: "npm test", status: "completed", exitCode: 0, durationMs: 730 } }, emittedAtMs: 5350 },
  { method: "turn/completed", params: { turn: { id: "demo-turn", status: "completed" } }, emittedAtMs: 5900 }
];
