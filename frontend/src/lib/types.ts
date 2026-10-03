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
  email?: string;
  phone?: string;
};

export type Session = {
  token: string;
  account: Account;
};

// Where a verification code is sent: 'email' or a text message to the phone number.
export type VerificationChannel = 'email' | 'sms';

// Body of POST /auth/register. Self-registration always creates a client account.
export type RegistrationInput = {
  displayName: string;
  username: string;
  password: string;
  email: string;
  phone?: string;
  channel: VerificationChannel;
};

// Returned by register and resend: the account stays pending until the code is confirmed.
export type VerificationChallenge = {
  verificationId: string;
  channel: VerificationChannel;
  destination: string; // masked, e.g. j•••@example.com or •••• 4821
  expiresAt: string; // ISO string
  resendAvailableAt: string; // ISO string
  channels: VerificationChannel[]; // every channel this account can be verified through
};

export type QueueVisit = QueueEntry & {
  accountId: string;
  serviceId: string;
  serviceName: string;
  endedAt: string;
  outcome: 'served' | 'left' | 'removed' | 'cancelled';
};

// Notification shape used by UI and (later) backend.
export type Notification = {
  id: string;
  type?: 'joined' | 'update' | 'turn' | 'service' | 'history' | string;
  title?: string;
  message: string;
  timestamp?: string; // ISO string
  serviceId?: string;
  oldPosition?: number;
  newPosition?: number;
};
