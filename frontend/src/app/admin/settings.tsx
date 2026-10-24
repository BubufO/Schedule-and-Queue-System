import React from 'react';
import { Screen, SectionLabel } from '@/components/ui';
import ProfileSettingsForm from '@/components/profile-settings-form';
import { AdminNav } from '@/components/admin-nav';

// Admins edit the same profile fields as users. Extend later with admin-specific settings.
export default function AdminSettingsScreen() {
  return (
    <Screen title="Admin settings" subtitle="Edit account and notification preferences" nav={<AdminNav />}>
      <SectionLabel>Account</SectionLabel>
      <ProfileSettingsForm />
    </Screen>
  );
}
