// Shared in-memory simulation. Reloading resets queues and history.
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { initialQueues, initialServices } from '@/lib/mock-data';
import { useAuth } from '@/lib/auth-store';
import type { Priority, QueueEntry, Service, QueueVisit } from '@/lib/types';

export type ServiceInput = { name: string; description: string; durationMinutes: number; priority: Priority };
export type NowServing = { entry: QueueEntry; startedAt: string };
type State = {
  services: Service[];
  queues: Record<string, QueueEntry[]>;
  nowServing: Record<string, NowServing | undefined>;
  history: QueueVisit[];
  sequence: number;
};
type QueueStore = Omit<State, 'sequence'> & {
  toggleQueue: (id: string) => void;
  saveService: (input: ServiceInput, id?: string) => Service;
  deleteService: (id: string) => void;
  moveEntry: (id: string, entryId: string, direction: -1 | 1) => void;
  removeEntry: (id: string, entryId: string) => void;
  serveNext: (id: string) => void;
  completeService: (id: string) => void;
  joinQueue: (id: string) => void;
  leaveQueue: () => void;
};
const QueueStoreContext = createContext<QueueStore | null>(null);

export function QueueStoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [state, setState] = useState<State>({ services: initialServices, queues: initialQueues, nowServing: {}, history: [], sequence: 100 });
  // Update synchronously too, so repeated clicks cannot use a stale queue snapshot.
  const latest = useRef(state);
  const update = (change: (current: State) => State) => {
    latest.current = change(latest.current);
    setState(latest.current);
  };
  const archive = (current: State, serviceId: string, entry: QueueEntry, outcome: QueueVisit['outcome']) => {
    if (!entry.accountId) return current.history;
    const visit: QueueVisit = {
      ...entry, accountId: entry.accountId, serviceId,
      serviceName: current.services.find(s => s.id === serviceId)?.name ?? 'Deleted service',
      endedAt: new Date().toISOString(), outcome,
    };
    return [visit, ...current.history];
  };
  const toggleQueue = (id: string) => update(s => ({ ...s, services: s.services.map(v => v.id === id ? { ...v, isOpen: !v.isOpen } : v) }));
  const saveService = (input: ServiceInput, id?: string) => {
    const current = latest.current;
    const existing = current.services.find(s => s.id === id);
    if (id && !existing) throw new Error('Service no longer exists.');
    const service: Service = existing ? { ...existing, ...input } : { ...input, id: `svc-${Date.now()}-${current.sequence}`, isOpen: false, ticketPrefix: input.name.trim().charAt(0).toUpperCase() || 'Q' };
    update(s => ({ ...s, sequence: s.sequence + 1, services: existing ? s.services.map(v => v.id === id ? service : v) : [...s.services, service], queues: existing ? s.queues : { ...s.queues, [service.id]: [] } }));
    return service;
  };
  const deleteService = (id: string) => update(s => {
    let history = s.history;
    for (const entry of [...(s.queues[id] ?? []), ...(s.nowServing[id] ? [s.nowServing[id]!.entry] : [])]) {
      history = archive({ ...s, history }, id, entry, 'cancelled');
    }
    const { [id]: removedQueue, ...queues } = s.queues;
    const { [id]: removedServing, ...nowServing } = s.nowServing;
    return { ...s, services: s.services.filter(v => v.id !== id), queues, nowServing, history };
  });
  const moveEntry = (id: string, entryId: string, direction: -1 | 1) => update(s => {
    const list = [...(s.queues[id] ?? [])];
    const from = list.findIndex(e => e.id === entryId), to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return s;
    [list[from], list[to]] = [list[to], list[from]];
    return { ...s, queues: { ...s.queues, [id]: list } };
  });
  const removeEntry = (id: string, entryId: string) => update(s => {
    const entry = s.queues[id]?.find(e => e.id === entryId);
    if (!entry) return s;
    return { ...s, queues: { ...s.queues, [id]: s.queues[id].filter(e => e.id !== entryId) }, history: archive(s, id, entry, 'removed') };
  });
  const completeService = (id: string) => update(s => {
    const serving = s.nowServing[id];
    if (!serving) return s;
    return { ...s, nowServing: { ...s.nowServing, [id]: undefined }, history: archive(s, id, serving.entry, 'served') };
  });
  const serveNext = (id: string) => update(s => {
    const [next, ...rest] = s.queues[id] ?? [];
    if (!next || s.nowServing[id]) return s;
    return { ...s, queues: { ...s.queues, [id]: rest }, nowServing: { ...s.nowServing, [id]: { entry: next, startedAt: new Date().toISOString() } } };
  });
  const joinQueue = (id: string) => {
    const account = session?.account;
    if (!account) throw new Error('Please sign in before joining a queue.');
    if (account.role !== 'client') throw new Error('Sign in with a client account to join a queue.');
    update(s => {
      const service = s.services.find(v => v.id === id);
      if (!service) throw new Error('This service is no longer available.');
      if (!service.isOpen) throw new Error('This service is currently closed.');
      if (Object.values(s.queues).some(q => q.some(e => e.accountId === account.id)) || Object.values(s.nowServing).some(v => v?.entry.accountId === account.id)) throw new Error('You already have an active queue visit.');
      const sequence = s.sequence + 1;
      const entry: QueueEntry = { id: `visit-${sequence}`, accountId: account.id, name: account.displayName, ticket: `${service.ticketPrefix}${sequence}`, joinedAt: new Date().toISOString() };
      return { ...s, sequence, queues: { ...s.queues, [id]: [...(s.queues[id] ?? []), entry] } };
    });
  };
  const leaveQueue = () => {
    const account = session?.account;
    if (!account) throw new Error('Please sign in first.');
    update(s => {
      if (Object.values(s.nowServing).some(v => v?.entry.accountId === account.id)) throw new Error('Your service has started. Please contact staff.');
      const id = Object.keys(s.queues).find(id => s.queues[id].some(e => e.accountId === account.id));
      if (!id) throw new Error('You are not waiting in a queue.');
      const entry = s.queues[id].find(e => e.accountId === account.id)!;
      return { ...s, queues: { ...s.queues, [id]: s.queues[id].filter(e => e.id !== entry.id) }, history: archive(s, id, entry, 'left') };
    });
  };
  return <QueueStoreContext.Provider value={{ ...state, toggleQueue, saveService, deleteService, moveEntry, removeEntry, serveNext, completeService, joinQueue, leaveQueue }}>{children}</QueueStoreContext.Provider>;
}
export function useQueueStore() {
  const store = useContext(QueueStoreContext);
  if (!store) throw new Error('useQueueStore must be used inside QueueStoreProvider');
  return store;
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

export function estimatedWait(service: Service, queueLength: number) {
  return service.durationMinutes * queueLength;
}
