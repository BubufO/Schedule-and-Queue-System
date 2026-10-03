import { Screen, Card } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { UserNav } from '@/components/user-nav';
import { UserVisit } from '@/components/user-visit';
import { useUserQueue } from '@/lib/user-queue';

type Notification = string | { id: string; message: string; title?: string; type?: string };

export default function QueueStatusScreen() {
  const { notifications } = useUserQueue();

  const renderNotification = (notification: Notification) => {
    if (typeof notification === 'string') {
      return notification;
    }
    return notification.message || JSON.stringify(notification);
  };

  const getNotificationKey = (notification: Notification, index: number) => {
    if (typeof notification === 'string') {
      return notification;
    }
    return notification.id || index;
  };

  return (
    <Screen 
      title="Queue Status" 
      subtitle="Your position updates when staff manage the queue in this app session." 
      nav={<UserNav />}
    >
      <UserVisit />
      {notifications.map((notification, index) => (
        <Card key={getNotificationKey(notification, index)}>
          <ThemedText accessibilityLiveRegion="polite">
            {renderNotification(notification)}
          </ThemedText>
        </Card>
      ))}
    </Screen>
  );
}
