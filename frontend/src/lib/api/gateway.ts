// Dummy API gateway: the "API Gateway (auth check, routing)" box from the architecture
// diagram, standing in for the FastAPI app in /backend until it is built.
//
// Every call enters through request(). The gateway resolves the bearer token, enforces the
// role the route requires, and only then dispatches to the handler standing in for a
// backend service. Screens never reach a handler directly, exactly as they will never
// reach a FastAPI router directly.
//
// Swapping in the real backend means replacing the body of request() with a fetch() --
// nothing above this file changes.

import { accounts, demoVerificationCode, type StoredAccount } from '@/lib/api/accounts';
import type {
  RegistrationInput,
  Session,
  VerificationChallenge,
  VerificationChannel,
} from '@/lib/types';
import {
  normalizePhone,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePhone,
  validateUsername,
} from '@/lib/validation';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Simulated round trip, so we can see the loading states. (remove this when the real backend is in place)
const LatencyMs = 450;

// What the gateway demands of a caller before it will route the request:
// 'public' skips the check, 'user' needs any signed-in account, 'admin' needs the role.
type Requirement = 'public' | 'user' | 'admin';

type RequestContext = { body: Record<string, unknown>; session: Session | null };
type Route = { requires: Requirement; handler: (ctx: RequestContext) => unknown };

// Issued tokens, held in memory only: a reload signs everybody out.
const sessions = new Map<string, Session>();
let tokenCounter = 0;

function issueSession(stored: StoredAccount): Session {
  const { password: _password, ...account } = stored;
  const token = `dummy-token-${++tokenCounter}-${account.id}`;
  const session: Session = { token, account };
  sessions.set(token, session);
  return session;
}

// Accounts that registered but have not confirmed their code yet, keyed by verification id.
// The real Authentication Service keeps these as `users` rows with is_verified = false.
type PendingRegistration = {
  account: StoredAccount;
  channel: VerificationChannel;
  code: string;
  expiresAt: number;
  resendAvailableAt: number;
  attemptsLeft: number;
};

const pending = new Map<string, PendingRegistration>();
let verificationCounter = 0;
let accountCounter = 0;

const CodeLifetimeMs = 10 * 60 * 1000;
const ResendCooldownMs = 30 * 1000;
const MaxCodeAttempts = 5;

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}•••@${domain}`;
}

function maskPhone(phone: string) {
  return `•••• ${phone.slice(-4)}`;
}

function channelsFor(account: StoredAccount): VerificationChannel[] {
  return account.phone ? ['email', 'sms'] : ['email'];
}

// Stands in for the email/SMS provider: a fresh code goes out and the clock restarts.
function sendCode(id: string, entry: PendingRegistration): VerificationChallenge {
  const now = Date.now();
  entry.code = demoVerificationCode;
  entry.expiresAt = now + CodeLifetimeMs;
  entry.resendAvailableAt = now + ResendCooldownMs;
  entry.attemptsLeft = MaxCodeAttempts;
  const destination =
    entry.channel === 'sms' ? maskPhone(entry.account.phone!) : maskEmail(entry.account.email!);
  console.info(`[dummy gateway] verification code for ${destination}: ${entry.code}`);
  return {
    verificationId: id,
    channel: entry.channel,
    destination,
    expiresAt: new Date(entry.expiresAt).toISOString(),
    resendAvailableAt: new Date(entry.resendAvailableAt).toISOString(),
    channels: channelsFor(entry.account),
  };
}

function findPending(body: Record<string, unknown>) {
  const id = String(body.verificationId ?? '');
  const entry = pending.get(id);
  if (!entry) throw new ApiError(404, 'This verification has ended. Register again to get a new code.');
  return { id, entry };
}

// The route table. Queue and service routes slot in here as the backend grows.
const routes: Record<string, Route> = {
  'POST /auth/login': {
    requires: 'public',
    handler: ({ body }) => {
      const username = String(body.username ?? '')
        .trim()
        .toLowerCase();
      const password = String(body.password ?? '');
      const match = accounts.find((a) => a.username === username);
      // One message for both failures, so the response never confirms a username exists.
      if (!match || match.password !== password) {
        throw new ApiError(401, 'Incorrect username or password.');
      }
      return issueSession(match);
    },
  },

  'POST /auth/register': {
    requires: 'public',
    handler: ({ body }) => {
      const input = body as Partial<RegistrationInput>;
      const displayName = String(input.displayName ?? '').trim();
      const username = String(input.username ?? '').trim().toLowerCase();
      const password = String(input.password ?? '');
      const email = String(input.email ?? '').trim().toLowerCase();
      const phone = normalizePhone(String(input.phone ?? ''));
      const channel: VerificationChannel = input.channel === 'sms' ? 'sms' : 'email';

      const invalid =
        validateDisplayName(displayName) ??
        validateUsername(username) ??
        validatePassword(password) ??
        validateEmail(email) ??
        validatePhone(phone, channel === 'sms');
      if (invalid) throw new ApiError(422, invalid);

      // A pending registration holds its username and email until it is verified or expires.
      const now = Date.now();
      for (const [id, entry] of pending) if (entry.expiresAt < now) pending.delete(id);
      const taken = [...accounts, ...[...pending.values()].map((p) => p.account)];
      if (taken.some((a) => a.username === username)) {
        throw new ApiError(409, 'That username is already taken.');
      }
      if (taken.some((a) => a.email === email)) {
        throw new ApiError(409, 'An account with that email already exists. Try signing in.');
      }

      const id = `ver-${++verificationCounter}`;
      const entry: PendingRegistration = {
        account: {
          id: `usr-${++accountCounter}-${username}`,
          username,
          password,
          displayName,
          role: 'client',
          email,
          phone: phone || undefined,
        },
        channel,
        code: '',
        expiresAt: 0,
        resendAvailableAt: 0,
        attemptsLeft: 0,
      };
      pending.set(id, entry);
      return sendCode(id, entry);
    },
  },

  'POST /auth/verify': {
    requires: 'public',
    handler: ({ body }) => {
      const { id, entry } = findPending(body);
      if (Date.now() > entry.expiresAt) {
        throw new ApiError(410, 'This code has expired. Send a new one.');
      }
      if (entry.attemptsLeft <= 0) {
        throw new ApiError(429, 'Too many incorrect attempts. Send a new code.');
      }
      if (String(body.code ?? '').trim() !== entry.code) {
        entry.attemptsLeft -= 1;
        throw new ApiError(
          400,
          entry.attemptsLeft > 0
            ? `That code is incorrect. ${entry.attemptsLeft} ${entry.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`
            : 'Too many incorrect attempts. Send a new code.',
        );
      }
      pending.delete(id);
      accounts.push(entry.account);
      return issueSession(entry.account);
    },
  },

  'POST /auth/verify/resend': {
    requires: 'public',
    handler: ({ body }) => {
      const { id, entry } = findPending(body);
      const waitMs = entry.resendAvailableAt - Date.now();
      if (waitMs > 0) {
        throw new ApiError(429, `Wait ${Math.ceil(waitMs / 1000)}s before sending another code.`);
      }
      if (body.channel === 'sms' || body.channel === 'email') {
        if (!channelsFor(entry.account).includes(body.channel)) {
          throw new ApiError(422, 'No phone number on this account to text.');
        }
        entry.channel = body.channel;
      }
      return sendCode(id, entry);
    },
  },

  'GET /auth/me': {
    requires: 'user',
    handler: ({ session }) => session!.account,
  },

  'POST /auth/logout': {
    requires: 'user',
    handler: ({ session }) => {
      sessions.delete(session!.token);
      return null;
    },
  },
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function request<T>(
  route: string,
  options: { body?: Record<string, unknown>; token?: string } = {},
): Promise<T> {
  await delay(LatencyMs);

  const matched = routes[route];
  if (!matched) throw new ApiError(404, `No route for ${route}.`);

  // The auth check, ahead of routing: this is the FastAPI
  // `dependencies=[Depends(get_current_user)]` the real gateway will carry.
  const session = options.token ? sessions.get(options.token) ?? null : null;
  if (matched.requires !== 'public') {
    if (!session) throw new ApiError(401, 'Your session has expired. Sign in again.');
    if (matched.requires === 'admin' && session.account.role !== 'admin') {
      throw new ApiError(403, 'Administrator access required.');
    }
  }

  return matched.handler({ body: options.body ?? {}, session }) as T;
}
