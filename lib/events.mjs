const sensitiveKeys = /^(content|text|prompt|developerInstructions|baseInstructions|arguments|aggregatedOutput|output|delta|diff|history|command|files|path|filePath|threadId|turnId|id)$/i;

export function sanitizeEvent(input) {
  if (!input || typeof input !== "object") return null;
  const method = sanitizeMethod(input.method || input.type);
  const item = input.params?.item || input.item || null;
  const safe = {
    source: ["codex", "agent-browser", "auracall"].includes(input.source) ? input.source : input.source ? "imported" : "codex",
    method,
    emittedAtMs: Number.isFinite(input.emittedAtMs) ? input.emittedAtMs : Date.now(),
    params: {}
  };

  if (input.params?.turn) safe.params.turn = { status: sanitizeStatus(input.params.turn.status) };
  if (Array.isArray(input.params?.plan)) {
    safe.params.plan = input.params.plan.map((step) => ({
      status: sanitizeStatus(step.status) || "pending"
    }));
  }
  if (item) safe.params.item = sanitizeItem(item);
  if (method === "thread/tokenUsage/updated" && input.params?.tokenUsage) {
    const usage = input.params.tokenUsage;
    safe.params.tokenUsage = {
      totalTokens: usage.total?.totalTokens ?? usage.totalTokens ?? null,
      inputTokens: usage.total?.inputTokens ?? usage.inputTokens ?? null,
      outputTokens: usage.total?.outputTokens ?? usage.outputTokens ?? null
    };
  }
  if (method.includes("diff")) safe.params.diffAvailable = true;
  if (input.params?.runtime) safe.params.runtime = sanitizeRuntime(input.params.runtime);
  return safe;
}

function sanitizeRuntime(runtime) {
  const allowed = ["kind", "status", "mode", "runner", "topology"];
  const result = Object.fromEntries(allowed.map((key) => [key, structuralToken(runtime[key], 64)]).filter(([, value]) => value));
  result.counts = Object.fromEntries(Object.entries(runtime.counts || {}).filter(([, value]) => Number.isFinite(value)).slice(0, 12));
  return result;
}

function sanitizeMethod(value) {
  const method = String(value || "unknown");
  return /^[a-z][a-z0-9_-]*(\/[a-z][a-z0-9_-]*){0,5}$/i.test(method) ? method : "unknown";
}

function sanitizeStatus(value) {
  const status = typeof value === "string" ? value : value?.type;
  return structuralToken(status, 32);
}

function structuralToken(value, limit) {
  if (typeof value !== "string") return null;
  const token = value.slice(0, limit);
  return /^[a-z0-9][a-z0-9_.:-]*$/i.test(token) ? token : null;
}

function sanitizeItem(item) {
  const allowedTypes = new Set(["commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "webSearch", "imageView", "reasoning", "plan"]);
  const result = {
    type: allowedTypes.has(item.type) ? item.type : "unknown",
    status: sanitizeStatus(item.status)
  };
  if (item.type === "commandExecution") {
    result.exitCode = Number.isInteger(item.exitCode) ? item.exitCode : null;
    result.durationMs = Number.isFinite(item.durationMs) ? item.durationMs : null;
  }
  if (item.type === "fileChange" && Array.isArray(item.changes)) {
    result.fileCount = Math.min(item.changes.length, 20);
  }
  if (item.type === "mcpToolCall") {
    result.tool = "MCP tool";
  }
  if (item.type === "dynamicToolCall") {
    result.tool = "Dynamic tool";
  }
  if (item.type === "collabAgentToolCall") result.tool = "Collaboration tool";
  if (item.type === "webSearch") result.tool = "web search";
  return result;
}

export function containsSensitivePayload(value) {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeys.test(key) && typeof child === "string" && child.length > 0) return true;
    if (child && typeof child === "object" && containsSensitivePayload(child)) return true;
  }
  return false;
}

export function classifyEvent(event) {
  const method = event?.method || "unknown";
  const item = event?.params?.item;
  if (event?.source === "agent-browser") {
    if (method.includes("health") || event.params?.runtime?.status === "degraded") return { stage: "feedback", algorithm: "Browser health feedback", confidence: "direct" };
    if (method.includes("reconciliation")) return { stage: "verify", algorithm: "State reconciliation", confidence: "direct" };
    if (method.includes("launch") || method.includes("tab")) return { stage: "act", algorithm: "Browser lifecycle control", confidence: "direct" };
    return { stage: "observe", algorithm: "Browser service event", confidence: "direct" };
  }
  if (event?.source === "auracall") {
    if (event.params?.runtime?.status === "degraded") return { stage: "feedback", algorithm: "Orchestration health feedback", confidence: "direct" };
    return { stage: "observe", algorithm: "Durable run orchestration", confidence: "direct" };
  }
  if (method === "turn/started" || method === "turn/completed") return { stage: "orchestrate", algorithm: "Turn lifecycle", confidence: "direct" };
  if (method === "turn/plan/updated" || method === "item/plan/delta") return { stage: "plan", algorithm: "Plan-act-observe loop", confidence: "inferred" };
  if (method.includes("requestApproval") || method.includes("requestUserInput")) return { stage: "gate", algorithm: "Approval gate", confidence: "direct" };
  if (method.includes("diff") || item?.type === "fileChange") return { stage: "change", algorithm: "Incremental change aggregation", confidence: "direct" };
  if (item?.type === "reasoning" || method.includes("reasoning")) return { stage: "reason", algorithm: "Reasoning summary", confidence: "direct" };
  if (item?.type === "commandExecution") {
    if (item.exitCode !== null && item.exitCode !== undefined) return { stage: "verify", algorithm: "Execution feedback", confidence: "direct" };
    return { stage: "act", algorithm: "Tool execution", confidence: "direct" };
  }
  if (["mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "webSearch", "imageView"].includes(item?.type)) return { stage: "act", algorithm: "Tool execution", confidence: "direct" };
  if (method === "thread/tokenUsage/updated") return { stage: "measure", algorithm: "Resource accounting", confidence: "direct" };
  if (method === "error" || method === "warning") return { stage: "feedback", algorithm: "Feedback signal", confidence: "direct" };
  return { stage: "observe", algorithm: "Observable event", confidence: "direct" };
}

export function flattenThread(thread) {
  const events = [];
  for (const turn of thread?.turns || []) {
    events.push({ method: "turn/started", params: { turn: { id: turn.id, status: "inProgress" } } });
    for (const item of turn.items || []) {
      events.push({ method: "item/completed", params: { turnId: turn.id, item } });
    }
    events.push({ method: "turn/completed", params: { turn: { id: turn.id, status: turn.status } } });
  }
  return events.map(sanitizeEvent).filter(Boolean);
}
