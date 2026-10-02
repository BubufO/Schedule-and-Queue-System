// Domain model. Kept separate from mock-data so it survives the switch to a real API.

export type Priority = 'low' | 'medium' | 'high';

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priority: Priority;
  isOpen: boolean;
  ticketPrefix: string;
};

export type QueueEntry = {
  id: string;
  accountId?: string;
  name: string;
  ticket: string;
  joinedAt: string;
};

export type Role = 'client' | 'admin';

export type Account = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};

export type Session = {
  token: string;
  account: Account;
};

export type QueueVisit = QueueEntry & {
  accountId: string;
  serviceId: string;
  serviceName: string;
  endedAt: string;
  outcome: 'served' | 'left' | 'removed' | 'cancelled';
};
