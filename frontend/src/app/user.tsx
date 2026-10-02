// User Dashboard: placeholder, to be designed in a later assignment.

import { Badge, Card, Screen } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';

export default function UserDashboardScreen() {
  return (
    <Screen title="User Dashboard">
      <Card>
        <Badge label="Coming soon" />
        <ThemedText type="small" themeColor="textSecondary">
          This screen hasn&apos;t been built yet.
        </ThemedText>
      </Card>
    </Screen>
  );
}
