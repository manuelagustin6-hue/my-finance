import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loading, Screen } from '@/components/ui';
import { useProfile } from '@/hooks/queries';
import { setLanguage } from '@/lib/language';
import type { LanguageCode } from '@/i18n';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; icon: IconName; label: 'home' | 'positions' | 'wallets' | 'market' | 'settings' }[] = [
  { name: 'index', icon: 'pie-chart-outline', label: 'home' },
  { name: 'positions', icon: 'list-outline', label: 'positions' },
  { name: 'wallets', icon: 'wallet-outline', label: 'wallets' },
  { name: 'market', icon: 'search-outline', label: 'market' },
  { name: 'settings', icon: 'settings-outline', label: 'settings' },
];

export default function TabsLayout() {
  const { t } = useTranslation();
  const c = useTheme();
  const profile = useProfile();

  // Aplica el idioma guardado en el perfil.
  useEffect(() => {
    if (profile.data?.locale) setLanguage(profile.data.locale as LanguageCode);
  }, [profile.data?.locale]);

  if (profile.isLoading) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (profile.data && !profile.data.onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: c.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(`tabs.${tab.label}`),
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
