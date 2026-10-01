// In-memory store shared by the admin screens so actions on one tab show up on the others.
// UI simulation only: nothing is persisted and resets on reload.

import { createContext, useContext, useState, type ReactNode } from 'react';

import {
  initialQueues,
  initialServices,
  type Priority,
  type QueueEntry,
  type Service,
} from '@/data/mock-data';

export type ServiceInput = {
  name: string;
  description: string;
  durationMinutes: number;
  priority: Priority;
};

export type NowServing = { entry: QueueEntry; startedAt: string };

type AdminStore = {
  services: Service[];
  queues: Record<string, QueueEntry[]>;
  nowServing: Record<string, NowServing | undefined>;
  toggleQueue: (serviceId: string) => void;
  saveService: (input: ServiceInput, id?: string) => Service;
  deleteService: (serviceId: string) => void;
  moveEntry: (serviceId: string, entryId: string, direction: -1 | 1) => void;
  removeEntry: (serviceId: string, entryId: string) => void;
  serveNext: (serviceId: string) => void;
};

const AdminStoreContext = createContext<AdminStore | null>(null);

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function AdminStoreProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [queues, setQueues] = useState<Record<string, QueueEntry[]>>(initialQueues);
  const [nowServing, setNowServing] = useState<Record<string, NowServing | undefined>>({});

  const toggleQueue = (serviceId: string) => {
    setServices((prev) => prev.map((s) => (s.id === serviceId ? { ...s, isOpen: !s.isOpen } : s)));
  };

  const saveService = (input: ServiceInput, id?: string) => {
    if (id) {
      const existing = services.find((s) => s.id === id)!;
      const updated = { ...existing, ...input };
      setServices((prev) => prev.map((s) => (s.id === id ? updated : s)));
      return updated;
    }
    const created: Service = {
      ...input,
      id: `svc-${Date.now()}`,
      isOpen: false,
      ticketPrefix: input.name.trim().charAt(0).toUpperCase() || 'Q',
    };
    setServices((prev) => [...prev, created]);
    setQueues((prev) => ({ ...prev, [created.id]: [] }));
    return created;
  };

  const deleteService = (serviceId: string) => {
    setServices((prev) => prev.filter((s) => s.id !== serviceId));
    setQueues(({ [serviceId]: _removed, ...rest }) => rest);
    setNowServing(({ [serviceId]: _removed, ...rest }) => rest);
  };

  const moveEntry = (serviceId: string, entryId: string, direction: -1 | 1) => {
    setQueues((prev) => {
      const list = [...(prev[serviceId] ?? [])];
      const from = list.findIndex((e) => e.id === entryId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return prev;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...prev, [serviceId]: list };
    });
  };

  const removeEntry = (serviceId: string, entryId: string) => {
    setQueues((prev) => ({
      ...prev,
      [serviceId]: (prev[serviceId] ?? []).filter((e) => e.id !== entryId),
    }));
  };

  const serveNext = (serviceId: string) => {
    const [next, ...rest] = queues[serviceId] ?? [];
    if (!next) return;
    setQueues((prev) => ({ ...prev, [serviceId]: rest }));
    setNowServing((prev) => ({ ...prev, [serviceId]: { entry: next, startedAt: timeNow() } }));
  };

  return (
    <AdminStoreContext.Provider
      value={{
        services,
        queues,
        nowServing,
        toggleQueue,
        saveService,
        deleteService,
        moveEntry,
        removeEntry,
        serveNext,
      }}>
      {children}
    </AdminStoreContext.Provider>
  );
}

export function useAdminStore() {
  const store = useContext(AdminStoreContext);
  if (!store) throw new Error('useAdminStore must be used inside AdminStoreProvider');
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
