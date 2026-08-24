const sensitiveKeys = /^(content|text|prompt|developerInstructions|baseInstructions|arguments|aggregatedOutput|output|delta|diff|history)$/i;

export function sanitizeEvent(input) {
  if (!input || typeof input !== "object") return null;
  const method = String(input.method || input.type || "unknown");
  const item = input.params?.item || input.item || null;
  const safe = {
    method,
    emittedAtMs: Number.isFinite(input.emittedAtMs) ? input.emittedAtMs : Date.now(),
    params: {}
  };

  if (input.params?.turnId) safe.params.turnId = input.params.turnId;
  if (input.params?.threadId) safe.params.threadId = input.params.threadId;
  if (input.params?.turn?.id) safe.params.turn = { id: input.params.turn.id, status: input.params.turn.status };
  if (Array.isArray(input.params?.plan)) {
    safe.params.plan = input.params.plan.map((step) => ({
      step: String(step.step || "Step").slice(0, 160),
      status: step.status || "pending"
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
  return safe;
}

function sanitizeItem(item) {
  const result = {
    id: String(item.id || "item"),
    type: String(item.type || "unknown"),
    status: item.status || null
  };
  if (item.type === "commandExecution") {
    result.command = String(item.command || "command").slice(0, 180);
    result.exitCode = Number.isInteger(item.exitCode) ? item.exitCode : null;
    result.durationMs = Number.isFinite(item.durationMs) ? item.durationMs : null;
  }
  if (item.type === "fileChange" && Array.isArray(item.changes)) {
    result.files = item.changes.map((change) => change.path || change.filePath || "file").slice(0, 20);
  }
  if (item.type === "mcpToolCall") {
    result.tool = `${item.server || "mcp"}/${item.tool || "tool"}`;
  }
  if (item.type === "dynamicToolCall") {
    result.tool = [item.namespace, item.tool].filter(Boolean).join("/") || "tool";
  }
  if (item.type === "collabAgentToolCall") result.tool = item.tool || "collaboration";
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
