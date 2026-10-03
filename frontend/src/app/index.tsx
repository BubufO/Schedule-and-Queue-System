// Home: entry point with links to every part of the application.

import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, Badge, Field, Screen, SectionLabel, TextField } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { estimatedWait, serviceFromJoinLink, useQueueStore } from '@/lib/queue-store';
import { Spacing } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';

type Destination = {
  href: Href;
  title: string;
  description: string;
  comingSoon?: boolean;
};

const loginPage: Destination = {
  href: '/login',
  title: 'Login / Register',
  description: 'Sign in to be routed to your dashboard.',
};

const adminPages: Destination[] = [
  {
    href: '/admin',
    title: 'Admin Dashboard',
    description: 'All services, current queue lengths, and quick open/close actions.',
  },
  {
    href: '/admin/services',
    title: 'Service Management',
    description: 'Create, edit, and delete services.',
  },
  {
    href: '/admin/queue',
    title: 'Queue Management',
    description: 'Find a service, reorder or remove people, and serve the next person.',
  },
];

export default function HomeScreen() {
  return (
    <Screen
      title="Welcome to QueueSmart"
      subtitle="Join queues, see your wait time, and manage services, all in one place.">
      <SectionLabel>For clients</SectionLabel>
      <View style={styles.grid}>
        <GuestJoinCard />
        <DestinationCard destination={loginPage} />
      </View>

      <SectionLabel>For administrators</SectionLabel>
      <View style={styles.grid}>
        {adminPages.map((d) => (
          <DestinationCard key={d.title} destination={d} />
        ))}
      </View>
    </Screen>
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

  if (visit) {
    const service = services.find((s) => s.id === visit.serviceId);
    const serving = nowServing[visit.serviceId];
    const queue = queues[visit.serviceId] ?? [];
    const index = queue.findIndex((e) => e.id === visit.entryId);
    const entry = serving?.entry.id === visit.entryId ? serving.entry : queue[index];

    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
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
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold" style={styles.cardTitle}>
        Join with a link
      </ThemedText>
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

function DestinationCard({ destination }: { destination: Destination }) {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.navigate(destination.href)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement },
        pressed && { opacity: 0.75 },
      ]}>
      <View style={styles.cardTop}>
        <ThemedText type="smallBold" style={styles.cardTitle}>
          {destination.title}
        </ThemedText>
        {destination.comingSoon ? <Badge label="Coming soon" /> : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {destination.description}
      </ThemedText>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        Open →
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  card: {
    flexGrow: 1,
    flexBasis: 220,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
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
});
