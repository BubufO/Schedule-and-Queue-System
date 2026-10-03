import { useRouter } from 'expo-router';
import { Screen, Card, AppButton, SectionLabel } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { UserNav } from '@/components/user-nav';
import { UserVisit } from '@/components/user-visit';
import { useUserQueue } from '@/lib/user-queue';
export default function UserDashboardScreen() {
  const { session, services, notifications } = useUserQueue();
  const router = useRouter();
  const open = services.filter(s => s.isOpen);
  return <Screen
    title="User Dashboard"
    subtitle={`Welcome, ${session?.account.displayName ?? ''}`}
    nav={<UserNav />}
    action={<AppButton label="Settings" onPress={() => router.push('/user/settings')} />}>
    <SectionLabel>Current queue</SectionLabel>
    <UserVisit />
    <AppButton label="View queue status" onPress={() => router.push('/user/queue-status')} />

    <SectionLabel>{`Notifications (${notifications.length})`}</SectionLabel>
    <AppButton label={`View notifications (${notifications.length})`} onPress={() => router.push('/user/notifications')} />

    <SectionLabel>{`Available services (${open.length})`}</SectionLabel>
    {!open.length && <Card><ThemedText>No services are open right now.</ThemedText></Card>}
    {open.map(service => <Card key={service.id}>
      <ThemedText type="smallBold">{service.name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{service.description}</ThemedText>
    </Card>)}
    <AppButton label="Browse and join a service" variant="primary" onPress={() => router.push('/user/join-queue')} />
  </Screen>;
}
