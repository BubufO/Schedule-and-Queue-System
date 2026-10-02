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

import { accounts, type StoredAccount } from '@/lib/api/accounts';
import type { Session } from '@/lib/types';

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
