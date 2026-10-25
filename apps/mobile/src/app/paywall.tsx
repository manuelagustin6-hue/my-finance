import { PLANS, type Feature } from '@my-finance/core';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';
import { getPlanOptions, purchase, restore, type PlanOption } from '@/billing/billing';
import { Button, Card, Loading, Notice, ProBadge, Row, Screen, Text } from '@/components/ui';
import { isBillingConfigured, PRIVACY_URL, TERMS_URL } from '@/lib/config';
import { useAppStore, usePlan } from '@/state/app';
import { radius, spacing, useTheme } from '@/theme';

type Reason = 'wallets' | 'assets' | 'imports' | Feature;

const FEATURES = ['unlimited', 'analytics', 'fundamentals', 'history', 'imports', 'export'] as const;

export default function PaywallScreen() {
  const { reason } = useLocalSearchParams<{ reason?: Reason }>();
  const { t } = useTranslation();
  const c = useTheme();
  const plan = usePlan();
  const setBilling = useAppStore((s) => s.setBilling);
  const setDemoPro = useAppStore((s) => s.setDemoPro);
  const options = useQuery({ queryKey: ['plan-options'], queryFn: getPlanOptions });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const list = options.data ?? [];
  const selected: PlanOption | undefined = list.find((o) => o.id === selectedId) ?? list.find((o) => o.kind === 'annual') ?? list[0];

  const limits = { wallets: PLANS.free.maxWallets, assets: PLANS.free.maxAssets, imports: PLANS.free.maxImports };
  const reasonText = reason
    ? t(`paywall.reasons.${reason}`, { limit: reason in limits ? limits[reason as keyof typeof limits] : undefined })
    : undefined;

  const subscribe = async () => {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      if (!isBillingConfigured) {
        await setDemoPro(true);
        router.back();
        return;
      }
      const state = await purchase(selected);
      if (state) {
        setBilling(state);
        if (state.isPro) router.back();
      }
    } catch {
      setMessage(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setBusy(true);
    try {
      const state = await restore();
      setBilling(state);
      setMessage(state.isPro ? t('paywall.restored') : t('paywall.nothingToRestore'));
    } catch {
      setMessage(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Row>
          <ProBadge />
        </Row>
        <Text variant="title">{t('paywall.title')}</Text>
        <Text muted>{t('paywall.subtitle')}</Text>
      </View>

      {reasonText ? <Notice text={reasonText} /> : null}

      <Card style={{ gap: spacing.md }}>
        {FEATURES.map((key) => (
          <Row key={key} gap={spacing.md}>
            <Ionicons name="checkmark-circle" size={20} color={c.pro} />
            <Text style={{ flex: 1 }}>{t(`paywall.features.${key}`)}</Text>
          </Row>
        ))}
      </Card>

      {plan === 'pro' ? (
        <Notice text={t('paywall.alreadyPro')} />
      ) : options.isLoading ? (
        <Loading />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {list.map((o) => {
            const active = o.id === selected?.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => setSelectedId(o.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={{
                  borderWidth: 2,
                  borderColor: active ? c.pro : c.border,
                  backgroundColor: c.card,
                  borderRadius: radius.lg,
                  padding: spacing.lg,
                  gap: spacing.xs,
                }}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="heading">{o.kind === 'annual' ? t('paywall.annual') : o.kind === 'monthly' ? t('paywall.monthly') : o.title}</Text>
                  <Text variant="heading">{o.priceString}</Text>
                </Row>
                {o.monthlyEquivalent ? (
                  <Text muted variant="caption">
                    {t('paywall.perMonth', { price: o.monthlyEquivalent })}
                  </Text>
                ) : null}
                {o.freeTrial ? (
                  <Text variant="caption" color={c.pro}>
                    {t('paywall.trial', { days: o.freeTrial })}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {!isBillingConfigured ? <Notice text={t('paywall.demoNote')} /> : null}
          <Button
            title={isBillingConfigured ? t('paywall.subscribe') : t('paywall.activateDemo')}
            variant="pro"
            loading={busy}
            disabled={!selected}
            onPress={subscribe}
          />
          {isBillingConfigured ? <Button title={t('paywall.restore')} variant="ghost" onPress={onRestore} disabled={busy} /> : null}
        </View>
      )}

      {message ? <Notice text={message} /> : null}

      <Text variant="caption" muted>
        {t('paywall.legal')}
      </Text>
      <Row style={{ justifyContent: 'center' }} gap={spacing.lg}>
        <Button title={t('paywall.terms')} variant="ghost" small onPress={() => void Linking.openURL(TERMS_URL)} />
        <Button title={t('paywall.privacy')} variant="ghost" small onPress={() => void Linking.openURL(PRIVACY_URL)} />
      </Row>
    </Screen>
  );
}
