import React from 'react';
import { Screen, SectionLabel } from '@/components/ui';
import ProfileSettingsForm, { ProfileValues } from '@/components/profile-settings-form';
import { UserNav } from '@/components/user-nav';
import { useAuth } from '@/lib/auth-store';

// Front-end only: read current user from useAuth(), save is a no-op (console.log) for now.
export default function UserSettingsScreen() {
  const { session } = useAuth();
  const account = session?.account;

  const initial: ProfileValues = {
    displayName: account?.displayName ?? '',
    username: account?.username ?? '',
    email: '', // if you have email stored, fill here
    notifyEmail: true,
    notifySms: false,
    notifyInApp: true,
  };

  const handleSave = async (values: ProfileValues & { passwordChange?: { current: string; next: string } | null }) => {
    // Replace with API call when ready.
    console.log('Save user profile (frontend-only):', values);
    // Optionally update local auth store if you implement updateProfile in useAuth().
    return;
  };

  return (
    <Screen title="Profile settings" subtitle="Edit account and notification preferences" nav={<UserNav />}>
      <SectionLabel>Account</SectionLabel>
      <ProfileSettingsForm initial={initial} onSave={handleSave} />
    </Screen>
  );
}