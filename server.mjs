import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { demoEvents } from "./lib/catalog.mjs";
import { classifyEvent, flattenThread, sanitizeEvent } from "./lib/events.mjs";
import { EventHub } from "./lib/event-hub.mjs";
import { readAgentBrowserEvents, readAuraCallStatus } from "./lib/runtime-sources.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.OBSERVATORY_PORT || 4173);
const eventHub = new EventHub(500);
const bridges = new Map();

class RuntimeSources {
  constructor() {
    this.timer = null;
    this.seen = new Set();
    this.digests = new Map();
    this.statuses = { "agent-browser": { state: "checking" }, auracall: { state: "checking" } };
  }

  start() {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), 3000);
  }

  async poll() {
    await Promise.allSettled([this.pollAgentBrowser(), this.pollAuraCall()]);
  }

  async pollAgentBrowser() {
    try {
      const events = await readAgentBrowserEvents();
      for (const event of events) {
        if (this.seen.has(event.sourceEventId)) continue;
        this.seen.add(event.sourceEventId);
        const { sourceEventId, ...browserEvent } = event;
        eventHub.publishRuntime(browserEvent);
      }
      if (this.seen.size > 1000) this.seen = new Set([...this.seen].slice(-500));
      this.statuses["agent-browser"] = { state: "observing", eventCount: events.length };
    } catch (error) {
      this.statuses["agent-browser"] = { state: "unavailable", error: error.message.slice(0, 160) };
    }
  }

  async pollAuraCall() {
    try {
      const event = await readAuraCallStatus(process.env.AURACALL_BASE_URL);
      const digest = JSON.stringify(event.params);
      if (this.digests.get("auracall") !== digest) {
        this.digests.set("auracall", digest);
        eventHub.publishRuntime(event);
      }
      this.statuses.auracall = { state: "observing" };
    } catch (error) {
      this.statuses.auracall = { state: "unavailable", error: error.message.slice(0, 160) };
    }
  }
}

class CodexBridge {
  constructor(publishEvent) {
    this.publishEvent = publishEvent;
    this.process = null;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.error = null;
    this.observedThreadId = null;
    this.observationMode = null;
    this.pollTimer = null;
    this.publishedKeys = new Set();
  }

  async start() {
    if (this.process) return;
    this.process = spawn("codex", ["app-server", "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stdout.on("data", (chunk) => this.consume(chunk));
    this.process.stderr.on("data", (chunk) => {
      const line = String(chunk).trim();
      if (line) this.error = line.slice(-500);
    });
    this.process.on("exit", (code) => {
      this.ready = false;
      this.process = null;
      this.error = `Codex App Server exited with code ${code}`;
      for (const { reject } of this.pending.values()) reject(new Error(this.error));
      this.pending.clear();
    });

    await this.request("initialize", {
      clientInfo: { name: "algorithm-observatory", title: "Algorithm Observatory", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false }
    });
    this.notify("initialized");
    this.ready = true;
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (message.id !== undefined && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message || "App Server request failed"));
          else pending.resolve(message.result);
        } else if (message.method && this.observedThreadId) {
          this.publishEvent(sanitizeEvent(message));
        }
      } catch (error) {
        this.error = `Could not parse App Server output: ${error.message}`;
      }
    }
  }

  request(method, params = {}) {
    if (!this.process) return Promise.reject(new Error("Codex App Server is not running"));
    const id = this.nextId++;
    const payload = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.process.stdin.write(payload);
    });
  }

  notify(method, params) {
    this.process?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) })}\n`);
  }

  async listThreads() {
    await this.start();
    return this.request("thread/list", { limit: 40, sortKey: "updated_at", sortDirection: "desc" });
  }

  async observe(threadId) {
    await this.start();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.publishedKeys.clear();
    this.observedThreadId = threadId;
    try {
      const result = await this.request("thread/resume", { threadId, excludeTurns: false });
      this.observationMode = "subscribed";
      this.error = null;
      const eventCount = this.publishThreadHistory(result.thread);
      return { eventCount, mode: this.observationMode };
    } catch (error) {
      if (!String(error.message).includes("active writer")) throw error;
      const result = await this.request("thread/read", { threadId, includeTurns: true });
      this.observationMode = "readOnlyPolling";
      this.error = null;
      const eventCount = this.publishThreadHistory(result.thread);
      this.pollTimer = setInterval(() => this.pollObservedThread(), 2000);
      return { eventCount, mode: this.observationMode };
    }
  }

  publishThreadHistory(thread) {
    let count = 0;
    for (const [index, event] of flattenThread(thread).entries()) {
      const key = eventKey(event, index);
      if (this.publishedKeys.has(key)) continue;
      this.publishedKeys.add(key);
      this.publishEvent(event);
      count += 1;
    }
    return count;
  }

  async pollObservedThread() {
    if (!this.observedThreadId || this.observationMode !== "readOnlyPolling") return;
    try {
      const result = await this.request("thread/read", { threadId: this.observedThreadId, includeTurns: true });
      this.publishThreadHistory(result.thread);
    } catch (error) {
      this.error = `Read-only observation failed: ${error.message}`;
    }
  }

  status() {
    return { ready: this.ready, error: this.error ? "Codex App Server unavailable" : null, observationMode: this.observationMode };
  }
}

const runtimeSources = new RuntimeSources();
const threadLister = new CodexBridge(() => {});
runtimeSources.start();

function getBridge(clientId) {
  if (!bridges.has(clientId)) bridges.set(clientId, new CodexBridge((event) => eventHub.publishClient(clientId, event)));
  return bridges.get(clientId);
}

function bridgeStatus(clientId) {
  return bridges.get(clientId)?.status() || { ready: false, error: null, observationMode: null };
}

function eventKey(event, index) {
  const itemStatus = event.params?.item?.status || "";
  const turnStatus = event.params?.turn?.status?.type || event.params?.turn?.status || "";
  return [index, event.method, event.params?.item?.type || "", itemStatus, turnStatus].join(":");
}

function clientIdFor(url) {
  const value = url.searchParams.get("clientId") || "";
  return /^[a-zA-Z0-9-]{8,80}$/.test(value) ? value : null;
}

function threadChoice(thread, index) {
  const status = typeof thread.status === "string" ? thread.status.replace(/[^a-zA-Z -]/g, "").slice(0, 24) : "available";
  return `Recent thread ${index + 1} · ${status}`;
}

async function writeLearningCandidate(clientId) {
  const structural = eventHub.replay(clientId).filter((event) => ["codex", "agent-browser", "auracall"].includes(event.source || "codex"));
  const bySource = groupBy(structural, (event) => event.source || "codex");
  const algorithms = groupBy(structural.map((event) => ({ event, classification: classifyEvent(event) })), ({ classification }) => classification.algorithm);
  const createdAt = new Date().toISOString();
  const body = `---\ntitle: WSL runtime algorithm learning candidate\nstatus: review-required\ncreated_at: ${createdAt}\nsource: algorithm-observatory\nprivacy: structural-only\n---\n\n# WSL runtime algorithm learning candidate\n\nThis candidate contains sanitized structural aggregates only. It excludes prompts, message text, reasoning text, tool arguments and results, URLs, profile identifiers, credentials, and raw command output. Review before Graphiti ingestion.\n\n## Source coverage\n\n${["codex", "agent-browser", "auracall"].map((source) => `- ${source}: ${(bySource[source] || []).length} events`).join("\n")}\n\n## Observed patterns\n\n${Object.entries(algorithms).sort((a, b) => b[1].length - a[1].length).map(([name, rows]) => `- ${name}: ${rows.length} observations; evidence=${rows[0].classification.confidence}`).join("\n") || "- No stable observations yet."}\n\n## Review gate\n\n- [ ] Counts represent a useful observation window.\n- [ ] Every statement is structural and source-labeled.\n- [ ] No volatile failure is generalized into a durable rule.\n- [ ] A human reviewer changed status to reviewed before ingestion.\n`;
  const directory = join(root, "learning-candidates");
  await mkdir(directory, { recursive: true });
  const filename = `wsl-runtime-${createdAt.replace(/[:.]/g, "-")}.md`;
  await writeFile(join(directory, filename), body, { flag: "wx" });
  return { filename, eventCount: structural.length, status: "review-required" };
}

function groupBy(values, keyFor) {
  return values.reduce((groups, value) => {
    const key = keyFor(value);
    (groups[key] ||= []).push(value);
    return groups;
  }, {});
}

async function jsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error("Request body is too large");
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

async function serveStatic(pathname, response) {
  const shared = pathname.startsWith("/shared/");
  const base = shared ? join(root, "lib") : publicRoot;
  const relative = pathname === "/" ? "index.html" : shared ? pathname.slice("/shared/".length) : pathname.slice(1);
  const safe = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const path = join(base, safe);
  if (!path.startsWith(base)) return false;
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    const isApi = url.pathname.startsWith("/api/");
    const clientId = isApi ? clientIdFor(url) : null;
    if (isApi && !clientId) return sendJson(response, 400, { error: "A valid clientId is required" });
    if (request.method === "GET" && url.pathname === "/api/status") return sendJson(response, 200, { ...bridgeStatus(clientId), sources: runtimeSources.statuses, recentEventCount: eventHub.replay(clientId).length });
    if (request.method === "GET" && url.pathname === "/api/threads") {
      const result = await threadLister.listThreads();
      const channel = eventHub.channel(clientId);
      channel.threadHandles.clear();
      const data = (result.data || []).map((thread, index) => {
        const handle = randomUUID();
        channel.threadHandles.set(handle, thread.id);
        return { handle, label: threadChoice(thread, index) };
      });
      return sendJson(response, 200, { data });
    }
    if (request.method === "POST" && url.pathname === "/api/observe") {
      const body = await jsonBody(request);
      const threadId = eventHub.channel(clientId).threadHandles.get(body.threadHandle);
      if (!threadId) return sendJson(response, 404, { error: "Select a thread from this browser session first" });
      return sendJson(response, 200, await getBridge(clientId).observe(threadId));
    }
    if (request.method === "POST" && url.pathname === "/api/import") {
      const body = await jsonBody(request);
      const source = Array.isArray(body) ? body : body.events;
      if (!Array.isArray(source)) return sendJson(response, 400, { error: "Expected an events array" });
      const sanitized = source.map(sanitizeEvent).filter(Boolean);
      sanitized.forEach((event) => eventHub.publishClient(clientId, event));
      return sendJson(response, 200, { imported: sanitized.length });
    }
    if (request.method === "POST" && url.pathname === "/api/demo") {
      demoEvents.map(sanitizeEvent).forEach((event) => eventHub.publishClient(clientId, event));
      return sendJson(response, 200, { imported: demoEvents.length });
    }
    if (request.method === "POST" && url.pathname === "/api/learning-candidate") {
      return sendJson(response, 201, await writeLearningCandidate(clientId));
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      response.write("retry: 1500\n\n");
      for (const event of eventHub.replay(clientId)) response.write(`data: ${JSON.stringify(event)}\n\n`);
      const disconnect = eventHub.connect(clientId, response);
      request.on("close", disconnect);
      return;
    }
    if (await serveStatic(url.pathname, response)) return;
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error("Observatory request failed", error);
    sendJson(response, 500, { error: "The local request could not be completed" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Algorithm Observatory: http://127.0.0.1:${port}`);
});

function shutdown() {
  if (runtimeSources.timer) clearInterval(runtimeSources.timer);
  if (threadLister.pollTimer) clearInterval(threadLister.pollTimer);
  threadLister.process?.kill("SIGTERM");
  for (const bridge of bridges.values()) {
    if (bridge.pollTimer) clearInterval(bridge.pollTimer);
    bridge.process?.kill("SIGTERM");
  }
  eventHub.closeConnections();
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
