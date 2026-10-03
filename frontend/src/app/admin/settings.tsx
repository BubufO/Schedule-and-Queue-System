import React from 'react';
import { Screen, SectionLabel } from '@/components/ui';
import ProfileSettingsForm, { ProfileValues } from '@/components/profile-settings-form';
import { AdminNav } from '@/components/admin-nav';
import { useAuth } from '@/lib/auth-store';

// Admin can edit same profile fields. Extend later with admin-specific settings.
export default function AdminSettingsScreen() {
  const { session } = useAuth();
  const account = session?.account;

  const initial: ProfileValues = {
    displayName: account?.displayName ?? '',
    username: account?.username ?? '',
    email: '',
    notifyEmail: true,
    notifySms: false,
    notifyInApp: true,
  };

  const handleSave = async (values: ProfileValues & { passwordChange?: { current: string; next: string } | null }) => {
    console.log('Save admin profile (frontend-only):', values);
    return;
  };

  return (
    <Screen title="Admin settings" subtitle="Edit account and notification preferences" nav={<AdminNav />}>
      <SectionLabel>Account</SectionLabel>
      <ProfileSettingsForm initial={initial} onSave={handleSave} />
    </Screen>
  );
}