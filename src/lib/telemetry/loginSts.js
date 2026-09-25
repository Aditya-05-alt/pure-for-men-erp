import { collectClientTelemetry } from '@/lib/telemetry/clientContext';

/**
 * Record a frontend session event (dealer dashboard only — not admin).
 * Fire-and-forget; never throws to callers.
 */
export async function trackLoginSts({
  eventType,
  eventAction = null,
  metadata = null,
} = {}) {
  if (typeof window === 'undefined') return;
  if (!eventType) return;

  try {
    const payload = collectClientTelemetry({
      event_type: eventType,
      event_action: eventAction,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    });

    await fetch('/api/telemetry/login-sts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* telemetry must not break the app */
  }
}
