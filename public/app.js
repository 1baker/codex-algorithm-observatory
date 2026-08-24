import { agentBrowserAlgorithms, codexAlgorithms, commonPatterns, confidenceLevels, demoEvents } from "./catalog.js";
import { classifyEvent } from "./events.js";

const stages = [
  ["plan", "Plan"], ["reason", "Reason"], ["act", "Act"], ["change", "Change"], ["verify", "Verify"], ["feedback", "Feedback"]
];
const state = { events: [], stageCounts: Object.fromEntries(stages.map(([id]) => [id, 0])), startedAt: null };
const clientId = sessionStorage.getItem("observatoryClientId") || crypto.randomUUID();
sessionStorage.setItem("observatoryClientId", clientId);
const localBridgeAvailable = ["127.0.0.1", "localhost"].includes(location.hostname);
const $ = (selector) => document.querySelector(selector);
const flow = $("#flow");

function renderFlow() {
  flow.innerHTML = stages.map(([id, label]) => `<div class="flow-node ${state.stageCounts[id] ? "seen" : ""}" data-stage="${id}"><button><span class="flow-count">${state.stageCounts[id] || "·"}</span>${label}</button></div>`).join("");
}

function card(pattern) {
  const evidence = confidenceLevels[pattern.confidence];
  return `<article class="algorithm-card">
    <div class="card-top"><span class="family">${pattern.family}</span><span class="evidence-badge ${pattern.confidence}" title="${evidence.description}">${evidence.label.replace(" evidence", "").replace(" pattern", "")}</span></div>
    <h3>${pattern.name}</h3><p>${pattern.summary}</p>
    <div class="mini-flow">${pattern.steps.map((step) => `<span>${step}</span>`).join("")}</div>
    <a class="source-link" href="${pattern.source}" target="_blank" rel="noreferrer">${pattern.sourceLabel} ↗</a>
  </article>`;
}

function setCards() {
  $("#browser-cards").innerHTML = agentBrowserAlgorithms.map(card).join("");
  $("#library-cards").innerHTML = commonPatterns.map(card).join("");
}

function eventTitle(event, classification) {
  const item = event.params?.item;
  if (item?.type === "commandExecution") return `${sourceLabel(event.source)} · ${classification.algorithm}`;
  if (item?.type === "fileChange") return `${sourceLabel(event.source)} · ${classification.algorithm}: ${item.fileCount || 0} file${item.fileCount === 1 ? "" : "s"}`;
  if (item?.tool) return `${classification.algorithm}: ${item.tool}`;
  return `${sourceLabel(event.source)} · ${classification.algorithm}`;
}

function sourceLabel(source) {
  return ({ codex: "Codex", "agent-browser": "agent-browser", auracall: "AuraCall" })[source || "codex"] || "Imported";
}

function eventDetail(event) {
  const item = event.params?.item;
  if (item?.exitCode !== null && item?.exitCode !== undefined) return `exit ${item.exitCode}${item.durationMs ? ` · ${item.durationMs} ms` : ""}`;
  if (event.params?.plan) return `${event.params.plan.filter((step) => step.status === "completed").length}/${event.params.plan.length} plan steps completed`;
  const runtime = event.params?.runtime;
  if (runtime) return [runtime.kind, runtime.status, runtime.runner].filter(Boolean).join(" · ") || event.method;
  return event.method;
}

function addEvent(event) {
  if (!event || !event.method) return;
  if (!state.startedAt) state.startedAt = event.emittedAtMs || Date.now();
  const classification = classifyEvent(event);
  state.events.push({ event, classification });
  if (state.events.length > 1000) {
    const removed = state.events.shift();
    const removedStage = flowStageFor(removed.classification);
    if (removedStage) state.stageCounts[removedStage] = Math.max(0, (state.stageCounts[removedStage] || 0) - 1);
  }
  const flowStage = flowStageFor(classification);
  if (flowStage) state.stageCounts[flowStage] = (state.stageCounts[flowStage] || 0) + 1;
  updateDashboard(event, classification, flowStage);
}

function flowStageFor(classification) {
  return stages.some(([id]) => id === classification.stage) ? classification.stage : classification.stage === "gate" ? "act" : null;
}

function updateDashboard(event, classification, flowStage) {
  renderFlow();
  document.querySelectorAll(".flow-node").forEach((node) => node.classList.toggle("active", Boolean(flowStage) && node.dataset.stage === flowStage));
  const known = codexAlgorithms.find((algorithm) => algorithm.name === classification.algorithm || (classification.algorithm === "Plan-act-observe loop" && algorithm.id === "plan-loop"));
  $("#active-explanation").innerHTML = `<span class="evidence-badge ${classification.confidence}">${confidenceLevels[classification.confidence].label.replace(" evidence", "")}</span><div><strong>${classification.algorithm}</strong><p>${known?.summary || explainClassification(classification)}</p></div>`;
  $("#event-count").textContent = `${state.events.length} event${state.events.length === 1 ? "" : "s"}`;
  const actions = state.events.filter(({ classification: c }) => c.stage === "act").length;
  const changes = state.events.filter(({ classification: c }) => c.stage === "change").length;
  const checks = state.events.filter(({ classification: c }) => c.stage === "verify").length;
  const inferences = state.events.filter(({ classification: c }) => c.confidence === "inferred").length;
  $("#metric-actions").textContent = actions; $("#metric-changes").textContent = changes; $("#metric-checks").textContent = checks; $("#metric-inferences").textContent = inferences;
  renderTimeline(); renderNotes();
}

function explainClassification(classification) {
  const descriptions = {
    "Tool execution": "An observable tool moved from invocation toward a result.",
    "Execution feedback": "A command result provides an external success, failure, and timing signal.",
    "Reasoning summary": "A readable reasoning summary event is observable when the model and client support it; hidden reasoning is not exposed.",
    "Feedback signal": "An error or warning can alter the next observable action.",
    "Observable event": "The protocol exposes this event, but it does not justify a stronger algorithm claim."
  };
  return descriptions[classification.algorithm] || "This state is visible in the local App Server event stream.";
}

function renderTimeline() {
  const recent = state.events.slice(-35).reverse();
  $("#timeline").innerHTML = recent.length ? recent.map(({ event, classification }) => {
    const elapsed = Math.max(0, (event.emittedAtMs || Date.now()) - state.startedAt);
    return `<li class="${classification.confidence}"><span class="timeline-time">+${(elapsed / 1000).toFixed(1)}s</span><span class="timeline-mark"></span><div><span class="timeline-title">${escapeHtml(eventTitle(event, classification))}</span><span class="timeline-detail">${escapeHtml(eventDetail(event))}</span></div><span class="evidence-badge ${classification.confidence}">${classification.confidence}</span></li>`;
  }).join("") : `<li class="empty-state">Events will appear here in causal order.</li>`;
}

function renderNotes() {
  const seen = new Map();
  for (const { classification } of state.events.slice().reverse()) if (!seen.has(classification.algorithm)) seen.set(classification.algorithm, classification);
  const notes = [...seen.values()].slice(0, 4);
  $("#teaching-notes").innerHTML = notes.length ? notes.map((classification) => `<div class="note ${classification.confidence}"><strong>${classification.algorithm}</strong><p>${confidenceLevels[classification.confidence].description}</p></div>`).join("") : `<div class="note"><strong>Start with evidence</strong><p>Events identify observable mechanisms. Named research patterns remain comparisons unless an implementation source confirms them.</p></div>`;
}

function escapeHtml(value) { const span = document.createElement("span"); span.textContent = String(value); return span.innerHTML; }

async function api(path, options) {
  const url = new URL(path, location.href);
  url.searchParams.set("clientId", clientId);
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

async function loadThreads() {
  try {
    const result = await api("/api/threads");
    const select = $("#thread-select");
    select.innerHTML = `<option value="">Select a local Codex thread</option>` + result.data.map((thread) => {
      return `<option value="${thread.handle}">${escapeHtml(thread.label)}</option>`;
    }).join("");
    $("#status-message").textContent = `Found ${result.data.length} local thread${result.data.length === 1 ? "" : "s"}. Select one to load history and subscribe to its live events.`;
    $("#connection-label").textContent = "App Server ready";
  } catch (error) {
    $("#status-message").textContent = `Live connection unavailable: ${error.message}. The teaching demo and JSON import still work.`;
    $("#connection-label").textContent = "Teaching mode";
  }
}

async function loadSourceStatus() {
  try {
    const result = await api("/api/status");
    const states = { codex: result.ready ? "observing" : "available", ...Object.fromEntries(Object.entries(result.sources || {}).map(([key, value]) => [key, value.state])) };
    document.querySelectorAll("[data-source-status]").forEach((node) => {
      const status = states[node.dataset.sourceStatus] || "unavailable";
      node.dataset.state = status;
      node.title = status;
    });
  } catch {}
}

$("#thread-select").addEventListener("change", (event) => { $("#observe-button").disabled = !event.target.value; });
$("#observe-button").addEventListener("click", async () => {
  const threadHandle = $("#thread-select").value;
  if (!threadHandle) return;
  const selectedLabel = $("#thread-select").selectedOptions[0]?.textContent || "selected thread";
  try {
    $("#status-message").textContent = "Joining thread and loading observable history…";
    const result = await api("/api/observe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadHandle }) });
    const readOnly = result.mode === "readOnlyPolling";
    $("#status-message").textContent = readOnly
      ? `Watching ${selectedLabel} read-only. Loaded ${result.eventCount} structural events and polling for updates every 2 seconds because another Codex client owns the thread.`
      : `Observing ${selectedLabel}. Loaded ${result.eventCount} structural events; future App Server events stream live.`;
    $("#connection-label").textContent = readOnly ? "Read-only near-live" : "Observing live";
  } catch (error) { $("#status-message").textContent = `Could not observe thread: ${error.message}`; }
});
$("#demo-button").addEventListener("click", async () => {
  clearEvents();
  if (localBridgeAvailable) {
    try { await api("/api/demo", { method: "POST" }); }
    catch { demoEvents.forEach(addEvent); }
  } else {
    demoEvents.forEach(addEvent);
  }
  $("#status-message").textContent = "Teaching demo loaded. Follow the highlighted loop from plan to test feedback.";
});
$("#clear-button").addEventListener("click", clearEvents);
$("#learning-button").addEventListener("click", async () => {
  try {
    const result = await api("/api/learning-candidate", { method: "POST" });
    $("#status-message").textContent = `Prepared ${result.filename} from ${result.eventCount} structural events. It remains review-required and has not been ingested into Graphiti.`;
  } catch (error) { $("#status-message").textContent = `Could not prepare learning note: ${error.message}`; }
});
$("#import-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const text = await file.text();
    let events;
    try { const parsed = JSON.parse(text); events = Array.isArray(parsed) ? parsed : parsed.events || [parsed]; }
    catch { events = text.split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
    const result = await api("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }) });
    $("#status-message").textContent = `Imported ${result.imported} sanitized structural events from ${file.name}.`;
  } catch (error) { $("#status-message").textContent = `Import failed: ${error.message}`; }
  event.target.value = "";
});

function clearEvents() {
  state.events = []; state.startedAt = null; state.stageCounts = Object.fromEntries(stages.map(([id]) => [id, 0]));
  renderFlow(); renderTimeline(); renderNotes();
  $("#event-count").textContent = "0 events";
  for (const id of ["actions", "changes", "checks", "inferences"]) $(`#metric-${id}`).textContent = "0";
  $("#active-explanation").innerHTML = `<span class="evidence-badge direct">Direct</span><div><strong>Waiting for events</strong><p>Choose a thread or play the teaching demo.</p></div>`;
}

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${button.dataset.view}-view`));
}));

if (localBridgeAvailable) {
  const stream = new EventSource(`/api/events?clientId=${encodeURIComponent(clientId)}`);
  stream.onmessage = (message) => { try { addEvent(JSON.parse(message.data)); } catch {} };
  stream.onerror = () => { if ($("#connection-label").textContent === "Observing live") $("#connection-label").textContent = "Reconnecting"; };
} else {
  $("#connection-label").textContent = "Teaching preview";
  $("#thread-select").disabled = true;
  $("#observe-button").disabled = true;
  $("#learning-button").disabled = true;
  $("#status-message").textContent = "Browser preview mode: use Play teaching demo, agent-browser, and Pattern library. Live local threads remain available only from the workstation server.";
}

setCards(); renderFlow(); renderNotes();
if (localBridgeAvailable) loadThreads();
if (localBridgeAvailable) { loadSourceStatus(); setInterval(loadSourceStatus, 5000); }
