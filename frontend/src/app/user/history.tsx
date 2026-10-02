import { Screen, Card, Badge } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { UserNav } from '@/components/user-nav';
import { useUserQueue, formatDate, outcomeLabels } from '@/lib/user-queue';
export default function HistoryScreen() {
  const { history } = useUserQueue();
  return <Screen title="History" subtitle="Past visits from this app session." nav={<UserNav />}>
    {!history.length && <Card><ThemedText>No past visits yet. Completed visits and queues you leave will appear here.</ThemedText></Card>}
    {history.map(visit => <Card key={visit.id}>
      <ThemedText type="smallBold">{visit.serviceName}</ThemedText>
      <Badge label={outcomeLabels[visit.outcome]} tone={visit.outcome === 'served' ? 'success' : 'neutral'} />
      <ThemedText type="small">Ticket: {visit.ticket}</ThemedText>
      <ThemedText type="small">Joined: {formatDate(visit.joinedAt)}</ThemedText>
      <ThemedText type="small">Ended: {formatDate(visit.endedAt)}</ThemedText>
    </Card>)}
  </Screen>;
}
