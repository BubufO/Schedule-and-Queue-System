import { Colors } from '@/lib/theme';
import { useColorScheme } from '@/lib/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Colors[theme];
}
