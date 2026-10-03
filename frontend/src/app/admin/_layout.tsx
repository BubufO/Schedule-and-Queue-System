// Groups the admin screens (Overview, Services, Queues) under the single Admin tab.
// Only a signed-in administrator gets past this guard; everyone else is sent to sign in.

import { Slot, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { AppButton, Card, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth-store';

export default function AdminLayout() {
  const { session } = useAuth();
  const router = useRouter();
  if (!session || session.account.role !== 'admin') {
    return (
      <Screen title="Administrator access">
        <Card>
          <ThemedText>Sign in with an administrator account to manage services and queues.</ThemedText>
          <AppButton label="Sign in" variant="primary" onPress={() => router.push('/login')} />
        </Card>
      </Screen>
    );
  }
  return <Slot />;
}
