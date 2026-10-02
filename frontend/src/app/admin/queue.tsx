// Queue Management: view a service's queue, reorder or remove people, and serve the next person.
// All actions are UI simulations on the in-memory store.

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminNav } from '@/components/admin-nav';
import {
  AppButton,
  Card,
  FilterChips,
  PriorityBadge,
  Screen,
  SearchInput,
  SectionLabel,
  StatusBadge,
} from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/lib/theme';
import {
  estimatedWait,
  filterServices,
  statusFilterOptions,
  useQueueStore,
  type StatusFilter,
} from '@/lib/queue-store';
import { useTheme } from '@/lib/use-theme';

export default function QueueScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ service?: string }>();
  const { services, queues, nowServing, toggleQueue, moveEntry, removeEntry, serveNext, completeService } =
    useQueueStore();
  const [selectedId, setSelectedId] = useState(params.service ?? services[0]?.id);

  // Follow the dashboard's "Manage queue" deep link.
  useEffect(() => {
    if (params.service) setSelectedId(params.service);
  }, [params.service]);

  const service = services.find((s) => s.id === selectedId) ?? services[0];
  if (!service) {
    return (
      <Screen title="Queue Management" nav={<AdminNav />}>
        <ThemedText themeColor="textSecondary">No services yet. Create one first.</ThemedText>
      </Screen>
    );
  }

  const queue = queues[service.id] ?? [];
  const serving = nowServing[service.id];

  return (
    <Screen
      title="Queue Management"
      subtitle="Search for a service to view and manage its queue."
      nav={<AdminNav />}>
      <ServicePicker selectedId={service.id} onSelect={setSelectedId} />

      <Card>
        <View style={styles.serviceHeader}>
          <View style={styles.serviceTitle}>
            <ThemedText type="smallBold" style={styles.serviceName}>
              {service.name}
            </ThemedText>
            <View style={styles.badges}>
              <StatusBadge isOpen={service.isOpen} />
              <PriorityBadge priority={service.priority} />
            </View>
          </View>
          <AppButton
            size="sm"
            variant={service.isOpen ? 'danger' : 'primary'}
            label={service.isOpen ? 'Close queue' : 'Open queue'}
            onPress={() => toggleQueue(service.id)}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {queue.length} waiting · ~{estimatedWait(service, queue.length)} min to clear ·{' '}
          {service.durationMinutes} min per visit
        </ThemedText>
        {!service.isOpen ? (
          <ThemedText type="small" style={{ color: theme.warning }}>
            This queue is closed. No one new can join, but you can still serve the people already
            waiting.
          </ThemedText>
        ) : null}
      </Card>

      <Card style={{ backgroundColor: theme.accentBackground }}>
        <View style={styles.servingRow}>
          <View style={styles.servingText}>
            <Text style={[styles.servingLabel, { color: theme.accent }]}>NOW SERVING</Text>
            {serving ? (
              <>
                <ThemedText style={styles.servingTicket}>{serving.entry.ticket}</ThemedText>
                <ThemedText type="small">
                  {serving.entry.name} · started {new Date(serving.startedAt).toLocaleTimeString()}
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No one is being served right now.
              </ThemedText>
            )}
          </View>
          {serving && <AppButton label="Complete service" variant="primary" onPress={() => completeService(service.id)} />}
          <AppButton
            label={queue.length ? `Serve next (${queue[0].ticket})` : 'Queue empty'}
            variant="primary"
            disabled={!queue.length || !!serving}
            onPress={() => serveNext(service.id)}
          />
        </View>
      </Card>

      <SectionLabel>{`Waiting (${queue.length})`}</SectionLabel>

      {queue.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Nobody is waiting for {service.name}.
          </ThemedText>
        </Card>
      ) : (
        queue.map((entry, index) => (
          <Card key={entry.id} style={styles.entry}>
            <View style={[styles.position, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold">{index + 1}</ThemedText>
            </View>
            <View style={styles.entryText}>
              <ThemedText type="smallBold">{entry.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {entry.ticket} · joined {Number.isNaN(Date.parse(entry.joinedAt)) ? entry.joinedAt : new Date(entry.joinedAt).toLocaleTimeString()} · ~{estimatedWait(service, index)} min wait
              </ThemedText>
            </View>
            <View style={styles.entryActions}>
              <AppButton
                size="sm"
                label="↑"
                accessibilityLabel={`Move ${entry.name} up`}
                disabled={index === 0}
                onPress={() => moveEntry(service.id, entry.id, -1)}
              />
              <AppButton
                size="sm"
                label="↓"
                accessibilityLabel={`Move ${entry.name} down`}
                disabled={index === queue.length - 1}
                onPress={() => moveEntry(service.id, entry.id, 1)}
              />
              <AppButton
                size="sm"
                variant="danger"
                label="Remove"
                accessibilityLabel={`Remove ${entry.name} from queue`}
                onPress={() => removeEntry(service.id, entry.id)}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

type SortKey = 'name' | 'longest';

// Searchable, filterable service list so admins can find a queue among many services.
function ServicePicker({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const { services, queues } = useQueueStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('longest');

  const results = [...filterServices(services, query, status)].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : (queues[b.id]?.length ?? 0) - (queues[a.id]?.length ?? 0),
  );

  return (
    <Card>
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search services by name or description"
      />
      <View style={styles.pickerFilters}>
        <FilterChips options={statusFilterOptions} value={status} onChange={setStatus} />
        <FilterChips
          options={[
            { value: 'longest', label: 'Longest queue' },
            { value: 'name', label: 'A to Z' },
          ]}
          value={sort}
          onChange={setSort}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Showing {results.length} of {services.length} services
      </ThemedText>
      <ScrollView style={styles.resultList} nestedScrollEnabled>
        {results.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.noResults}>
            No services match your search.
          </ThemedText>
        ) : (
          results.map((s) => {
            const selected = s.id === selectedId;
            const length = queues[s.id]?.length ?? 0;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect(s.id)}
                style={({ pressed }) => [
                  styles.resultRow,
                  { backgroundColor: selected ? theme.accentBackground : 'transparent' },
                  pressed && { opacity: 0.7 },
                ]}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: s.isOpen ? theme.success : theme.textSecondary },
                  ]}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.resultName,
                    { color: selected ? theme.accent : theme.text },
                  ]}>
                  {s.name}
                </Text>
                <Text style={[styles.resultCount, { color: theme.textSecondary }]}>
                  {length} waiting
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  pickerFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  resultList: {
    maxHeight: 240,
  },
  noResults: {
    paddingVertical: Spacing.two,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.two,
    borderRadius: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  resultName: {
    flex: 1,
    fontSize: 15,
    fontWeight: 600,
  },
  resultCount: {
    fontSize: 13,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  serviceTitle: {
    flexShrink: 1,
    gap: Spacing.one,
  },
  serviceName: {
    fontSize: 18,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  servingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  servingText: {
    gap: Spacing.half,
    flexShrink: 1,
  },
  servingLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.8,
  },
  servingTicket: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 700,
  },
  entry: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 12,
  },
  position: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryText: {
    flex: 1,
    minWidth: 180,
    gap: Spacing.half,
  },
  entryActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
});
