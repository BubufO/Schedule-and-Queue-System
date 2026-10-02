// Session state for the whole app, mirroring how queue-store.tsx holds queue state.
//
// Screens read the signed-in account from here and never touch @/lib/api themselves, so
// pointing this at the real backend is a change inside @/lib/api, not in any screen.

import type { Href } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { login as apiLogin, logout as apiLogout } from '@/lib/api/auth';
import type { Role, Session } from '@/lib/types';

type AuthStore = {
  session: Session | null;
  signIn: (username: string, password: string) => Promise<Session>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  // Rejects with an ApiError the caller shows to the user; the session only changes on success.
  const signIn = async (username: string, password: string) => {
    const next = await apiLogin(username, password);
    setSession(next);
    return next;
  };

  // Clears locally even if the gateway rejects the call, so a stale token can't strand anyone.
  const signOut = async () => {
    try {
      if (session) await apiLogout(session.token);
    } finally {
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider value={{ session, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const store = useContext(AuthContext);
  if (!store) throw new Error('useAuth must be used inside AuthProvider');
  return store;
}

// Where each role lands after signing in.
export const homeForRole: Record<Role, Href> = {
  client: '/user',
  admin: '/admin',
};

export const roleLabel: Record<Role, string> = {
  client: 'Client',
  admin: 'Administrator',
};
