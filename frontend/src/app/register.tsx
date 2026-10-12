// Register: creates a pending client account through the dummy API gateway, then hands off
// to the verify screen, which confirms the code sent by email or text and signs the user in.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, Field, FilterChips, Screen, TextField } from '@/components/ui';
import { ApiError } from '@/lib/api/gateway';
import { channelLabel, homeForRole, useAuth } from '@/lib/auth-store';
import { Spacing } from '@/lib/theme';
import type { VerificationChannel } from '@/lib/types';
import { useTheme } from '@/lib/use-theme';
import {
  PasswordMinLength,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePhone,
  validateUsername,
} from '@/lib/validation';

const channelOptions = (['email', 'sms'] as const).map((value) => ({
  value,
  label: channelLabel[value],
}));

export default function RegisterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session, register } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [channel, setChannel] = useState<VerificationChannel>('email');
  const [revealPassword, setRevealPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors: Partial<
    Record<'displayName' | 'username' | 'email' | 'phone' | 'password' | 'confirm', string>
  > = {
    displayName: validateDisplayName(displayName),
    username: validateUsername(username),
    email: validateEmail(email),
    phone: validatePhone(phone, channel === 'sms'),
    password: validatePassword(password),
    confirm: !confirm
      ? 'Re-enter your password.'
      : confirm !== password
        ? 'Passwords do not match.'
        : undefined,
  };

  const hasErrors = Object.values(errors).some(Boolean);
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const submit = async () => {
    setSubmitted(true);
    setFailure(null);
    if (hasErrors || pending) return;

    setPending(true);
    try {
      await register({
        displayName: displayName.trim(),
        username: username.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        channel,
      });
      setPassword('');
      setConfirm('');
      setSubmitted(false);
      router.navigate('/verify');
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  };

  if (session) {
    return (
      <Screen title="Create an account" subtitle="You're already signed in.">
        <Card>
          <ThemedText>Sign out first if you want to create a different account.</ThemedText>
          <AppButton
            label="Go to dashboard"
            variant="primary"
            onPress={() => router.navigate(homeForRole[session.account.role])}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Create an account" subtitle="Save your visits and get notified when it's your turn.">
      {failure ? (
        <View
          accessibilityRole="alert"
          style={[styles.alert, { backgroundColor: theme.dangerBackground }]}>
          <Text style={[styles.alertText, { color: theme.danger }]}>{failure}</Text>
        </View>
      ) : null}

      <Card>
        <Field label="Full name" required error={show('displayName')}>
          <TextField
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Jordan Reyes"
            accessibilityLabel="Full name"
            autoComplete="name"
            textContentType="name"
            editable={!pending}
            returnKeyType="next"
            error={show('displayName')}
          />
        </Field>

        <Field label="Username" required error={show('username')}>
          <TextField
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. jreyes"
            accessibilityLabel="Username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            editable={!pending}
            returnKeyType="next"
            error={show('username')}
          />
        </Field>

        <Field label="Email" required error={show('email')}>
          <TextField
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            editable={!pending}
            returnKeyType="next"
            error={show('email')}
          />
        </Field>

        <Field
          label="Phone"
          required={channel === 'sms'}
          hint={channel === 'sms' ? undefined : 'Optional'}
          error={show('phone')}>
          <TextField
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. (555) 012-3456"
            accessibilityLabel="Phone number"
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            editable={!pending}
            returnKeyType="next"
            error={show('phone')}
          />
        </Field>

        <Field
          label="Password"
          required
          error={show('password')}
          accessory={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={revealPassword ? 'Hide password' : 'Show password'}
              onPress={() => setRevealPassword((v) => !v)}>
              <Text style={[styles.reveal, { color: theme.accent }]}>
                {revealPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          }>
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder={`At least ${PasswordMinLength} characters, with a number`}
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            secureTextEntry={!revealPassword}
            editable={!pending}
            returnKeyType="next"
            error={show('password')}
          />
        </Field>

        <Field label="Confirm password" required error={show('confirm')}>
          <TextField
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter your password"
            accessibilityLabel="Confirm password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            secureTextEntry={!revealPassword}
            editable={!pending}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={show('confirm')}
          />
        </Field>

        <Field label="Send my verification code by">
          <FilterChips options={channelOptions} value={channel} onChange={setChannel} />
        </Field>

        {submitted && hasErrors ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Fix the highlighted fields to create your account.
          </ThemedText>
        ) : null}

        <AppButton
          label={pending ? 'Creating account…' : 'Create account'}
          variant="primary"
          disabled={pending}
          onPress={submit}
        />
      </Card>

      <View style={styles.footer}>
        <ThemedText type="small" themeColor="textSecondary">
          Already have an account?
        </ThemedText>
        <AppButton label="Sign in" variant="ghost" size="sm" onPress={() => router.navigate('/login')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: {
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  alertText: {
    fontSize: 14,
    fontWeight: 600,
  },
  reveal: {
    fontSize: 14,
    fontWeight: 600,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
