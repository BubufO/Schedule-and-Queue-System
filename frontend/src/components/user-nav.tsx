import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/lib/use-theme';
const links = [
  { href: '/user', label: 'Dashboard' },
  { href: '/user/join-queue', label: 'Join Queue' },
  { href: '/user/queue-status', label: 'Queue Status' },
  { href: '/user/history', label: 'History' },
] as const;
export function UserNav() {
  const pathname = usePathname(), router = useRouter(), theme = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
    {links.map(link => <Pressable key={link.href} accessibilityRole="link" accessibilityState={{ selected: pathname === link.href }} onPress={() => router.navigate(link.href)} style={{ padding: 10, borderRadius: 8, backgroundColor: pathname === link.href ? theme.backgroundSelected : theme.backgroundElement }}>
      <ThemedText type="small">{link.label}</ThemedText>
    </Pressable>)}
  </View>;
}
