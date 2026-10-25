import { FX_VARIANTS, hasFeature, resolvePreferences } from '@my-finance/core';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import { logOutBilling, manageSubscription } from '@/billing/billing';
import { Card, Chips, Divider, ListItem, Notice, ProBadge, Row, Screen, Section, Text } from '@/components/ui';
import { isDemoMode, repository } from '@/data';
import { useProfile, useUpdateProfile } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { LANGUAGES, type LanguageCode } from '@/i18n';
import { CurrencyField } from '@/components/CurrencyPicker';
import { isBillingConfigured } from '@/lib/config';
import { confirmDestructive } from '@/lib/confirm';
import { shareTextFile, transactionsToCsv } from '@/lib/exporter';
import { i18nLanguage, setLanguage } from '@/lib/language';
import { getSupabase } from '@/lib/supabase';
import { useAppStore, usePlan } from '@/state/app';
import { spacing, useTheme } from '@/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const qc = useQueryClient();
  const plan = usePlan();
  const profile = useProfile();
  const update = useUpdateProfile();
  const email = useAppStore((s) => s.email);
  const billing = useAppStore((s) => s.billing);
  const demoPro = useAppStore((s) => s.demoPro);
  const setDemoPro = useAppStore((s) => s.setDemoPro);
  const setDisplayCurrency = useAppStore((s) => s.setDisplayCurrency);

  const gated = (feature: Parameters<typeof hasFeature>[1], action: () => void) => () =>
    hasFeature(plan, feature) ? action() : router.push(`/paywall?reason=${feature}`);

  const exportJson = gated('export_data', async () => {
    const bundle = await repository.exportAll();
    await shareTextFile(`my-finance-${bundle.exportedAt.slice(0, 10)}.json`, JSON.stringify(bundle, null, 2), 'application/json');
  });

  const exportCsv = gated('export_data', async () => {
    const bundle = await repository.exportAll();
    await shareTextFile(`operaciones-${bundle.exportedAt.slice(0, 10)}.csv`, transactionsToCsv(bundle), 'text/csv');
  });

  const signOut = async () => {
    await logOutBilling();
    await getSupabase().auth.signOut();
    qc.clear();
  };

  const deleteAccount = () =>
    confirmDestructive(t('settings.deleteTitle'), t('settings.deleteBody'), t('common.delete'), t('common.cancel'), async () => {
      await repository.deleteAccount();
      await logOutBilling();
      qc.clear();
      if (isDemoMode) router.replace('/onboarding');
    });

  const planLabel = plan === 'pro' ? t('common.pro') : t('common.free');

  return (
    <Screen>
      {isDemoMode ? (
        <Card>
          <Text variant="heading">{t('settings.demoMode')}</Text>
          <Text muted>{t('settings.demoBody')}</Text>
          {!isBillingConfigured ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Text>{t('settings.demoPro')}</Text>
              <Switch value={demoPro} onValueChange={(v) => void setDemoPro(v)} />
            </Row>
          ) : null}
        </Card>
      ) : null}

      <Section title={t('settings.plan')}>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600' }}>{t('settings.currentPlan', { plan: planLabel })}</Text>
            {plan === 'pro' ? <ProBadge /> : null}
          </Row>
          {billing.expiresAt ? (
            <Text variant="caption" muted>
              {billing.willRenew
                ? t('settings.renews', { date: f.date(billing.expiresAt) })
                : t('settings.expires', { date: f.date(billing.expiresAt) })}
            </Text>
          ) : null}
          <Divider />
          {plan === 'free' ? (
            <ListItem icon="sparkles-outline" title={t('settings.upgrade')} onPress={() => router.push('/paywall')} />
          ) : isBillingConfigured ? (
            <ListItem icon="card-outline" title={t('settings.manage')} onPress={() => void manageSubscription()} />
          ) : null}
        </Card>
      </Section>

      <Section title={t('settings.preferences')}>
        <Card style={{ gap: spacing.md }}>
          <CurrencyField
            label={t('settings.baseCurrency')}
            value={profile.data?.baseCurrency ?? 'USD'}
            onChange={(baseCurrency) => {
              setDisplayCurrency(null);
              update.mutate({ baseCurrency });
            }}
          />
          <CurrencyField
            label={t('settings.secondaryCurrency')}
            value={profile.data?.secondaryCurrency ?? 'USD'}
            onChange={(secondaryCurrency) => {
              setDisplayCurrency(null);
              update.mutate({ secondaryCurrency });
            }}
          />
          <Text variant="caption" muted>
            {t('settings.secondaryHelp')}
          </Text>
          <Chips
            label={t('fx.arsPreference')}
            options={FX_VARIANTS.ARS.map((v) => ({ value: v, label: t(`fx.variants.${v}`) }))}
            value={resolvePreferences(profile.data?.fxPreferences).ARS}
            onChange={(ARS) => update.mutate({ fxPreferences: { ...profile.data?.fxPreferences, ARS } })}
          />
          <Chips
            label={t('fx.vesPreference')}
            options={FX_VARIANTS.VES.map((v) => ({ value: v, label: t(`fx.variants.${v}`) }))}
            value={resolvePreferences(profile.data?.fxPreferences).VES}
            onChange={(VES) => update.mutate({ fxPreferences: { ...profile.data?.fxPreferences, VES } })}
          />
          <Chips
            label={t('settings.language')}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            value={i18nLanguage()}
            onChange={(code: LanguageCode) => {
              setLanguage(code);
              update.mutate({ locale: code });
            }}
          />
        </Card>
      </Section>

      <Section title={t('settings.data')}>
        <Card style={{ paddingVertical: spacing.xs }}>
          <ListItem icon="swap-horizontal-outline" title={t('settings.exchangeRates')} onPress={() => router.push('/fx')} />
          <Divider />
          <ListItem icon="time-outline" title={t('settings.transactions')} onPress={() => router.push('/transactions')} />
          <Divider />
          <ListItem icon="cloud-upload-outline" title={t('settings.import')} onPress={() => router.push('/import')} />
          <Divider />
          <ListItem icon="document-text-outline" title={t('settings.exportCsv')} onPress={exportCsv} />
          <Divider />
          <ListItem icon="code-download-outline" title={t('settings.export')} onPress={exportJson} />
        </Card>
      </Section>

      <Section title={t('settings.account')}>
        <Card style={{ paddingVertical: spacing.xs }}>
          {email ? <ListItem icon="person-circle-outline" title={email} /> : null}
          {!isDemoMode ? (
            <>
              <Divider />
              <ListItem icon="log-out-outline" title={t('settings.signOut')} onPress={() => void signOut()} />
            </>
          ) : null}
          <Divider />
          <View>
            <ListItem icon="trash-outline" title={t('settings.deleteAccount')} onPress={deleteAccount} />
          </View>
        </Card>
      </Section>

      <Section title={t('settings.about')}>
        <Notice text={t('settings.disclaimer')} />
        <Text variant="caption" muted align="center" color={c.muted}>
          {t('settings.version', { version: Constants.expoConfig?.version ?? '0.1.0' })}
        </Text>
      </Section>
    </Screen>
  );
}
