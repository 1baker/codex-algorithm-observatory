import test from "node:test";
import assert from "node:assert/strict";
import { classifyEvent, containsSensitivePayload, flattenThread, sanitizeEvent } from "../lib/events.mjs";

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
