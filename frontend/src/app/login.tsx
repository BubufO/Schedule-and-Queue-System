// Login: signs in with the dummy API gateway, then sends clients to the user dashboard
// and administrators to the admin dashboard.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Badge, Card, Field, Screen, TextField } from '@/components/ui';
import { ApiError } from '@/lib/api/gateway';
import { homeForRole, roleLabel, useAuth } from '@/lib/auth-store';
import { Spacing } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session, signIn, signOut } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [revealPassword, setRevealPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors: { username?: string; password?: string } = {};
  if (!username.trim()) errors.username = 'Username is required.';
  if (!password) errors.password = 'Password is required.';

  const hasErrors = Object.keys(errors).length > 0;
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const submit = async () => {
    setSubmitted(true);
    setFailure(null);
    if (hasErrors || pending) return;

    setPending(true);
    try {
      const next = await signIn(username.trim(), password);
      setPassword('');
      setSubmitted(false);
      router.navigate(homeForRole[next.account.role]);
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  };

  if (session) {
    const { account } = session;
    return (
      <Screen title="Login" subtitle="You're already signed in.">
        <Card highlighted>
          <View style={styles.rowTop}>
            <View style={styles.rowText}>
              <ThemedText type="smallBold" style={styles.cardTitle}>
                {account.displayName}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Signed in as {account.username}
              </ThemedText>
            </View>
            <Badge label={roleLabel[account.role]} tone="accent" />
          </View>
          <View style={styles.actions}>
            <AppButton
              label="Go to dashboard"
              variant="primary"
              onPress={() => router.navigate(homeForRole[account.role])}
            />
            <AppButton label="Sign out" onPress={() => signOut()} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Login" subtitle="Sign in to join a queue or manage services.">
      {failure ? (
        <View style={[styles.alert, { backgroundColor: theme.dangerBackground }]}>
          <Text style={[styles.alertText, { color: theme.danger }]}>{failure}</Text>
        </View>
      ) : null}

      <Card>
        <Field label="Username" required error={show('username')}>
          <TextField
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. admin"
            accessibilityLabel="Username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            editable={!pending}
            returnKeyType="next"
            error={show('username')}
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
            placeholder="Your password"
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            secureTextEntry={!revealPassword}
            editable={!pending}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={show('password')}
          />
        </Field>

        {submitted && hasErrors ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Fix the highlighted fields to sign in.
          </ThemedText>
        ) : null}

        <AppButton
          label={pending ? 'Signing in…' : 'Sign in'}
          variant="primary"
          disabled={pending}
          onPress={submit}
        />
      </Card>

      <AppButton label="Create an account" onPress={() => router.navigate('/register')} />

      <View style={styles.credentials}>
        <ThemedText type="small" themeColor="textSecondary">
          admin / password
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          user / password
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowText: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  cardTitle: {
    fontSize: 17,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
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
  credentials: {
    gap: Spacing.half,
  },
});
