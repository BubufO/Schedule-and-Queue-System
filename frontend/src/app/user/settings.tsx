import React from 'react';
import { Screen, SectionLabel } from '@/components/ui';
import ProfileSettingsForm from '@/components/profile-settings-form';
import { UserNav } from '@/components/user-nav';

// The form loads and saves the signed-in account itself (see profile-settings-form.tsx).
export default function UserSettingsScreen() {
  return (
    <Screen title="Profile settings" subtitle="Edit account and notification preferences" nav={<UserNav />}>
      <SectionLabel>Account</SectionLabel>
      <ProfileSettingsForm />
    </Screen>
  );
}
