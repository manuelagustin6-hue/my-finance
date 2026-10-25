import { calculateFee, WALLET_TYPES, type Wallet, type WalletType } from '@my-finance/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PositionRow } from '@/components/PositionRow';
import { Button, Card, Chips, Divider, Field, Loading, Row, Screen, Section, Text } from '@/components/ui';
import { isPlanLimitError } from '@/data';
import { useDeleteWallet, usePortfolio, useSaveWallet, useWallets } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { BASE_CURRENCIES } from '@/lib/config';
import { confirmDestructive, parseInput } from '@/lib/confirm';
import { spacing } from '@/theme';

const CURRENCIES = [...BASE_CURRENCIES, 'USDT'];

export default function WalletScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wallets = useWallets();
  if (id !== 'new' && wallets.isLoading) return <Screen><Loading /></Screen>;
  const existing = wallets.data?.find((w) => w.id === id);
  return <WalletForm key={existing?.id ?? 'new'} id={id} existing={existing} />;
}

const asText = (n: number) => (n ? String(n) : '');

function WalletForm({ id, existing }: { id: string; existing?: Wallet }) {
  const isNew = id === 'new';
  const { t } = useTranslation();
  const f = useFormat();
  const save = useSaveWallet();
  const remove = useDeleteWallet();
  const portfolio = usePortfolio(isNew ? '__none__' : id);

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<WalletType>(existing?.type ?? 'exchange');
  const [currency, setCurrency] = useState(existing?.currency ?? 'USD');
  const [percent, setPercent] = useState(asText(existing?.fees.percent ?? 0));
  const [fixed, setFixed] = useState(asText(existing?.fees.fixed ?? 0));
  const [minimum, setMinimum] = useState(asText(existing?.fees.minimum ?? 0));
  const [submitted, setSubmitted] = useState(false);

  const fees = {
    percent: parseInput(percent) ?? 0,
    fixed: parseInput(fixed) ?? 0,
    minimum: parseInput(minimum) ?? 0,
  };
  const invalid = (v: number) => Number.isNaN(v) || v < 0;
  const errors = {
    name: name.trim() === '' ? t('wallets.nameRequired') : undefined,
    percent: invalid(fees.percent) || fees.percent >= 100 ? t('tx.errors.fee') : undefined,
    fixed: invalid(fees.fixed) ? t('tx.errors.fee') : undefined,
    minimum: invalid(fees.minimum) ? t('tx.errors.fee') : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const exampleAmount = 1000;

  const submit = async () => {
    setSubmitted(true);
    if (hasErrors) return;
    try {
      await save.mutateAsync({ id: isNew ? undefined : id, name: name.trim(), type, currency, fees });
      router.back();
    } catch (error) {
      if (isPlanLimitError(error)) router.replace(`/paywall?reason=${error.reason}`);
      else throw error;
    }
  };

  const holdings = portfolio.summary?.positions ?? [];
  const base = portfolio.base ?? 'USD';

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t('wallets.new') : t('wallets.edit') }} />
      <Field
        label={t('wallets.name')}
        placeholder={t('wallets.namePlaceholder')}
        value={name}
        onChangeText={setName}
        error={submitted ? errors.name : undefined}
        maxLength={80}
      />
      <Chips
        label={t('wallets.type')}
        options={WALLET_TYPES.map((w) => ({ value: w, label: t(`walletTypes.${w}`) }))}
        value={type}
        onChange={setType}
      />
      <Chips label={t('wallets.currency')} options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={currency} onChange={setCurrency} />

      <Section title={t('wallets.fees')}>
        <Card style={{ gap: spacing.md }}>
          <Text variant="caption" muted>
            {t('wallets.feeHelp')}
          </Text>
          <Row gap={spacing.sm} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label={t('wallets.feePercent')} value={percent} onChangeText={setPercent} keyboardType="decimal-pad" placeholder="0" error={errors.percent} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('wallets.feeFixed')} value={fixed} onChangeText={setFixed} keyboardType="decimal-pad" placeholder="0" error={errors.fixed} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('wallets.feeMinimum')} value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" placeholder="0" error={errors.minimum} />
            </View>
          </Row>
          {!errors.percent && !errors.fixed && !errors.minimum ? (
            <Text variant="caption">
              {t('wallets.feeExample', {
                amount: f.money(exampleAmount, currency),
                fee: f.money(calculateFee(fees, exampleAmount), currency),
              })}
            </Text>
          ) : null}
        </Card>
      </Section>

      <Button title={t('common.save')} onPress={submit} loading={save.isPending} />

      {!isNew && holdings.length > 0 ? (
        <Section title={t('wallets.holdings')}>
          <Card style={{ paddingVertical: spacing.xs }}>
            {holdings.map((pos, i) => (
              <View key={pos.assetId}>
                {i > 0 ? <Divider /> : null}
                <PositionRow position={pos} asset={portfolio.assetsById.get(pos.assetId)} base={base} index={i} />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {!isNew ? (
        <Button
          title={t('wallets.deleteTitle')}
          variant="danger"
          loading={remove.isPending}
          onPress={() =>
            confirmDestructive(t('wallets.deleteTitle'), t('wallets.deleteBody'), t('common.delete'), t('common.cancel'), async () => {
              await remove.mutateAsync(id);
              router.back();
            })
          }
        />
      ) : null}
    </Screen>
  );
}
