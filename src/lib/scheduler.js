// Background timer: expire offers at the end of the day, tidy auth tables.
import { expireDueOffers } from './rules.js';
import { cleanupAuth } from './auth.js';
import { publish } from './sse.js';

export function startScheduler(db, { intervalMs = 30_000 } = {}) {
  let tickCount = 0;
  const tick = () => {
    try {
      const ended = expireDueOffers(db);
      for (const id of ended) {
        console.log(`[scheduler] offer ${id} expired`);
        publish(id, 'refresh', { reason: 'expired' });
      }
      if (++tickCount % 20 === 0) cleanupAuth(db);
    } catch (e) {
      console.error('[scheduler] error', e);
    }
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return () => clearInterval(handle);
}
