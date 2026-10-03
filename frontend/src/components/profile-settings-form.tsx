import React, { useState } from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import { AppButton, Card, Field, TextField } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';

export type ProfileValues = {
  displayName: string;
  username: string;
  email?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyInApp?: boolean;
};

export default function ProfileSettingsForm({
  initial,
  onSave,
}: {
  initial: ProfileValues;
  onSave: (values: ProfileValues & { passwordChange?: { current: string; next: string } | null }) => Promise<void> | void;
}) {
  const theme = useTheme();
  const [values, setValues] = useState<ProfileValues>(initial);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!values.displayName.trim()) e.displayName = 'Display name is required.';
    if (!values.username.trim()) e.username = 'Username is required.';
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) e.currentPassword = 'Current password required to change password.';
      if (newPassword.length < 8) e.newPassword = 'New password must be at least 8 characters.';
      if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload = {
        ...values,
        passwordChange: newPassword ? { current: currentPassword, next: newPassword } : null,
      };
      await Promise.resolve(onSave(payload));
      setNotice('Saved successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setNotice('Save failed. Try again.');
      console.error(err);
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  return (
    <Card>
      <Field label="Display name" required error={errors.displayName}>
        <TextField value={values.displayName} onChangeText={(v) => setValues({ ...values, displayName: v })} />
      </Field>

      <Field label="Username" required error={errors.username}>
        <TextField autoCapitalize="none" value={values.username} onChangeText={(v) => setValues({ ...values, username: v })} />
      </Field>

      <Field label="Email">
        <TextField keyboardType="email-address" autoCapitalize="none" value={values.email} onChangeText={(v) => setValues({ ...values, email: v })} />
      </Field>

      <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>Change password</ThemedText>
      <Field label="Current password" error={errors.currentPassword}>
        <TextField secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
      </Field>
      <Field label="New password" error={errors.newPassword}>
        <TextField secureTextEntry value={newPassword} onChangeText={setNewPassword} />
      </Field>
      <Field label="Confirm password" error={errors.confirmPassword}>
        <TextField secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
      </Field>

      <ThemedText type="smallBold" style={{ marginTop: Spacing.two }}>Notification preferences</ThemedText>
      <View style={styles.prefRow}>
        <ThemedText>Email</ThemedText>
        <Switch value={!!values.notifyEmail} onValueChange={(v) => setValues({ ...values, notifyEmail: v })} />
      </View>
      <View style={styles.prefRow}>
        <ThemedText>SMS</ThemedText>
        <Switch value={!!values.notifySms} onValueChange={(v) => setValues({ ...values, notifySms: v })} />
      </View>
      <View style={styles.prefRow}>
        <ThemedText>In-app</ThemedText>
        <Switch value={!!values.notifyInApp} onValueChange={(v) => setValues({ ...values, notifyInApp: v })} />
      </View>

      {notice ? <ThemedText type="small" style={{ color: theme.success, marginTop: Spacing.two }}>{notice}</ThemedText> : null}

      <View style={styles.actions}>
        <AppButton label={saving ? 'Saving…' : 'Save changes'} variant="primary" onPress={handleSave} />
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