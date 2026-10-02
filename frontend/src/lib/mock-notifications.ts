// Dev-only helper: build mock notifications from queue state.
// Keep this module small and deterministic so it's easy to replace with real backend data later.

import type { Notification } from '@/lib/types';

const makeIso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

/**
 * Generate mock notifications from the current active visit or history.
 * - active: object returned by useUserQueue() for the active visit (service, position, wait)
 * - history: user's visit history (most recent first)
 */
export function generateMockNotifications(
  active?: { service: any; position?: number; wait?: number },
  history?: { serviceId?: string; serviceName?: string; outcome?: string; endedAt?: string }[]
): Notification[] {
  const items: Notification[] = [];
  if (active) {
    const svc = active.service;
    const pos = active.position ?? 0;

    // Joined (~30 minutes ago)
    items.push({
      id: `mock-joined-${svc.id}`,
      type: 'joined',
      title: 'Queue Joined',
      message: `You successfully joined ${svc.name}.\nEstimated wait: ${active.wait ?? 0} minutes.`,
      timestamp: makeIso(30 * 60 * 1000),
      serviceId: svc.id,
    });

    // Position updated (~15 minutes ago)
    if (pos > 0) {
      items.push({
        id: `mock-update-${svc.id}`,
        type: 'update',
        title: 'Queue Updated',
        message: `Your position changed from #${pos + 1} to #${pos}.`,
        timestamp: makeIso(15 * 60 * 1000),
        serviceId: svc.id,
        oldPosition: pos + 1,
        newPosition: pos,
      });
    }

    // Turn approaching (~5 minutes ago) when near front
    if (pos > 0 && pos <= 2) {
      items.push({
        id: `mock-turn-${svc.id}`,
        type: 'turn',
        title: 'Your turn is approaching!',
        message: `You are currently #${pos} in ${svc.name}.`,
        timestamp: makeIso(5 * 60 * 1000),
        serviceId: svc.id,
      });
    }

    // Service update (~1 hour ago) if service is closed
    if (!svc.isOpen) {
      items.push({
        id: `mock-service-${svc.id}`,
        type: 'service',
        title: 'Service Update',
        message: `${svc.name} is temporarily unavailable.`,
        timestamp: makeIso(60 * 60 * 1000),
        serviceId: svc.id,
      });
    }

    return items;
  }

  // Fallback to last history entry
  if (history && history.length) {
    const last = history[0];
    items.push({
      id: `mock-history-${last.serviceId ?? '0'}`,
      type: 'history',
      title: last.serviceName ?? 'Recent visit',
      message: `${last.serviceName ?? 'Service'}: ${last.outcome ?? 'Updated'}.`,
      timestamp: last.endedAt ?? makeIso(2 * 60 * 60 * 1000),
      serviceId: last.serviceId,
    });
  }

  return items;
}