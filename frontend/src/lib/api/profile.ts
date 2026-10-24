// Profile settings client for the FastAPI backend (backend/app/routers/profile.py).
//
// Every call works on the signed-in account, identified by the token apiFetch() sends,
// so no user id is passed.

import { apiFetch } from '@/lib/api/client';
import type { Profile, ProfileChanges } from '@/lib/types';

export function getProfile() {
  return apiFetch<Profile>('GET', '/profile');
}

// Sends only the changed fields; returns the saved profile.
export function updateProfile(changes: ProfileChanges) {
  return apiFetch<Profile>('PATCH', '/profile', changes);
}

// Signs out the account's other sessions; this one stays signed in.
export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<void>('POST', '/profile/password', { currentPassword, newPassword });
}
