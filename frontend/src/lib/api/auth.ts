// Authentication Service client. The typed calls screens use; the gateway does the routing.

import { request } from '@/lib/api/gateway';
import type {
  Account,
  RegistrationInput,
  Session,
  VerificationChallenge,
  VerificationChannel,
} from '@/lib/types';

export function login(username: string, password: string) {
  return request<Session>('POST /auth/login', { body: { username, password } });
}

export function logout(token: string) {
  return request<null>('POST /auth/logout', { token });
}

export function me(token: string) {
  return request<Account>('GET /auth/me', { token });
}

// Creates a pending client account and sends a code; nothing is signed in until verify().
export function register(input: RegistrationInput) {
  return request<VerificationChallenge>('POST /auth/register', { body: input });
}

// Confirms the code and returns a session for the now-active account.
export function verify(verificationId: string, code: string) {
  return request<Session>('POST /auth/verify', { body: { verificationId, code } });
}

// Sends a fresh code, optionally through a different channel than last time.
export function resendVerification(verificationId: string, channel?: VerificationChannel) {
  return request<VerificationChallenge>('POST /auth/verify/resend', {
    body: { verificationId, channel },
  });
}
