// Service and queue state for every screen, loaded from the FastAPI backend.
//
// The store fetches services, queues and the signed-in user's history, then polls so changes
// made elsewhere (staff serving the next person, another user joining) show up on their own.
// Every action calls the backend and refreshes afterwards, so what the UI shows always comes
// from backend responses. Actions return promises that reject with an ApiError message.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import * as api from '@/lib/api/queues';
import { listNotifications } from '@/lib/api/queues';
import { useAuth } from '@/lib/auth-store';
import type { QueueEntry, QueueVisit, Service, Notification } from '@/lib/types';

export type ServiceInput = api.ServiceInput;
export type NowServing = { entry: QueueEntry; startedAt: string };

// How often queues are re-fetched while the app is open.
const PollIntervalMs = 5000;

type Data = {
  services: Service[];
  queues: Record<string, QueueEntry[]>;
  nowServing: Record<string, NowServing | undefined>;
  history: QueueVisit[];
  notifications: Notification[];
};

type QueueStore = Data & {
  // False until the first response arrives.
  loaded: boolean;
  // Set when the backend can't be reached; cleared by the next successful refresh.
  loadError: string | null;
  refresh: () => Promise<void>;
  toggleQueue: (id: string) => Promise<void>;
  saveService: (input: ServiceInput, id?: string) => Promise<Service>;
  deleteService: (id: string) => Promise<void>;
  moveEntry: (id: string, entryId: string, direction: -1 | 1) => Promise<void>;
  removeEntry: (id: string, entryId: string) => Promise<void>;
  serveNext: (id: string) => Promise<void>;
  completeService: (id: string) => Promise<void>;
  joinQueue: (id: string) => Promise<QueueEntry>;
  joinAsGuest: (id: string, name: string) => Promise<QueueEntry>;
  leaveQueue: () => Promise<void>;
  leaveAsGuest: (id: string, entryId: string) => Promise<void>;
};

const QueueStoreContext = createContext<QueueStore | null>(null);

const empty: Data = { services: [], queues: {}, nowServing: {}, history: [], notifications: [] };

export function QueueStoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const account = session?.account;
  const [data, setData] = useState<Data>(empty);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Only the newest refresh may write, so a slow poll can't overwrite a fresher result.
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const [services, queues, history, notifications] = await Promise.all([
        api.listServices(),
        api.listQueues(),
        account ? api.visitHistory(account.id) : Promise.resolve([]),
        account ? listNotifications(account.id) : Promise.resolve([]),
      ]);
      if (request !== latestRequest.current) return;
      setData({
        services,
        queues: Object.fromEntries(queues.map((q) => [q.serviceId, q.waiting])),
        nowServing: Object.fromEntries(
          queues.flatMap((q) => (q.nowServing ? [[q.serviceId, q.nowServing]] : [])),
        ),
        history,
        notifications,
      });
      setLoaded(true);
      setLoadError(null);
    } catch (e) {
      if (request === latestRequest.current) setLoadError(messageOf(e));
    }
  }, [account]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, PollIntervalMs);
    return () => clearInterval(timer);
  }, [refresh]);

  // Runs a backend call, then reloads so every screen sees the result.
  const mutate = async <T,>(call: () => Promise<T>) => {
    const result = await call();
    await refresh();
    return result;
  };

  const requireClient = () => {
    if (!account) throw new Error('Please sign in before joining a queue.');
    if (account.role !== 'client') throw new Error('Sign in with a client account to join a queue.');
    return account;
  };

  const store: QueueStore = {
    ...data,
    loaded,
    loadError,
    refresh,
    toggleQueue: async (id) => {
      const service = data.services.find((s) => s.id === id);
      if (!service) throw new Error('This service no longer exists.');
      await mutate(() => api.updateService(id, { isOpen: !service.isOpen }));
    },
    saveService: (input, id) =>
      mutate(() => (id ? api.updateService(id, input) : api.createService(input))),
    deleteService: (id) => mutate(() => api.deleteService(id)),
    moveEntry: (id, entryId, direction) =>
      mutate(() => api.moveEntry(id, entryId, direction < 0 ? 'up' : 'down')).then(() => undefined),
    removeEntry: (id, entryId) => mutate(() => api.removeEntry(id, entryId)),
    serveNext: (id) => mutate(() => api.serveNext(id)).then(() => undefined),
    completeService: (id) => mutate(() => api.completeService(id)).then(() => undefined),
    joinQueue: async (id) => {
      const client = requireClient();
      return mutate(() => api.joinQueue(id, { name: client.displayName, userId: client.id }));
    },
    // One-time visit from a join link: no account, so it never appears in anyone's history.
    joinAsGuest: (id, name) => mutate(() => api.joinQueue(id, { name })),
    leaveQueue: async () => {
      if (!account) throw new Error('Please sign in first.');
      const serviceId = Object.keys(data.queues).find((id) =>
        data.queues[id].some((e) => e.accountId === account.id),
      );
      if (!serviceId) throw new Error('You are not waiting in a queue.');
      await mutate(() => api.leaveQueue(serviceId, { userId: account.id }));
    },
    leaveAsGuest: (id, entryId) => mutate(() => api.leaveQueue(id, { entryId })).then(() => undefined),
  };

  return <QueueStoreContext.Provider value={store}>{children}</QueueStoreContext.Provider>;
}

export function useQueueStore() {
  const store = useContext(QueueStoreContext);
  if (!store) throw new Error('useQueueStore must be used inside QueueStoreProvider');
  return store;
}

export function messageOf(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback;
}

export type StatusFilter = 'all' | 'open' | 'closed';

export const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

// Case-insensitive match on name or description, plus an open/closed filter.
export function filterServices(services: Service[], query: string, status: StatusFilter = 'all') {
  const q = query.trim().toLowerCase();
  return services.filter((s) => {
    if (status === 'open' && !s.isOpen) return false;
    if (status === 'closed' && s.isOpen) return false;
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });
}

// Accepts a full join link (https://queuesmart.app/join/it-help), a bare path, or just the code.
export function serviceFromJoinLink(services: Service[], link: string) {
  const code = link.trim().split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop()?.toLowerCase();
  return code ? services.find((s) => s.id.toLowerCase() === code) : undefined;
}

export function estimatedWait(service: Service, queueLength: number) {
  return service.durationMinutes * queueLength;
}
