import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function sanitizeAgentBrowserEvent(event) {
  if (!event || typeof event !== "object" || !event.id || !event.kind) return null;
  const details = event.details || {};
  return {
    source: "agent-browser",
    sourceEventId: String(event.id),
    method: `browser/${String(event.kind).replace(/[^a-z0-9_-]/gi, "-")}`,
    emittedAtMs: Date.parse(event.timestamp) || Date.now(),
    params: {
      runtime: {
        kind: String(event.kind),
        status: safeStatus(event.currentHealth || details.status || details.state),
        counts: numericFields(details, ["browserCount", "changedBrowsers", "changedTabs", "tabCount", "expiredSessionLeaseCount", "failureCount"])
      }
    }
  };
}

export function sanitizeAuraCallStatus(status) {
  if (!status || typeof status !== "object") return null;
  const runner = status.runner || {};
  const topology = status.runnerTopology || {};
  const claims = status.localClaimSummary || {};
  return {
    source: "auracall",
    method: "auracall/status",
    emittedAtMs: Date.now(),
    params: {
      runtime: {
        kind: "service-status",
        status: status.ok === true ? "ready" : "degraded",
        mode: safeStatus(status.mode),
        runner: safeStatus(runner.status || runner.state),
        topology: safeStatus(topology.status || topology.state || topology.posture),
        counts: numericFields(claims, ["active", "running", "queued", "failed", "succeeded", "total"])
      }
    }
  };
}

export async function readAgentBrowserEvents(limit = 25) {
  const { stdout } = await execFileAsync("agent-browser", ["service", "events", "--limit", String(limit), "--json"], {
    timeout: 8000,
    maxBuffer: 2_000_000
  });
  const envelope = JSON.parse(stdout);
  return (envelope?.data?.events || []).map(sanitizeAgentBrowserEvent).filter(Boolean);
}

export async function readAuraCallStatus(baseUrl = "http://127.0.0.1:18095") {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/status`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`AuraCall status returned ${response.status}`);
  return sanitizeAuraCallStatus(await response.json());
}

function numericFields(value, allowlist) {
  return Object.fromEntries(allowlist.filter((key) => Number.isFinite(value?.[key])).map((key) => [key, value[key]]));
}

function safeStatus(value) {
  return typeof value === "string" ? value.slice(0, 64).replace(/[^a-z0-9_.:-]/gi, "-") : null;
}
