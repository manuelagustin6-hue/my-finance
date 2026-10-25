import {
  canAddAsset,
  isOpening,
  OPENING_NOTE,
  type Asset,
  type Transaction,
  type Wallet,
} from '@my-finance/core';
import { useQueries } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AssetLogo } from '@/components/AssetLogo';
import { AssetSearch, pickedInfo, pickedKey, type PickedAsset } from '@/components/AssetSearch';
import { Button, Card, Chips, Divider, Field, Loading, Notice, Row, Screen, Section, Text } from '@/components/ui';
import { isPlanLimitError, market, repository, type NewTransaction } from '@/data';
import { refOf, useInvalidateUserData, usePortfolio } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { confirmDestructive, parseInput } from '@/lib/confirm';
import { usePlan } from '@/state/app';
import { spacing, useTheme } from '@/theme';

type CostMode = 'market' | 'manual';

interface Entry {
  key: string;
  picked: PickedAsset;
  quantity: string;
  mode: CostMode;
  cost: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultDate(): string {
  return `${new Date().getFullYear() - 1}-12-31`;
}

export default function OpeningScreen() {
  const params = useLocalSearchParams<{ walletId?: string }>();
  const p = usePortfolio();
  if (p.isLoading) return <Screen><Loading /></Screen>;
  const wallet = p.wallets.find((w) => w.id === params.walletId) ?? p.wallets[0];
  if (!wallet) {
    return (
      <Screen>
        <NeedWallet />
      </Screen>
    );
  }
  return <OpeningForm key={wallet.id} initialWallet={wallet} />;
}

function NeedWallet() {
  const { t } = useTranslation();
  return (
    <>
      <Notice text={t('tx.needWallet')} />
      <Button title={t('home.createWallet')} onPress={() => router.replace('/wallet/new')} />
    </>
  );
}

function OpeningForm({ initialWallet }: { initialWallet: Wallet }) {
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const plan = usePlan();
  const p = usePortfolio();
  const invalidate = useInvalidateUserData();
  const [walletId, setWalletId] = useState(initialWallet.id);
  const wallet = p.wallets.find((w) => w.id === walletId) ?? initialWallet;

  const existingOpening = (id: string) => p.transactions.filter((tx) => tx.walletId === id && isOpening(tx));
  const entriesFrom = (txs: Transaction[]): Entry[] =>
    txs.flatMap((tx) => {
      const asset = p.assetsById.get(tx.assetId);
      if (!asset) return [];
      const picked: PickedAsset = { kind: 'owned', asset };
      return [{ key: pickedKey(picked), picked, quantity: String(tx.quantity), mode: 'manual' as CostMode, cost: String(tx.price) }];
    });

  const [date, setDate] = useState(initialWallet.openingDate ?? defaultDate());
  const [entries, setEntries] = useState<Entry[]>(() => entriesFrom(existingOpening(initialWallet.id)));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const dateValid = DATE_RE.test(date) && !Number.isNaN(Date.parse(date)) && date <= today;

  // Precio de mercado de cada activo en la fecha elegida.
  const prices = useQueries({
    queries: entries.map((e) => {
      const ref = refOf(pickedInfo(e.picked));
      return {
        queryKey: ['price-on', ref?.type, ref?.providerId, date],
        queryFn: () => market.priceOn(ref!, date),
        enabled: !!ref && dateValid,
        staleTime: 60 * 60_000,
      };
    }),
  });

  /** Unidades a las que corresponde el precio de mercado (bonos: 100 nominales). */
  const unitOf = (i: number) => prices[i]?.data?.unit ?? 1;

  /** Costo por unidad: el cargado a mano o el precio de mercado de la fecha. */
  const unitCost = (e: Entry, i: number): number | undefined => {
    if (e.mode === 'manual') {
      const v = parseInput(e.cost);
      return v !== undefined && v >= 0 ? v : undefined;
    }
    const close = prices[i]?.data?.close;
    return close !== undefined ? close / unitOf(i) : undefined;
  };

  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const addPicked = (picked: PickedAsset) => {
    const info = pickedInfo(picked);
    const hasMarket = 'providerId' in info && !!info.providerId;
    setEntries((list) => [...list, { key: pickedKey(picked), picked, quantity: '', mode: hasMarket ? 'market' : 'manual', cost: '' }]);
  };

  const switchWallet = (id: string) => {
    const w = p.wallets.find((x) => x.id === id);
    setWalletId(id);
    setDate(w?.openingDate ?? defaultDate());
    setEntries(entriesFrom(existingOpening(id)));
    setSubmitted(false);
  };

  const entryErrors = entries.map((e, i) => {
    const q = parseInput(e.quantity);
    if (!(q !== undefined && q > 0)) return t('tx.errors.quantity');
    if (unitCost(e, i) === undefined) return e.mode === 'market' && !prices[i]?.isLoading ? t('opening.noMarketPrice') : t('tx.errors.price');
    return undefined;
  });
  const totalValue = entries.reduce((sum, e, i) => {
    const q = parseInput(e.quantity) ?? 0;
    const cost = unitCost(e, i) ?? 0;
    const asset = pickedInfo(e.picked);
    const rate = p.fxHistorical?.(asset.currency, p.base ?? 'USD', date) ?? 1;
    return sum + q * cost * rate;
  }, 0);

  const save = async () => {
    setSubmitted(true);
    setError(null);
    if (!dateValid || entries.length === 0 || entryErrors.some(Boolean)) return;

    // Límite de activos del plan Gratis.
    const held = new Set(p.transactions.map((tx) => tx.assetId));
    for (const e of entries) {
      const id = e.picked.kind === 'owned' ? e.picked.asset.id : `new:${e.key}`;
      if (!canAddAsset(plan, held, id).allowed) {
        router.replace('/paywall?reason=assets');
        return;
      }
      held.add(id);
    }

    setSaving(true);
    try {
      const assets: Asset[] = [];
      for (const e of entries) {
        assets.push(e.picked.kind === 'owned' ? e.picked.asset : await repository.ensureAsset(e.picked.result));
      }
      for (const tx of existingOpening(wallet.id)) await repository.deleteTransaction(tx.id);
      const transactions: NewTransaction[] = entries.map((e, i) => ({
        walletId: wallet.id,
        assetId: assets[i]!.id,
        type: 'deposit',
        quantity: parseInput(e.quantity)!,
        price: unitCost(e, i)!,
        fee: 0,
        currency: assets[i]!.currency,
        date,
        note: OPENING_NOTE,
        source: 'opening',
      }));
      await repository.saveTransactions(transactions);
      await repository.saveWallet({ ...wallet, openingDate: date });
      await invalidate();
      router.back();
    } catch (err) {
      if (isPlanLimitError(err)) router.replace(`/paywall?reason=${err.reason}`);
      else setError(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    confirmDestructive(t('opening.remove'), t('opening.removeBody'), t('common.delete'), t('common.cancel'), async () => {
      setSaving(true);
      try {
        for (const tx of existingOpening(wallet.id)) await repository.deleteTransaction(tx.id);
        await repository.saveWallet({ ...wallet, openingDate: undefined });
        await invalidate();
        router.back();
      } finally {
        setSaving(false);
      }
    });

  return (
    <Screen>
      <Text muted>{t('opening.intro')}</Text>
      {p.wallets.length > 1 ? (
        <Chips label={t('tx.wallet')} options={p.wallets.map((w) => ({ value: w.id, label: w.name }))} value={walletId} onChange={switchWallet} />
      ) : null}
      <Field
        label={t('opening.date')}
        value={date}
        onChangeText={setDate}
        placeholder="2024-12-31"
        maxLength={10}
        help={t('opening.dateHelp')}
        error={submitted && !dateValid ? t('opening.errors.date') : undefined}
      />

      <Section title={t('opening.holdings')}>
        {entries.length === 0 ? <Text muted>{t('opening.empty')}</Text> : null}
        {entries.map((e, i) => {
          const info = pickedInfo(e.picked);
          const hasMarket = 'providerId' in info && !!info.providerId;
          const price = prices[i];
          const err = submitted ? entryErrors[i] : undefined;
          return (
            <Card key={e.key} style={{ gap: spacing.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={spacing.sm} style={{ flex: 1 }}>
                  <AssetLogo asset={info} index={i} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600' }} numberOfLines={1}>
                      {info.symbol} · {info.name}
                    </Text>
                    <Text variant="caption" muted>
                      {t(`assetTypes.${info.type}`)} · {info.currency}
                    </Text>
                  </View>
                </Row>
                <Button title={t('common.delete')} variant="ghost" small onPress={() => setEntries((l) => l.filter((x) => x.key !== e.key))} />
              </Row>
              <Field label={t('opening.quantity')} value={e.quantity} onChangeText={(v) => update(e.key, { quantity: v })} keyboardType="decimal-pad" />
              {hasMarket ? (
                <Chips
                  label={t('opening.costMode')}
                  options={[
                    { value: 'market' as CostMode, label: t('opening.market') },
                    { value: 'manual' as CostMode, label: t('opening.manual') },
                  ]}
                  value={e.mode}
                  onChange={(mode) => update(e.key, { mode })}
                />
              ) : null}
              {e.mode === 'manual' ? (
                <Field
                  label={t('opening.unitCost', { currency: info.currency })}
                  value={e.cost}
                  onChangeText={(v) => update(e.key, { cost: v })}
                  keyboardType="decimal-pad"
                  help={unitOf(i) !== 1 ? t('opening.perUnitHelp', { unit: unitOf(i) }) : undefined}
                />
              ) : price?.isLoading ? (
                <Loading />
              ) : price?.data ? (
                <Text variant="caption" muted>
                  {t('opening.marketPrice', { date: f.date(price.data.date), price: f.money(price.data.close, info.currency) })}
                  {unitOf(i) !== 1 ? ` · ${t('tx.perUnits', { unit: unitOf(i) })}` : ''}
                </Text>
              ) : null}
              {err ? (
                <Text variant="caption" color={c.negative}>
                  {err}
                </Text>
              ) : null}
            </Card>
          );
        })}
        <AssetSearch owned={p.assets} onSelect={addPicked} exclude={entries.map((e) => e.key)} />
      </Section>

      {entries.length > 0 && totalValue > 0 ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text muted>{t('opening.value')}</Text>
            <Text style={{ fontWeight: '700' }}>{f.money(totalValue, p.base ?? 'USD')}</Text>
          </Row>
        </Card>
      ) : null}

      {error ? <Notice tone="warning" text={error} /> : null}
      <Button title={t('opening.save')} onPress={save} loading={saving} disabled={entries.length === 0} />
      {wallet.openingDate ? (
        <>
          <Divider />
          <Button title={t('opening.remove')} variant="danger" onPress={remove} />
        </>
      ) : null}
    </Screen>
  );
}
