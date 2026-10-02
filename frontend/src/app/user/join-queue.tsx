import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, Card, AppButton, StatusBadge, SearchInput } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { UserNav } from '@/components/user-nav';
import { UserVisit } from '@/components/user-visit';
import { filterServices, estimatedWait } from '@/lib/queue-store';
import { useUserQueue } from '@/lib/user-queue';
export default function JoinQueueScreen() {
  const { services, queues, nowServing, joinQueue, active } = useUserQueue();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = services.find(s => s.id === selectedId);
  const visible = filterServices(services, query);
  return <Screen title="Join a Queue" subtitle="Choose a service. Wait times are approximate." nav={<UserNav />}>
    {active ? <><UserVisit /><AppButton label="View queue status" onPress={() => router.push('/user/queue-status')} /></> : <>
      <SearchInput value={query} onChangeText={setQuery} placeholder="Search services" />
      {!visible.length && <Card><ThemedText>No services match your search.</ThemedText></Card>}
      {visible.map(service => <Card key={service.id} highlighted={service.id === selectedId}>
        <ThemedText type="smallBold">{service.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{service.description}</ThemedText>
        <StatusBadge isOpen={service.isOpen} />
        <ThemedText>{queues[service.id]?.length ?? 0} people waiting</ThemedText>
        {service.isOpen && <ThemedText>Estimated wait: {estimatedWait(service, (queues[service.id]?.length ?? 0) + (nowServing[service.id] ? 1 : 0))} min</ThemedText>}
        <AppButton label={!service.isOpen ? 'Currently closed' : service.id === selectedId ? 'Selected' : 'Select service'} disabled={!service.isOpen} onPress={() => { setSelectedId(service.id); setError(null); }} />
      </Card>)}
      {selected && <Card highlighted>
        <ThemedText type="smallBold">Selected: {selected.name}</ThemedText>
        {!selected.isOpen && <ThemedText>This service has closed. Choose another service.</ThemedText>}
        {error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
        <AppButton label="Join queue" variant="primary" disabled={!selected.isOpen} onPress={() => {
          setError(null);
          try { joinQueue(selected.id); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to join queue.'); }
        }} />
      </Card>}
      {selectedId && !selected && <Card><ThemedText>This service is no longer available. Choose another service.</ThemedText></Card>}
    </>}
  </Screen>;
}
