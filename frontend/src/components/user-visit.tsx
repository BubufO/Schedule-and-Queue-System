import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AppButton, Badge, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { formatDate, useUserQueue } from '@/lib/user-queue';
export function UserVisit() {
  const { active, history, leaveQueue } = useUserQueue();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!active) return <Card>
    <ThemedText>You have no active queue.</ThemedText>
    {history[0]?.outcome === 'served' && <Badge label="Served" tone="success" />}
    <AppButton label="Browse services" variant="primary" onPress={() => router.push('/user/join-queue')} />
  </Card>;
  return <Card highlighted>
    <ThemedText type="smallBold">{active.service.name}</ThemedText>
    <Badge label={active.status} tone={active.status === 'Waiting' ? 'neutral' : 'accent'} />
    <ThemedText>Ticket: {active.entry.ticket}</ThemedText>
    <ThemedText>{active.position ? `Position: ${active.position}` : 'Please report to staff.'}</ThemedText>
    {!!active.position && <ThemedText>Estimated wait: approximately {active.wait} min</ThemedText>}
    <ThemedText type="small" themeColor="textSecondary">Joined: {formatDate(active.entry.joinedAt)}</ThemedText>
    {!active.service.isOpen && <ThemedText type="small">Closed to new joins. Your place is retained.</ThemedText>}
    {error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
    {!!active.position && <AppButton label="Leave queue" variant="danger" onPress={() => {
      setError(null);
      try { leaveQueue(); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to leave queue.'); }
    }} />}
  </Card>;
}
