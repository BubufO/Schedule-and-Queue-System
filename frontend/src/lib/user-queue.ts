import { useAuth } from '@/lib/auth-store';
import { useQueueStore } from '@/lib/queue-store';

export const outcomeLabels = { served: 'Served', left: 'Left queue', removed: 'Removed by staff', cancelled: 'Service cancelled' };

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function useUserQueue() {
  const { session } = useAuth();
  const store = useQueueStore();
  const accountId = session?.account.id;
  const history = accountId ? store.history.filter(v => v.accountId === accountId) : [];
  
  const active = accountId ? store.services.flatMap(service => {
    const serving = store.nowServing[service.id];
    if (serving?.entry.accountId === accountId) return [{ service, entry: serving.entry, position: 0, wait: 0, status: 'Your turn' }];
    const index = (store.queues[service.id] ?? []).findIndex(e => e.accountId === accountId);
    if (index < 0) return [];
    const wait = service.durationMinutes * (index + (serving ? 1 : 0));
    return [{ service, entry: store.queues[service.id][index], position: index + 1, wait, status: index === 0 ? 'Almost ready' : 'Waiting' }];
  })[0] : undefined;

  return { 
    ...store, 
    session, 
    active, 
    history, 
    notifications: store.notifications,
  };
}
