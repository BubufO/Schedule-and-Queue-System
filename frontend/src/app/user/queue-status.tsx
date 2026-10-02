import { Screen, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { UserNav } from '@/components/user-nav';
import { UserVisit } from '@/components/user-visit';
import { useUserQueue } from '@/lib/user-queue';
export default function QueueStatusScreen() {
  const { notifications } = useUserQueue();
  return <Screen title="Queue Status" subtitle="Your position updates when staff manage the queue in this app session." nav={<UserNav />}>
    <UserVisit />
    {notifications.map(message => <Card key={message}><ThemedText accessibilityLiveRegion="polite">{message}</ThemedText></Card>)}
  </Screen>;
}
