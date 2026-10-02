import { Slot, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-store';
import { Screen, Card, AppButton } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
export default function UserLayout() {
  const { session } = useAuth();
  const router = useRouter();
  if (!session || session.account.role !== 'client') return <Screen title="User services"><Card>
    <ThemedText>Sign in with a client account to view your queues and history.</ThemedText>
    <AppButton label="Sign in" variant="primary" onPress={() => router.push('/login')} />
  </Card></Screen>;
  return <Slot />;
}
