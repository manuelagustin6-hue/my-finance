import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button, Screen, Text } from '@/components/ui';
import { useUpdateProfile } from '@/hooks/queries';
import { i18nLanguage } from '@/lib/language';
import { BASE_CURRENCIES } from '@/lib/config';
import { radius, spacing, useTheme } from '@/theme';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const [currency, setCurrency] = useState<string>('USD');
  const update = useUpdateProfile();

  return (
    <Screen>
      <View style={{ gap: spacing.sm, paddingTop: spacing.xl * 2 }}>
        <Text variant="title">{t('onboarding.title')}</Text>
        <Text muted>{t('onboarding.subtitle')}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {BASE_CURRENCIES.map((code) => {
          const active = code === currency;
          return (
            <Pressable
              key={code}
              onPress={() => setCurrency(code)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                width: '31%',
                paddingVertical: spacing.lg,
                borderRadius: radius.md,
                borderWidth: 1,
                alignItems: 'center',
                backgroundColor: active ? c.primary : c.card,
                borderColor: active ? c.primary : c.border,
              }}
            >
              <Text style={{ fontWeight: '700' }} color={active ? c.primaryText : c.text}>
                {code}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        title={t('common.continue')}
        loading={update.isPending}
        onPress={async () => {
          await update.mutateAsync({ baseCurrency: currency, onboarded: true, locale: i18nLanguage() });
          router.replace('/');
        }}
      />
    </Screen>
  );
}
