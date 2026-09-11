// Server-Sent Events hub: one channel per offer. Used for the live chat and
// for pushing "something changed, refresh the lots" to open offer pages.
const channels = new Map(); // offerId -> Set<res>

export function subscribe(offerId, ctx) {
  const key = String(offerId);
  const { req, res } = ctx;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  if (!channels.has(key)) channels.set(key, new Set());
  channels.get(key).add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25_000);
  const cleanup = () => { clearInterval(ping); channels.get(key)?.delete(res); };
  req.on('close', cleanup);
  res.on('error', cleanup);
  ctx.done = true; // response stays open
}

export function publish(offerId, event, data) {
  const set = channels.get(String(offerId));
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(payload); } catch { set.delete(res); } }
}

export function connections(offerId) { return channels.get(String(offerId))?.size || 0; }
