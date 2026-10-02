import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/lib/theme';
import { useTheme } from '@/lib/use-theme';

export type ThemedViewProps = ViewProps & {
  type?: ThemeColor;
};

export function ThemedView({ style, type, ...rest }: ThemedViewProps) {
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme[type ?? 'background'] }, style]} {...rest} />;
}
