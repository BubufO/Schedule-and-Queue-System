// Service Management: create or edit services (UI only, saved to the in-memory store).

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';

import { AdminNav } from '@/components/admin-nav';
import {
  AppButton,
  Badge,
  Card,
  Field,
  PriorityBadge,
  Screen,
  SearchInput,
  SectionLabel,
  StatusBadge,
  TextField,
} from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/lib/theme';
import { filterServices, useQueueStore, type ServiceInput } from '@/lib/queue-store';
import type { Priority, Service } from '@/lib/types';
import { useTheme } from '@/lib/use-theme';

const NAME_MAX = 100;
const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

type FormMode = { kind: 'closed' } | { kind: 'new' } | { kind: 'edit'; id: string };

export default function ServicesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string; new?: string }>();
  const theme = useTheme();
  const { services, queues, saveService, deleteService } = useQueueStore();
  const [mode, setMode] = useState<FormMode>({ kind: 'closed' });
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const visible = filterServices(services, query);

  // Allow the dashboard to deep link into "new" or "edit" mode.
  useEffect(() => {
    if (params.edit) {
      setMode({ kind: 'edit', id: params.edit });
      setNotice(null);
      router.setParams({ edit: undefined });
    } else if (params.new) {
      setMode({ kind: 'new' });
      setNotice(null);
      router.setParams({ new: undefined });
    }
  }, [params.edit, params.new, router]);

  const editing = mode.kind === 'edit' ? services.find((s) => s.id === mode.id) : undefined;

  const handleSave = (input: ServiceInput) => {
    const saved = saveService(input, editing?.id);
    setNotice(editing ? `Saved changes to "${saved.name}".` : `Created "${saved.name}". Its queue starts closed.`);
    setMode({ kind: 'closed' });
  };

  const handleDelete = (service: Service) => {
    deleteService(service.id);
    setConfirmDeleteId(null);
    if (mode.kind === 'edit' && mode.id === service.id) setMode({ kind: 'closed' });
    setNotice(`Deleted "${service.name}" and its queue.`);
  };

  return (
    <Screen
      title="Service Management"
      subtitle="Create, edit, and delete the services clients can queue for."
      nav={<AdminNav />}
      action={
        mode.kind === 'closed' ? (
          <AppButton
            label="+ New service"
            variant="primary"
            onPress={() => {
              setNotice(null);
              setMode({ kind: 'new' });
            }}
          />
        ) : undefined
      }>
      {notice ? <Notice message={notice} onDismiss={() => setNotice(null)} /> : null}

      {mode.kind !== 'closed' ? (
        <ServiceForm
          key={editing?.id ?? 'new'}
          service={editing}
          onCancel={() => setMode({ kind: 'closed' })}
          onSave={handleSave}
        />
      ) : null}

      <SectionLabel>{`Services (${visible.length} of ${services.length})`}</SectionLabel>
      <SearchInput value={query} onChangeText={setQuery} placeholder="Search services" />

      {visible.length === 0 ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            No services match your search.
          </ThemedText>
        </Card>
      ) : null}

      {visible.map((service) => (
        <Card key={service.id} highlighted={editing?.id === service.id}>
          <View style={styles.listTop}>
            <View style={styles.listText}>
              <ThemedText type="smallBold" style={styles.serviceName}>
                {service.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {service.description}
              </ThemedText>
            </View>
            <View style={styles.rowActions}>
              <AppButton
                size="sm"
                label="Edit"
                onPress={() => {
                  setNotice(null);
                  setConfirmDeleteId(null);
                  setMode({ kind: 'edit', id: service.id });
                }}
              />
              <AppButton
                size="sm"
                variant="danger"
                label="Delete"
                accessibilityLabel={`Delete ${service.name}`}
                onPress={() => setConfirmDeleteId(service.id)}
              />
            </View>
          </View>
          <View style={styles.badges}>
            <Badge label={`${service.durationMinutes} min`} tone="accent" />
            <PriorityBadge priority={service.priority} />
            <StatusBadge isOpen={service.isOpen} />
          </View>
          {confirmDeleteId === service.id ? (
            <View style={[styles.confirm, { backgroundColor: theme.dangerBackground }]}>
              <Text style={[styles.confirmText, { color: theme.danger }]}>
                Delete "{service.name}"?
                {queues[service.id]?.length
                  ? ` ${queues[service.id].length} people in its queue will be removed too.`
                  : ''}{' '}
                This can't be undone.
              </Text>
              <View style={styles.rowActions}>
                <AppButton size="sm" label="Cancel" onPress={() => setConfirmDeleteId(null)} />
                <AppButton
                  size="sm"
                  variant="destructive"
                  label="Yes, delete"
                  onPress={() => handleDelete(service)}
                />
              </View>
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

function ServiceForm({
  service,
  onCancel,
  onSave,
}: {
  service?: Service;
  onCancel: () => void;
  onSave: (input: ServiceInput) => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [duration, setDuration] = useState(service ? String(service.durationMinutes) : '');
  const [priority, setPriority] = useState<Priority>(service?.priority ?? 'medium');
  const [submitted, setSubmitted] = useState(false);

  const errors: { name?: string; description?: string; duration?: string } = {};
  if (!name.trim()) errors.name = 'Service name is required.';
  else if (name.length > NAME_MAX) errors.name = `Keep the name to ${NAME_MAX} characters or fewer.`;
  if (!description.trim()) errors.description = 'Description is required.';
  const durationNumber = Number(duration);
  if (!duration.trim()) errors.duration = 'Expected duration is required.';
  else if (!Number.isInteger(durationNumber) || durationNumber <= 0)
    errors.duration = 'Enter a whole number of minutes greater than 0.';

  const hasErrors = Object.keys(errors).length > 0;
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : undefined);

  const submit = () => {
    setSubmitted(true);
    if (hasErrors) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      durationMinutes: durationNumber,
      priority,
    });
  };

  return (
    <Card highlighted>
      <ThemedText type="smallBold" style={styles.formTitle}>
        {service ? `Edit "${service.name}"` : 'New service'}
      </ThemedText>

      <Field label="Service name" required error={show('name')} hint={`${name.length}/${NAME_MAX}`}>
        <TextField
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          placeholder="e.g. Academic Advising"
          error={show('name')}
        />
      </Field>

      <Field label="Description" required error={show('description')}>
        <TextField
          value={description}
          onChangeText={setDescription}
          placeholder="What does this service help with?"
          multiline
          numberOfLines={3}
          error={show('description')}
        />
      </Field>

      <Field label="Expected duration (minutes)" required error={show('duration')}>
        <TextField
          value={duration}
          onChangeText={(text) => setDuration(text.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 15"
          keyboardType="number-pad"
          error={show('duration')}
          style={styles.durationInput}
        />
      </Field>

      <Field label="Priority level">
        <View style={[styles.segment, { backgroundColor: theme.backgroundSelected }]}>
          {PRIORITIES.map((p) => {
            const selected = p === priority;
            return (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setPriority(p)}
                style={[styles.segmentItem, selected && { backgroundColor: theme.background }]}>
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: selected ? theme.text : theme.textSecondary },
                  ]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      {submitted && hasErrors ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Fix the highlighted fields to save.
        </ThemedText>
      ) : null}

      <View style={styles.formActions}>
        <AppButton label="Cancel" onPress={onCancel} />
        <AppButton
          label={service ? 'Save changes' : 'Create service'}
          variant="primary"
          onPress={submit}
        />
      </View>
    </Card>
  );
}

function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: theme.successBackground }]}>
      <Text style={[styles.noticeText, { color: theme.success }]}>{message}</Text>
      <AppButton size="sm" variant="ghost" label="Dismiss" onPress={onDismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  listTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  confirm: {
    borderRadius: 10,
    padding: Spacing.three,
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: 600,
  },
  listText: {
    flexShrink: 1,
    gap: Spacing.half,
  },
  serviceName: {
    fontSize: 17,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  formTitle: {
    fontSize: 18,
    marginBottom: Spacing.one,
  },
  durationInput: {
    maxWidth: 160,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    alignSelf: 'flex-start',
  },
  segmentItem: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: 600,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
  },
  noticeText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: 600,
  },
});
