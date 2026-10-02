// Authentication Service client. The typed calls screens use; the gateway does the routing.

import { request } from '@/lib/api/gateway';
import type { Account, Session } from '@/lib/types';

export function login(username: string, password: string) {
  return request<Session>('POST /auth/login', { body: { username, password } });
}

export function logout(token: string) {
  return request<null>('POST /auth/logout', { token });
}

export function me(token: string) {
  return request<Account>('GET /auth/me', { token });
}
