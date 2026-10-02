// Secondary navigation shared by the admin screens.

import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/use-theme';

const links = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/queue', label: 'Queues' },
] as const;

export function AdminNav() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <View style={[styles.nav, { backgroundColor: theme.backgroundElement }]}>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Pressable
            key={link.href}
            accessibilityRole="link"
            accessibilityState={{ selected: active }}
            onPress={() => router.navigate(link.href)}
            style={[styles.item, active && { backgroundColor: theme.background }]}>
            <Text style={[styles.label, { color: active ? theme.text : theme.textSecondary }]}>
              {link.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 10,
    padding: 3,
  },
  item: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
  },
});
