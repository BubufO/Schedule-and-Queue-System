// Session state for the whole app, mirroring how queue-store.tsx holds queue state.
//
// Screens read the signed-in account from here and never touch @/lib/api themselves, so
// pointing this at the real backend is a change inside @/lib/api, not in any screen.

import type { Href } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';

import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  resendVerification as apiResendVerification,
  verify as apiVerify,
} from '@/lib/api/auth';
import { setAuthToken } from '@/lib/api/client';
import type {
  Account,
  RegistrationInput,
  Role,
  Session,
  VerificationChallenge,
  VerificationChannel,
} from '@/lib/types';

type AuthStore = {
  session: Session | null;
  // The registration waiting on a code, carried from the register screen to the verify screen.
  pendingVerification: VerificationChallenge | null;
  signIn: (username: string, password: string) => Promise<Session>;
  signOut: () => Promise<void>;
  register: (input: RegistrationInput) => Promise<VerificationChallenge>;
  verify: (code: string) => Promise<Session>;
  resendCode: (channel?: VerificationChannel) => Promise<VerificationChallenge>;
  cancelVerification: () => void;
  // Replaces the signed-in account after profile settings save, so the new name shows everywhere.
  updateAccount: (account: Account) => void;
};

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [pendingVerification, setPendingVerification] = useState<VerificationChallenge | null>(
    null,
  );

  // The token goes to the API client before the session is published, so the queue store's
  // refresh on the new session already sends it.
  const startSession = (next: Session | null) => {
    setAuthToken(next?.token ?? null);
    setSession(next);
  };

  // Rejects with an ApiError the caller shows to the user; the session only changes on success.
  const signIn = async (username: string, password: string) => {
    const next = await apiLogin(username, password);
    startSession(next);
    return next;
  };

  // Clears locally even if the backend rejects the call, so a stale token can't strand anyone.
  const signOut = async () => {
    try {
      if (session) await apiLogout();
    } finally {
      startSession(null);
    }
  };

  const register = async (input: RegistrationInput) => {
    const challenge = await apiRegister(input);
    setPendingVerification(challenge);
    return challenge;
  };

  // A correct code activates the account and signs it in, like signIn does.
  const verify = async (code: string) => {
    if (!pendingVerification) throw new Error('No registration is waiting for a code.');
    const next = await apiVerify(pendingVerification.verificationId, code);
    setPendingVerification(null);
    startSession(next);
    return next;
  };

  const resendCode = async (channel?: VerificationChannel) => {
    if (!pendingVerification) throw new Error('No registration is waiting for a code.');
    const challenge = await apiResendVerification(pendingVerification.verificationId, channel);
    setPendingVerification(challenge);
    return challenge;
  };

  const cancelVerification = () => setPendingVerification(null);

  const updateAccount = (account: Account) => {
    setSession((current) => (current ? { ...current, account } : current));
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        pendingVerification,
        signIn,
        signOut,
        register,
        verify,
        resendCode,
        cancelVerification,
        updateAccount,
      }}>
      {children}
    </AuthContext.Provider>
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

export const channelLabel: Record<VerificationChannel, string> = {
  email: 'Email',
  sms: 'Text message',
};

export const roleLabel: Record<Role, string> = {
  client: 'Client',
  admin: 'Administrator',
};
