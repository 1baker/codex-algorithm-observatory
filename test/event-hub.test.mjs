import test from "node:test";
import assert from "node:assert/strict";
import { EventHub } from "../lib/event-hub.mjs";

const runtimeEvent = { source: "auracall", method: "runtime/status", emittedAtMs: 1, params: {} };
const privateEvent = { source: "codex", method: "turn/started", emittedAtMs: 2, params: {} };

test("client history is isolated while runtime evidence is shared", () => {
  const hub = new EventHub();
  hub.publishRuntime(runtimeEvent);
  hub.publishClient("client-a", privateEvent);
  assert.deepEqual(hub.replay("client-a"), [runtimeEvent, privateEvent]);
  assert.deepEqual(hub.replay("client-b"), [runtimeEvent]);
});

test("client streams receive only their own events plus shared runtime evidence", () => {
  const hub = new EventHub();
  const writes = [];
  hub.connect("client-b", { write: (value) => writes.push(value) });
  hub.publishClient("client-a", privateEvent);
  assert.equal(writes.length, 0);
  hub.publishRuntime(runtimeEvent);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].includes("runtime/status"), true);
});

test("closing the hub ends every active stream", () => {
  const hub = new EventHub();
  let closed = 0;
  hub.connect("client-a", { end: () => closed += 1 });
  hub.connect("client-b", { end: () => closed += 1 });
  hub.closeConnections();
  assert.equal(closed, 2);
  assert.equal(hub.channel("client-a").responses.size, 0);
});
