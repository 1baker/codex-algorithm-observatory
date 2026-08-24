import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { demoEvents } from "./lib/catalog.mjs";
import { flattenThread, sanitizeEvent } from "./lib/events.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const port = Number(process.env.OBSERVATORY_PORT || 4173);
const clients = new Set();
const recentEvents = [];

class CodexBridge {
  constructor() {
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
        } else if (message.method) {
          publish(sanitizeEvent(message));
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
      return { thread: summarizeThread(result.thread), eventCount, mode: this.observationMode };
    } catch (error) {
      if (!String(error.message).includes("active writer")) throw error;
      const result = await this.request("thread/read", { threadId, includeTurns: true });
      this.observationMode = "readOnlyPolling";
      this.error = null;
      const eventCount = this.publishThreadHistory(result.thread);
      this.pollTimer = setInterval(() => this.pollObservedThread(), 2000);
      return { thread: summarizeThread(result.thread), eventCount, mode: this.observationMode };
    }
  }

  publishThreadHistory(thread) {
    let count = 0;
    for (const event of flattenThread(thread)) {
      const key = eventKey(event);
      if (this.publishedKeys.has(key)) continue;
      this.publishedKeys.add(key);
      publish(event);
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
    return { ready: this.ready, error: this.error, observedThreadId: this.observedThreadId, observationMode: this.observationMode };
  }
}

const bridge = new CodexBridge();

function summarizeThread(thread) {
  return {
    id: thread.id,
    name: thread.name,
    cwd: thread.cwd,
    status: thread.status,
    updatedAt: thread.updatedAt,
    cliVersion: thread.cliVersion,
    source: thread.source
  };
}

function eventKey(event) {
  const turnId = event.params?.turn?.id || event.params?.turnId || "";
  const itemId = event.params?.item?.id || "";
  const itemStatus = event.params?.item?.status || "";
  const turnStatus = event.params?.turn?.status?.type || event.params?.turn?.status || "";
  return [event.method, turnId, itemId, itemStatus, turnStatus].join(":");
}

function publish(event) {
  if (!event) return;
  recentEvents.push(event);
  if (recentEvents.length > 500) recentEvents.shift();
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const response of clients) response.write(data);
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
    if (request.method === "GET" && url.pathname === "/api/status") return sendJson(response, 200, { ...bridge.status(), recentEventCount: recentEvents.length });
    if (request.method === "GET" && url.pathname === "/api/threads") {
      const result = await bridge.listThreads();
      return sendJson(response, 200, { data: (result.data || []).map(summarizeThread) });
    }
    if (request.method === "POST" && url.pathname === "/api/observe") {
      const body = await jsonBody(request);
      if (!body.threadId) return sendJson(response, 400, { error: "threadId is required" });
      return sendJson(response, 200, await bridge.observe(body.threadId));
    }
    if (request.method === "POST" && url.pathname === "/api/import") {
      const body = await jsonBody(request);
      const source = Array.isArray(body) ? body : body.events;
      if (!Array.isArray(source)) return sendJson(response, 400, { error: "Expected an events array" });
      const sanitized = source.map(sanitizeEvent).filter(Boolean);
      sanitized.forEach(publish);
      return sendJson(response, 200, { imported: sanitized.length });
    }
    if (request.method === "POST" && url.pathname === "/api/demo") {
      demoEvents.map(sanitizeEvent).forEach(publish);
      return sendJson(response, 200, { imported: demoEvents.length });
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      response.write("retry: 1500\n\n");
      for (const event of recentEvents) response.write(`data: ${JSON.stringify(event)}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (await serveStatic(url.pathname, response)) return;
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Algorithm Observatory: http://127.0.0.1:${port}`);
});

function shutdown() {
  if (bridge.pollTimer) clearInterval(bridge.pollTimer);
  bridge.process?.kill("SIGTERM");
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
