import test from "node:test";
import assert from "node:assert/strict";
import { classifyEvent, containsSensitivePayload, flattenThread, sanitizeEvent } from "../lib/events.mjs";
import { sanitizeAgentBrowserEvent, sanitizeAuraCallStatus } from "../lib/runtime-sources.mjs";

test("sanitizer retains structure but strips tool payloads and output", () => {
  const event = sanitizeEvent({
    method: "item/completed",
    params: { item: { id: "a", type: "mcpToolCall", server: "web", tool: "run", arguments: { secret: "value" }, result: { content: "private" } } }
  });
  assert.equal(event.params.item.tool, "web/run");
  assert.equal(containsSensitivePayload(event), false);
  assert.equal("arguments" in event.params.item, false);
});

test("command completion is classified as execution feedback", () => {
  const event = sanitizeEvent({ method: "item/completed", params: { item: { id: "c", type: "commandExecution", command: "npm test", exitCode: 0 } } });
  assert.deepEqual(classifyEvent(event), { stage: "verify", algorithm: "Execution feedback", confidence: "direct" });
});

test("plan updates are explicitly marked as inference", () => {
  assert.equal(classifyEvent({ method: "turn/plan/updated", params: {} }).confidence, "inferred");
});

test("historic threads flatten into lifecycle and item events", () => {
  const events = flattenThread({ turns: [{ id: "t", status: "completed", items: [{ id: "i", type: "fileChange", changes: [{ path: "a.js" }] }] }] });
  assert.deepEqual(events.map((event) => event.method), ["turn/started", "item/completed", "turn/completed"]);
  assert.deepEqual(events[1].params.item.files, ["a.js"]);
});

test("agent-browser adapter keeps counts and drops identifiers and messages", () => {
  const event = sanitizeAgentBrowserEvent({ id: "event-1", kind: "reconciliation", message: "private path", profileId: "secret-profile", timestamp: "2026-08-24T20:00:00Z", details: { browserCount: 3, changedTabs: 1, url: "https://private.example" } });
  assert.equal(event.source, "agent-browser");
  assert.deepEqual(event.params.runtime.counts, { browserCount: 3, changedTabs: 1 });
  assert.equal(JSON.stringify(event).includes("private"), false);
});

test("AuraCall adapter projects health without process or route details", () => {
  const event = sanitizeAuraCallStatus({ ok: true, mode: "development", api: { process: { cwd: "/secret" } }, auth: { key: "secret" }, runner: { status: "ready" }, localClaimSummary: { running: 2 } });
  assert.equal(event.source, "auracall");
  assert.equal(event.params.runtime.runner, "ready");
  assert.equal(JSON.stringify(event).includes("secret"), false);
});
