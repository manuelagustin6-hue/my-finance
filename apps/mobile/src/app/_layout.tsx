import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';
import { Loading, Screen } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/config';
import { useAppStore } from '@/state/app';
import { useBootstrap } from '@/state/bootstrap';
import { useTheme } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RootNavigator() {
  const { t } = useTranslation();
  const c = useTheme();
  const ready = useAppStore((s) => s.ready);
  const userId = useAppStore((s) => s.userId);
  const signedIn = !isSupabaseConfigured || !!userId;

  if (!ready) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="asset/[id]" options={{ title: '' }} />
        <Stack.Screen name="wallet/[id]" options={{ title: t('wallets.edit') }} />
        <Stack.Screen name="transaction" options={{ title: t('tx.new'), presentation: 'modal' }} />
        <Stack.Screen name="import" options={{ title: t('importer.title'), presentation: 'modal' }} />
        <Stack.Screen name="custom-asset" options={{ title: t('market.customTitle'), presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="analytics" options={{ title: t('analytics.title') }} />
        <Stack.Screen name="transactions" options={{ title: t('tx.history') }} />
        <Stack.Screen name="fx" options={{ title: t('fx.title') }} />
        <Stack.Screen name="opening" options={{ title: t('opening.title'), presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useBootstrap();
  const scheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <RootNavigator />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
