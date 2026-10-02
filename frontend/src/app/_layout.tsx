import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-splash';
import AppTabs from '@/components/app-tabs';
import { AuthProvider } from '@/lib/auth-store';
import { QueueStoreProvider } from '@/lib/queue-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <QueueStoreProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
        </QueueStoreProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
