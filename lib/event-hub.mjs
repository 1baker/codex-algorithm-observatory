export class EventHub {
  constructor(limit = 500) {
    this.limit = limit;
    this.runtimeEvents = [];
    this.channels = new Map();
  }

  channel(clientId) {
    if (!this.channels.has(clientId)) {
      this.channels.set(clientId, { events: [], responses: new Set(), threadHandles: new Map() });
    }
    return this.channels.get(clientId);
  }

  publishRuntime(event) {
    appendBounded(this.runtimeEvents, event, this.limit);
    for (const channel of this.channels.values()) writeTo(channel.responses, event);
  }

  publishClient(clientId, event) {
    const channel = this.channel(clientId);
    appendBounded(channel.events, event, this.limit);
    writeTo(channel.responses, event);
  }

  replay(clientId) {
    const channel = this.channel(clientId);
    return [...this.runtimeEvents, ...channel.events].sort((a, b) => (a.emittedAtMs || 0) - (b.emittedAtMs || 0));
  }

  connect(clientId, response) {
    const channel = this.channel(clientId);
    channel.responses.add(response);
    return () => channel.responses.delete(response);
  }

  closeConnections() {
    for (const channel of this.channels.values()) {
      for (const response of channel.responses) response.end();
      channel.responses.clear();
    }
  }
}

function appendBounded(values, value, limit) {
  if (!value) return;
  values.push(value);
  if (values.length > limit) values.shift();
}

function writeTo(responses, event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const response of responses) response.write(data);
}
