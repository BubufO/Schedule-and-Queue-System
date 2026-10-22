// Shown at the top of every screen while the backend can't be reached.

import { StyleSheet, Text, View } from 'react-native';

import { useQueueStore } from '@/lib/queue-store';
import { Spacing } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';

export function ApiStatusBanner() {
  const { loadError } = useQueueStore();
  const theme = useTheme();
  if (!loadError) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: theme.dangerBackground }]}>
      <Text style={[styles.title, { color: theme.danger }]}>{loadError}</Text>
      <Text style={[styles.hint, { color: theme.danger }]}>
        Start it with "uv run fastapi dev" in the backend folder. This page retries on its own.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
  },
  hint: {
    fontSize: 13,
  },
});
