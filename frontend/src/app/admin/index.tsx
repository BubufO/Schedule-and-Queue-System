// Admin Dashboard: list of services, current queue lengths, and quick open/close actions.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AdminNav,
  AppButton,
  Card,
  FilterChips,
  PriorityBadge,
  Screen,
  SearchInput,
  SectionLabel,
  StatusBadge,
} from '@/components/admin/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  estimatedWait,
  filterServices,
  statusFilterOptions,
  useAdminStore,
  type StatusFilter,
} from '@/context/admin-store';
import { useTheme } from '@/hooks/use-theme';

export default function DashboardScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { services, queues, toggleQueue } = useAdminStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const visible = filterServices(services, query, status);

  const totalWaiting = services.reduce((sum, s) => sum + (queues[s.id]?.length ?? 0), 0);
  const openCount = services.filter((s) => s.isOpen).length;
  const longestWait = Math.max(0, ...services.map((s) => estimatedWait(s, queues[s.id]?.length ?? 0)));
  const maxLength = Math.max(1, ...services.map((s) => queues[s.id]?.length ?? 0));

  const today = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Screen
      title="Admin Dashboard"
      subtitle={today}
      nav={<AdminNav />}
      action={
        <AppButton
          label="+ New service"
          variant="primary"
          onPress={() => router.push('/admin/services?new=1')}
        />
      }>
      <View style={styles.stats}>
        <StatCard label="People waiting" value={String(totalWaiting)} />
        <StatCard label="Open queues" value={`${openCount} / ${services.length}`} />
        <StatCard label="Longest wait" value={`${longestWait} min`} />
      </View>

      <SectionLabel>{`Services (${visible.length} of ${services.length})`}</SectionLabel>
      <SearchInput value={query} onChangeText={setQuery} placeholder="Search services" />
      <FilterChips options={statusFilterOptions} value={status} onChange={setStatus} />

      {visible.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            No services match your search.
          </ThemedText>
        </Card>
      ) : null}

      {visible.map((service) => {
        const length = queues[service.id]?.length ?? 0;
        const wait = estimatedWait(service, length);
        return (
          <Card key={service.id}>
            <View style={styles.rowTop}>
              <View style={styles.rowTitle}>
                <ThemedText type="smallBold" style={styles.serviceName}>
                  {service.name}
                </ThemedText>
                <View style={styles.badges}>
                  <StatusBadge isOpen={service.isOpen} />
                  <PriorityBadge priority={service.priority} />
                </View>
              </View>
              <View style={styles.count}>
                <ThemedText style={styles.countNumber}>{length}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  in queue
                </ThemedText>
              </View>
            </View>

            <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${(length / maxLength) * 100}%`,
                    backgroundColor: service.isOpen ? theme.accent : theme.textSecondary,
                  },
                ]}
              />
            </View>

            <ThemedText type="small" themeColor="textSecondary">
              ~{wait} min estimated wait · {service.durationMinutes} min per visit
            </ThemedText>

            <View style={styles.actions}>
              <AppButton
                size="sm"
                variant={service.isOpen ? 'danger' : 'primary'}
                label={service.isOpen ? 'Close queue' : 'Open queue'}
                onPress={() => toggleQueue(service.id)}
              />
              <AppButton
                size="sm"
                label="Manage queue"
                onPress={() => router.push(`/admin/queue?service=${service.id}`)}
              />
              <AppButton
                size="sm"
                variant="ghost"
                label="Edit service"
                onPress={() => router.push(`/admin/services?edit=${service.id}`)}
              />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.statCard}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 160,
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: 700,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  rowTitle: {
    flexShrink: 1,
    gap: Spacing.one,
  },
  serviceName: {
    fontSize: 17,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  count: {
    alignItems: 'flex-end',
  },
  countNumber: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: 700,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
});
