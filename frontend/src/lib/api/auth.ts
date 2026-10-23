// Authentication module client for the FastAPI backend (backend/app/routers/auth.py).
//
// Calls that need a signed-in user rely on the token apiFetch() sends; auth-store.tsx sets it.

import { apiFetch } from '@/lib/api/client';
import type {
  Account,
  RegistrationInput,
  Session,
  VerificationChallenge,
  VerificationChannel,
} from '@/lib/types';

// There is no email or SMS provider yet, so the backend issues this code for every
// verification (DEMO_VERIFICATION_CODE in backend/app/routers/auth.py).
export const demoVerificationCode = '123456';

export function login(username: string, password: string) {
  return apiFetch<Session>('POST', '/auth/login', { username, password });
}

export function logout() {
  return apiFetch<void>('POST', '/auth/logout');
}

export function me() {
  return apiFetch<Account>('GET', '/auth/me');
}

// Creates a pending client account and sends a code; nothing is signed in until verify().
export function register(input: RegistrationInput) {
  return apiFetch<VerificationChallenge>('POST', '/auth/register', input);
}

// Confirms the code and returns a session for the now-active account.
export function verify(verificationId: string, code: string) {
  return apiFetch<Session>('POST', '/auth/verify', { verificationId, code });
}

// Sends a fresh code, optionally through a different channel than last time.
export function resendVerification(verificationId: string, channel?: VerificationChannel) {
  return apiFetch<VerificationChallenge>('POST', '/auth/verify/resend', { verificationId, channel });
}
