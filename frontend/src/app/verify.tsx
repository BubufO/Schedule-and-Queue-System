// Verify: confirms the code sent by email or text after registering. A correct code activates
// the account and signs it in; the person can also resend, or switch to the other channel.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Badge, Card, Field, Screen, TextField } from '@/components/ui';
import { demoVerificationCode } from '@/lib/api/accounts';
import { ApiError } from '@/lib/api/gateway';
import { channelLabel, homeForRole, useAuth } from '@/lib/auth-store';
import { Spacing } from '@/lib/theme';
import type { VerificationChannel } from '@/lib/types';
import { useTheme } from '@/lib/use-theme';

const CodeLength = 6;

// Re-renders once a second so the resend countdown and expiry stay current.
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function VerifyScreen() {
  const router = useRouter();
  const theme = useTheme();
  const now = useNow();
  const { session, pendingVerification: challenge, verify, resendCode, cancelVerification } =
    useAuth();

  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<'verify' | 'resend' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const error =
    code.length === 0
      ? 'Enter the code we sent you.'
      : code.length !== CodeLength
        ? `The code is ${CodeLength} digits.`
        : undefined;
  const shownError = submitted ? error : undefined;

  const submit = async () => {
    setSubmitted(true);
    setFailure(null);
    setNotice(null);
    if (error || pending) return;

    setPending('verify');
    try {
      const next = await verify(code);
      router.navigate(homeForRole[next.account.role]);
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setCode('');
      setSubmitted(false);
    } finally {
      setPending(null);
    }
  };

  const resend = async (channel?: VerificationChannel) => {
    setFailure(null);
    setNotice(null);
    setPending('resend');
    try {
      const next = await resendCode(channel);
      setCode('');
      setSubmitted(false);
      setNotice(`New code sent to ${next.destination}.`);
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : 'Could not send a new code. Try again.');
    } finally {
      setPending(null);
    }
  };

  const startOver = () => {
    cancelVerification();
    router.navigate('/register');
  };

  // Just verified: the navigation above is already on its way to the dashboard.
  if (session) {
    return (
      <Screen title="Verify your account" subtitle="Your account is active.">
        <Card>
          <AppButton
            label="Go to dashboard"
            variant="primary"
            onPress={() => router.navigate(homeForRole[session.account.role])}
          />
        </Card>
      </Screen>
    );
  }

  if (!challenge) {
    return (
      <Screen title="Verify your account" subtitle="There's no account waiting to be verified.">
        <Card>
          <ThemedText>Create an account first and we'll send you a code.</ThemedText>
          <AppButton label="Create an account" variant="primary" onPress={() => router.navigate('/register')} />
        </Card>
      </Screen>
    );
  }

  const resendIn = Math.max(0, Math.ceil((Date.parse(challenge.resendAvailableAt) - now) / 1000));
  const expired = now > Date.parse(challenge.expiresAt);
  const otherChannel = challenge.channels.find((c) => c !== challenge.channel);
  const sentBy = challenge.channel === 'sms' ? 'texted' : 'emailed';

  return (
    <Screen
      title="Verify your account"
      subtitle={`We ${sentBy} a ${CodeLength}-digit code to ${challenge.destination}.`}>
      {failure ? (
        <View
          accessibilityRole="alert"
          style={[styles.alert, { backgroundColor: theme.dangerBackground }]}>
          <Text style={[styles.alertText, { color: theme.danger }]}>{failure}</Text>
        </View>
      ) : null}
      {notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.alert, { backgroundColor: theme.successBackground }]}>
          <Text style={[styles.alertText, { color: theme.success }]}>{notice}</Text>
        </View>
      ) : null}

      <Card>
        <View style={styles.rowTop}>
          <ThemedText type="smallBold">Sent to {challenge.destination}</ThemedText>
          <Badge label={channelLabel[challenge.channel]} tone="accent" />
        </View>

        <Field
          label="Verification code"
          required
          error={shownError}
          hint={expired ? 'Expired' : undefined}>
          <TextField
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CodeLength))}
            placeholder="••••••"
            accessibilityLabel="Verification code"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={CodeLength}
            editable={!pending}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={shownError}
            style={styles.codeInput}
          />
        </Field>

        {expired ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            This code has expired. Send a new one to continue.
          </ThemedText>
        ) : null}

        <AppButton
          label={pending === 'verify' ? 'Verifying…' : 'Verify and continue'}
          variant="primary"
          disabled={!!pending || expired}
          onPress={submit}
        />
      </Card>

      <Card>
        <ThemedText type="smallBold">Didn't get it?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {challenge.channel === 'email'
            ? 'Check your spam folder, or send a new code.'
            : 'Texts can take a minute to arrive, or send a new code.'}
        </ThemedText>
        <View style={styles.actions}>
          <AppButton
            label={
              pending === 'resend' ? 'Sending…' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'
            }
            disabled={!!pending || resendIn > 0}
            onPress={() => resend()}
          />
          {otherChannel ? (
            <AppButton
              label={otherChannel === 'sms' ? 'Text me instead' : 'Email me instead'}
              disabled={!!pending || resendIn > 0}
              onPress={() => resend(otherChannel)}
            />
          ) : null}
          <AppButton label="Start over" variant="ghost" disabled={!!pending} onPress={startOver} />
        </View>
      </Card>

      <ThemedText type="small" themeColor="textSecondary">
        Demo code: {demoVerificationCode}
      </ThemedText>
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
  rowTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  codeInput: {
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
