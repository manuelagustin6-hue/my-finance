import { FX_VARIANTS, FxTable, MAIN_CURRENCIES, resolvePreferences, type FxPreferences, type VariantCurrency } from '@my-finance/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { CurrencyField, useCurrencyLabel } from '@/components/CurrencyPicker';
import { Card, Divider, ErrorState, Field, ListItem, Loading, Notice, Row, Screen, Section, Text } from '@/components/ui';
import { useFxSnapshot, useProfile, useUpdateProfile } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { parseInput } from '@/lib/confirm';
import { spacing, useTheme } from '@/theme';

export default function FxScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const nameOf = useCurrencyLabel();
  const profile = useProfile();
  const update = useUpdateProfile();
  const prefs = profile.data?.fxPreferences;
  const fx = useFxSnapshot(prefs);
  const base = profile.data?.baseCurrency ?? 'USD';
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState<string | undefined>();

  if (fx.isLoading || profile.isLoading) return <Screen><Loading /></Screen>;
  if (fx.isError || !fx.data) return <Screen><ErrorState onRetry={() => void fx.refetch()} /></Screen>;

  const snap = fx.data;
  const table = new FxTable(snap.rates);
  const target = to ?? (base === 'USD' ? 'ARS' : base);
  const value = parseInput(amount);
  const converted = value !== undefined && Number.isFinite(value) ? value * (table.rate(from, target) ?? NaN) : undefined;
  const chosen = resolvePreferences(prefs);

  const setPreference = (currency: VariantCurrency, variant: string) => {
    const next = { ...prefs, [currency]: variant } as FxPreferences;
    update.mutate({ fxPreferences: next });
  };

  return (
    <Screen refreshing={fx.isFetching} onRefresh={() => void fx.refetch()}>
      <Text muted>{t('fx.subtitle')}</Text>
      {snap.source === 'fallback' ? <Notice tone="warning" text={t('fx.fallback')} /> : null}

      <Section title={t('fx.converter')}>
        <Card style={{ gap: spacing.md }}>
          <Field label={t('fx.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <CurrencyField label={t('fx.from')} value={from} onChange={setFrom} includeStablecoins />
          <CurrencyField label={t('fx.to')} value={target} onChange={setTo} includeStablecoins />
          <Text variant="title">{converted !== undefined && Number.isFinite(converted) ? f.money(converted, target) : '—'}</Text>
          {from !== 'USD' && target !== 'USD' ? (
            <Text variant="caption" muted>
              {`1 ${from} = ${f.num(table.rate(from, 'USD') ?? NaN, 6)} USD · 1 USD = ${f.num(table.perUsd(target) ?? NaN, 4)} ${target}`}
            </Text>
          ) : null}
        </Card>
      </Section>

      {(Object.keys(FX_VARIANTS) as VariantCurrency[]).map((currency) => {
        const quotes = snap.variants[currency];
        if (!quotes) return null;
        return (
          <Section key={currency} title={currency === 'ARS' ? t('fx.arsTitle') : t('fx.vesTitle')}>
            <Card style={{ paddingVertical: spacing.xs }}>
              {FX_VARIANTS[currency].map((variant, i) => {
                const q = quotes[variant];
                if (!q) return null;
                const active = chosen[currency] === variant;
                return (
                  <View key={variant}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable
                      onPress={() => setPreference(currency, variant)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={{ paddingVertical: spacing.md, gap: 2 }}
                    >
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={{ fontWeight: '600' }}>{t(`fx.variants.${variant}`)}</Text>
                        {active ? (
                          <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                            {t('fx.inUse')}
                          </Text>
                        ) : null}
                      </Row>
                      <Text variant="caption" muted>
                        {[
                          q.buy ? `${t('fx.buy')}: ${f.money(q.buy, currency)}` : undefined,
                          `${t('fx.sell')}: ${f.money(q.sell, currency)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
            <Text variant="caption" muted>
              {t('fx.preferenceHelp')}
            </Text>
          </Section>
        );
      })}

      <Section title={t('fx.ratesTitle')}>
        <Card style={{ paddingVertical: spacing.xs }}>
          {MAIN_CURRENCIES.filter((x) => x.code !== 'USD' && table.perUsd(x.code) !== undefined).map((x, i) => {
            const perUsd = table.perUsd(x.code)!;
            const inBase = base !== x.code && base !== 'USD' ? table.rate(x.code, base) : undefined;
            return (
              <View key={x.code}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  title={nameOf(x.code)}
                  right={t('fx.perUsd', { value: f.money(perUsd, x.code) })}
                  rightSub={inBase !== undefined ? `1 ${x.code} = ${f.money(inBase, base)}` : undefined}
                />
              </View>
            );
          })}
        </Card>
      </Section>

      <Text variant="caption" muted>
        {t('fx.updated', { date: f.date(snap.date) })} · {t('fx.sources')}
      </Text>
    </Screen>
  );
}
