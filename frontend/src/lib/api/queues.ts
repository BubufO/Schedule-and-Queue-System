// Service Management and Queue Management clients for the FastAPI backend.
//
// The backend's JSON already matches our types for services. Queue entries are mapped here
// so the rest of the app keeps using `accountId` for the signed-in user who owns an entry.

import { apiFetch } from '@/lib/api/client';
import type { Notification } from '@/lib/types';
import type { Priority, QueueEntry, QueueVisit, Service } from '@/lib/types';

export type ServiceInput = {
  name: string;
  description: string;
  durationMinutes: number;
  priority: Priority;
};

export type ServiceChanges = Partial<ServiceInput & { isOpen: boolean }>;

type EntryDto = {
  id: string;
  serviceId: string;
  name: string;
  ticket: string;
  joinedAt: string;
  priority: Priority;
  userId: string | null;
  position?: number;
  estimatedWaitMinutes?: number;
};

type ServingDto = { entry: EntryDto; startedAt: string };

type QueueDto = {
  serviceId: string;
  serviceName: string;
  isOpen: boolean;
  waiting: EntryDto[];
  nowServing: ServingDto | null;
  estimatedWaitMinutes: number;
};

type VisitDto = EntryDto & {
  serviceName: string;
  endedAt: string;
  outcome: QueueVisit['outcome'];
};

export type QueueSnapshot = {
  serviceId: string;
  waiting: QueueEntry[];
  nowServing: { entry: QueueEntry; startedAt: string } | null;
};

function toEntry(dto: EntryDto): QueueEntry {
  return {
    id: dto.id,
    accountId: dto.userId ?? undefined,
    name: dto.name,
    ticket: dto.ticket,
    joinedAt: dto.joinedAt,
    priority: dto.priority,
    position: dto.position,
    estimatedWaitMinutes: dto.estimatedWaitMinutes,
  };
}

function toVisit(dto: VisitDto): QueueVisit {
  return {
    ...toEntry(dto),
    accountId: dto.userId ?? '',
    serviceId: dto.serviceId,
    serviceName: dto.serviceName,
    endedAt: dto.endedAt,
    outcome: dto.outcome,
  };
}

function toSnapshot(dto: QueueDto): QueueSnapshot {
  return {
    serviceId: dto.serviceId,
    waiting: dto.waiting.map(toEntry),
    nowServing: dto.nowServing
      ? { entry: toEntry(dto.nowServing.entry), startedAt: dto.nowServing.startedAt }
      : null,
  };
}

const path = (...parts: string[]) => '/' + parts.map(encodeURIComponent).join('/');

// ---- Service Management ----------------------------------------------------------------

export function listServices() {
  return apiFetch<Service[]>('GET', '/services');
}

export function createService(input: ServiceInput) {
  return apiFetch<Service>('POST', '/services', input);
}

export function updateService(serviceId: string, changes: ServiceChanges) {
  return apiFetch<Service>('PATCH', path('services', serviceId), changes);
}

export function deleteService(serviceId: string) {
  return apiFetch<void>('DELETE', path('services', serviceId));
}

// ---- Queue Management ------------------------------------------------------------------

export async function listQueues() {
  return (await apiFetch<QueueDto[]>('GET', '/queues')).map(toSnapshot);
}

export async function viewQueue(serviceId: string) {
  return toSnapshot(await apiFetch<QueueDto>('GET', path('queues', serviceId)));
}

// Signed-in users pass their account id; guests joining with a link pass only a name.
export async function joinQueue(serviceId: string, visitor: { name: string; userId?: string }) {
  return toEntry(await apiFetch<EntryDto>('POST', path('queues', serviceId, 'join'), visitor));
}

export async function leaveQueue(
  serviceId: string,
  who: { userId: string } | { entryId: string },
) {
  return toVisit(await apiFetch<VisitDto>('POST', path('queues', serviceId, 'leave'), who));
}

export async function serveNext(serviceId: string) {
  const serving = await apiFetch<ServingDto>('POST', path('queues', serviceId, 'serve-next'));
  return { entry: toEntry(serving.entry), startedAt: serving.startedAt };
}

export async function completeService(serviceId: string) {
  return toVisit(await apiFetch<VisitDto>('POST', path('queues', serviceId, 'complete')));
}

export function removeEntry(serviceId: string, entryId: string) {
  return apiFetch<void>('DELETE', path('queues', serviceId, 'entries', entryId));
}

export async function moveEntry(serviceId: string, entryId: string, direction: 'up' | 'down') {
  const queue = await apiFetch<QueueDto>('POST', path('queues', serviceId, 'entries', entryId, 'move'), {
    direction,
  });
  return toSnapshot(queue);
}

export async function visitHistory(userId: string) {
  const visits = await apiFetch<VisitDto[]>('GET', `/queues/history?userId=${encodeURIComponent(userId)}`);
  return visits.map(toVisit);
}

export function listNotifications(userId: string) {
    return apiFetch<Notification[]>('GET', `/notifications?userId=${encodeURIComponent(userId)}`);
}

export function clearNotifications(userId: string) {
    return apiFetch<void>('DELETE', `/notifications?userId=${encodeURIComponent(userId)}`);
}
