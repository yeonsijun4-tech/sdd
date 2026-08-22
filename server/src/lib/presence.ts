const BASE_ONLINE = 50;
const TTL_MS = 90_000;

const connections = new Map<string, number>();

function pruneStale() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, lastSeen] of connections) {
    if (lastSeen < cutoff) {
      connections.delete(id);
    }
  }
}

export function touchConnection(clientId: string): number {
  if (!clientId || clientId.length > 64) {
    return getOnlineCount();
  }

  connections.set(clientId, Date.now());
  pruneStale();
  return getOnlineCount();
}

export function removeConnection(clientId: string): number {
  if (clientId) {
    connections.delete(clientId);
  }
  return getOnlineCount();
}

export function getOnlineCount(): number {
  pruneStale();
  return BASE_ONLINE + connections.size;
}
