// Home: entry point for clients. Admin screens are only reachable by signing in as an admin.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppButton, Badge, Field, Screen, TextField } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { estimatedWait, serviceFromJoinLink, useQueueStore } from '@/lib/queue-store';
import { Spacing } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';

// Below this width the hero and join card stack instead of sitting side by side.
const WideWidth = 900;
const LandingMaxWidth = 1100;

export default function HomeScreen() {
  const wide = useWindowDimensions().width >= WideWidth;
  return (
    <Screen maxWidth={LandingMaxWidth} footer={<LandingFooter />}>
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <Hero wide={wide} />
        <View style={wide ? styles.joinColumnWide : undefined}>
          <GuestJoinCard />
        </View>
      </View>
    </Screen>
  );
}

function Hero({ wide }: { wide: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  return (
    <View style={[styles.hero, wide && styles.heroWide]}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        QUEUESMART
      </ThemedText>
      <ThemedText accessibilityRole="header" style={[styles.headline, wide && styles.headlineWide]}>
        Queue from anywhere to anything 
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.lede}>
        Join a queue from anywhere, see your place in line, and get an estimated wait time, so
        you can show up right when it's your turn.
      </ThemedText>
      <View style={styles.heroActions}>
        <AppButton label="Create account" onPress={() => router.navigate('/register')} />
        <Pressable accessibilityRole="link" onPress={() => router.navigate('/login')}>
          <ThemedText type="small" themeColor="textSecondary">
            Have an account?{' '}
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Sign in →
            </ThemedText>
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function LandingFooter() {
  const router = useRouter();
  const theme = useTheme();
  return (
    <View style={[styles.footer, { borderTopColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary">
        © {new Date().getFullYear()} QueueSmart and Friends. No rights reserved.
      </ThemedText>
      <Pressable accessibilityRole="link" onPress={() => router.navigate('/login')}>
        <ThemedText type="small" themeColor="textSecondary">
          Run a service?{' '}
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Manage your queues →
          </ThemedText>
        </ThemedText>
      </Pressable>
    </View>
  );
}

// One-time visit without an account: paste the join link a service shares, then track it here.
function GuestJoinCard() {
  const theme = useTheme();
  const { services, queues, nowServing, joinAsGuest, removeEntry } = useQueueStore();

  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [visit, setVisit] = useState<{ serviceId: string; entryId: string } | null>(null);

  const errors: { link?: string; name?: string } = {};
  if (!link.trim()) errors.link = 'Paste the join link you were given.';
  if (!name.trim()) errors.name = 'Enter a name so staff can call you.';
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const join = () => {
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(errors).length) return;
    const service = serviceFromJoinLink(services, link);
    if (!service) {
      setFailure('That join link does not match any service.');
      return;
    }
    try {
      const entry = joinAsGuest(service.id, name.trim());
      setVisit({ serviceId: service.id, entryId: entry.id });
      setSubmitted(false);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Unable to join queue.');
    }
  };

  const reset = () => {
    setVisit(null);
    setLink('');
    setFailure(null);
  };

  const cardStyle = [
    styles.card,
    { backgroundColor: theme.backgroundElement, borderColor: theme.accent },
  ];

  if (visit) {
    const service = services.find((s) => s.id === visit.serviceId);
    const serving = nowServing[visit.serviceId];
    const queue = queues[visit.serviceId] ?? [];
    const index = queue.findIndex((e) => e.id === visit.entryId);
    const entry = serving?.entry.id === visit.entryId ? serving.entry : queue[index];

    return (
      <View style={cardStyle}>
        <View style={styles.cardTop}>
          <ThemedText type="smallBold" style={styles.cardTitle}>
            {service?.name ?? 'Queue visit'}
          </ThemedText>
          <Badge label="Guest" tone="accent" />
        </View>
        {!entry ? (
          <ThemedText type="small" themeColor="textSecondary">
            Your visit has ended.
          </ThemedText>
        ) : (
          <>
            <ThemedText>Ticket: {entry.ticket}</ThemedText>
            <ThemedText accessibilityLiveRegion="polite">
              {index < 0
                ? "It's your turn. Please report to staff."
                : `Position ${index + 1} · about ${estimatedWait(service!, index + (serving ? 1 : 0))} min`}
            </ThemedText>
          </>
        )}
        {entry && index >= 0 ? (
          <AppButton
            label="Leave queue"
            variant="danger"
            onPress={() => {
              removeEntry(visit.serviceId, visit.entryId);
              reset();
            }}
          />
        ) : null}
        {!entry ? <AppButton label="Join another queue" onPress={reset} /> : null}
      </View>
    );
  }

  return (
    <View style={cardStyle}>
      <View style={styles.cardTop}>
        <ThemedText type="smallBold" style={styles.cardTitle}>
          Join with a link
        </ThemedText>
        <Badge label="No account needed" tone="accent" />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Got a queue link? Join once without an account.
      </ThemedText>
      <Field label="Join link" required error={show('link')}>
        <TextField
          value={link}
          onChangeText={setLink}
          placeholder="e.g. queuesmart.app/join/it-help"
          accessibilityLabel="Join link"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={show('link')}
        />
      </Field>
      <Field label="Your name" required error={show('name')}>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder="e.g. Sam"
          accessibilityLabel="Your name"
          autoComplete="name"
          returnKeyType="go"
          onSubmitEditing={join}
          error={show('name')}
        />
      </Field>
      {failure ? (
        <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.danger }}>
          {failure}
        </ThemedText>
      ) : null}
      <AppButton label="Join queue" variant="primary" onPress={join} />
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    gap: Spacing.five,
  },
  layoutWide: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.five,
  },
  joinColumnWide: {
    flexBasis: 400,
    flexShrink: 0,
  },
  hero: {
    gap: Spacing.three,
  },
  heroWide: {
    flex: 1,
  },
  headline: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: 800,
  },
  headlineWide: {
    fontSize: 48,
    lineHeight: 56,
  },
  lede: {
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 520,
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  card: {
    borderRadius: Spacing.three,
    borderWidth: 1.5,
    padding: Spacing.four,
    gap: Spacing.two,
    ...Platform.select({
      web: { boxShadow: '0 12px 32px rgba(37, 99, 235, 0.15)' },
      default: {
        shadowColor: '#2563EB',
        shadowOpacity: 0.15,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
      },
    }),
  },
  cardTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 17,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.five,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
