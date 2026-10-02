// Dummy user table standing in for the `users` table the Authentication Service will own.
//
// Passwords sit here in plain text on purpose. Make sure to remove these later.
// The real backend hashes them with passlib/bcrypt before they ever reach the database.

import type { Account } from '@/lib/types';

export type StoredAccount = Account & { password: string };

export const accounts: StoredAccount[] = [
  {
    id: 'usr-admin',
    username: 'admin',
    password: 'password',
    displayName: 'Reception Admin',
    role: 'admin',
  },
  {
    id: 'usr-client',
    username: 'user',
    password: 'password',
    displayName: 'Jordan Reyes',
    role: 'client',
  },
];

// Shown on the login screen so anyone demoing the app can get in.
export const demoAccounts = accounts.map(({ username, password, role }) => ({
  username,
  password,
  role,
}));
