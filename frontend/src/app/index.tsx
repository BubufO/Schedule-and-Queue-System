// Home: entry point with links to every part of the application.

import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Screen, SectionLabel } from '@/components/admin/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Destination = {
  href: Href;
  title: string;
  description: string;
  comingSoon?: boolean;
};

const clientPages: Destination[] = [
  {
    href: '/login',
    title: 'Login / Register',
    description: 'Sign in or create an account.',
    comingSoon: true,
  },
  {
    href: '/user',
    title: 'User Dashboard',
    description: 'Join a queue and track your place in line.',
    comingSoon: true,
  },
];

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
        {clientPages.map((d) => (
          <DestinationCard key={d.title} destination={d} />
        ))}
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
