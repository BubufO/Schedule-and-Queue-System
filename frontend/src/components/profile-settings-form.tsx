// Profile settings form, shared by the user and admin settings screens.
//
// Loads the signed-in account from the backend, checks fields with the same rules as the
// register screen, and saves through backend/app/routers/profile.py, which re-checks them.
// Only fields that changed are sent. A password change is a separate call.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, Field, TextField } from '@/components/ui';
import { changePassword, getProfile, updateProfile } from '@/lib/api/profile';
import { useAuth } from '@/lib/auth-store';
import { messageOf } from '@/lib/queue-store';
import { Spacing } from '@/lib/theme';
import type { Profile, ProfileChanges } from '@/lib/types';
import { useTheme } from '@/lib/use-theme';
import {
  normalizePhone,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePhone,
  validateUsername,
} from '@/lib/validation';

type FormValues = {
  displayName: string;
  username: string;
  email: string;
  phone: string;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyInApp: boolean;
};

type Notice = { ok: boolean; text: string };

function toForm(profile: Profile): FormValues {
  return {
    displayName: profile.displayName,
    username: profile.username,
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    notifyEmail: profile.notifyEmail,
    notifySms: profile.notifySms,
    notifyInApp: profile.notifyInApp,
  };
}

// The fields that differ from the saved profile, in the form the backend stores them.
function changesFrom(saved: Profile, values: FormValues): ProfileChanges {
  const changes: ProfileChanges = {};
  const displayName = values.displayName.trim();
  const username = values.username.trim().toLowerCase();
  const email = values.email.trim().toLowerCase();
  const phone = normalizePhone(values.phone);
  if (displayName !== saved.displayName) changes.displayName = displayName;
  if (username !== saved.username) changes.username = username;
  if (email !== (saved.email ?? '')) changes.email = email;
  if (phone !== (saved.phone ?? '')) changes.phone = phone;
  if (values.notifyEmail !== saved.notifyEmail) changes.notifyEmail = values.notifyEmail;
  if (values.notifySms !== saved.notifySms) changes.notifySms = values.notifySms;
  if (values.notifyInApp !== saved.notifyInApp) changes.notifyInApp = values.notifyInApp;
  return changes;
}

export default function ProfileSettingsForm() {
  const theme = useTheme();
  const { updateAccount } = useAuth();
  const [saved, setSaved] = useState<Profile | null>(null);
  const [values, setValues] = useState<FormValues | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const profile = await getProfile();
      setSaved(profile);
      setValues(toForm(profile));
    } catch (e) {
      setLoadError(messageOf(e, 'Unable to load your profile.'));
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!saved || !values) {
    return (
      <Card>
        {loadError ? (
          <>
            <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>{loadError}</ThemedText>
            <AppButton label="Try again" onPress={load} />
          </>
        ) : (
          <ThemedText>Loading your profile…</ThemedText>
        )}
      </Card>
    );
  }

  const set = (changes: Partial<FormValues>) => setValues({ ...values, ...changes });
  const changingPassword = !!(currentPassword || newPassword || confirmPassword);

  const validate = () => {
    const e: Record<string, string | undefined> = {
      displayName: validateDisplayName(values.displayName),
      username: validateUsername(values.username),
      // Email is optional only for accounts that never had one (the demo accounts).
      email: values.email.trim()
        ? validateEmail(values.email)
        : saved.email
          ? 'Email is required.'
          : undefined,
      phone: validatePhone(values.phone, values.notifySms),
    };
    if (changingPassword) {
      e.currentPassword = currentPassword ? undefined : 'Enter your current password.';
      e.newPassword =
        validatePassword(newPassword) ??
        (newPassword === currentPassword ? 'Choose a password different from your current one.' : undefined);
      e.confirmPassword = newPassword === confirmPassword ? undefined : 'Passwords do not match.';
    }
    const found = Object.fromEntries(Object.entries(e).filter(([, message]) => message)) as Record<string, string>;
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const handleSave = async () => {
    setNotice(null);
    if (!validate()) return;
    const changes = changesFrom(saved, values);
    if (!Object.keys(changes).length && !changingPassword) {
      setNotice({ ok: true, text: 'Nothing to save.' });
      return;
    }
    setSaving(true);
    try {
      if (Object.keys(changes).length) {
        const profile = await updateProfile(changes);
        setSaved(profile);
        setValues(toForm(profile));
        const { notifyEmail: _email, notifySms: _sms, notifyInApp: _inApp, ...account } = profile;
        updateAccount(account);
      }
      if (changingPassword) {
        await changePassword(currentPassword, newPassword);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
      setNotice({ ok: true, text: 'Saved.' });
    } catch (e) {
      setNotice({ ok: false, text: messageOf(e, 'Unable to save your changes.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Field label="Display name" required error={errors.displayName}>
        <TextField value={values.displayName} onChangeText={(v) => set({ displayName: v })} maxLength={60} />
      </Field>

      <Field label="Username" required error={errors.username}>
        <TextField autoCapitalize="none" value={values.username} onChangeText={(v) => set({ username: v })} maxLength={32} />
      </Field>

      <Field label="Email" required={!!saved.email} error={errors.email}>
        <TextField
          keyboardType="email-address"
          autoCapitalize="none"
          value={values.email}
          onChangeText={(v) => set({ email: v })}
          maxLength={254}
        />
      </Field>

      <Field label="Phone" hint="Needed for text notifications." error={errors.phone}>
        <TextField keyboardType="phone-pad" value={values.phone} onChangeText={(v) => set({ phone: v })} maxLength={32} />
      </Field>

      <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>Change password</ThemedText>
      <Field label="Current password" error={errors.currentPassword}>
        <TextField secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} maxLength={128} />
      </Field>
      <Field label="New password" error={errors.newPassword}>
        <TextField secureTextEntry value={newPassword} onChangeText={setNewPassword} maxLength={128} />
      </Field>
      <Field label="Confirm password" error={errors.confirmPassword}>
        <TextField secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} maxLength={128} />
      </Field>

      <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>Notification preferences</ThemedText>
      <View style={styles.prefRow}>
        <ThemedText>Email</ThemedText>
        <Switch value={values.notifyEmail} onValueChange={(v) => set({ notifyEmail: v })} />
      </View>
      <View style={styles.prefRow}>
        <ThemedText>SMS</ThemedText>
        <Switch value={values.notifySms} onValueChange={(v) => set({ notifySms: v })} />
      </View>
      <View style={styles.prefRow}>
        <ThemedText>In-app</ThemedText>
        <Switch value={values.notifyInApp} onValueChange={(v) => set({ notifyInApp: v })} />
      </View>

      {notice ? (
        <ThemedText
          type="small"
          accessibilityRole={notice.ok ? undefined : 'alert'}
          style={{ color: notice.ok ? theme.success : theme.danger, marginTop: Spacing.two }}>
          {notice.text}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <AppButton label={saving ? 'Saving…' : 'Save changes'} variant="primary" onPress={handleSave} disabled={saving} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  actions: {
    marginTop: Spacing.three,
    alignItems: 'flex-end',
  },
});
