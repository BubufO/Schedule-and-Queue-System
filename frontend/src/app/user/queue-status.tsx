import { Screen, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { UserNav } from '@/components/user-nav';
import { UserVisit } from '@/components/user-visit';
import { useUserQueue } from '@/lib/user-queue';
export default function QueueStatusScreen() {
  const { notifications } = useUserQueue();
  return <Screen title="Queue Status" subtitle="Your position updates automatically as staff serve the queue." nav={<UserNav />}>
    <UserVisit />
    {notifications.map((n, i) => {
      // Notifications are plain strings in production and objects in development.
      const message = typeof n === 'string' ? n : n.message;
      return <Card key={typeof n === 'string' ? `${i}-${n}` : n.id}><ThemedText accessibilityLiveRegion="polite">{message}</ThemedText></Card>;
    })}
  </Screen>;
}
