import {
  AMOUNT_TYPES,
  calculateFee,
  canAddAsset,
  roundTo,
  TRANSACTION_TYPES,
  type Asset,
  type AssetSearchResult,
  type TransactionType,
} from '@my-finance/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AssetAvatar } from '@/components/PositionRow';
import { Button, Card, Chips, Divider, Field, ListItem, Loading, Notice, Row, Screen, Text } from '@/components/ui';
import { isPlanLimitError, market, repository } from '@/data';
import { useDeleteTransaction, usePortfolio, useSaveTransactions, useSearch } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { BASE_CURRENCIES } from '@/lib/config';
import { confirmDestructive, parseInput } from '@/lib/confirm';
import { todayIso } from '@/lib/id';
import { usePlan } from '@/state/app';
import { spacing } from '@/theme';

type Selected = { kind: 'owned'; asset: Asset } | { kind: 'search'; result: AssetSearchResult };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRADE_TYPES: TransactionType[] = ['buy', 'sell'];

/** Redondea la comisión calculada a centavos (o a 8 decimales si es menor a un centavo). */
function roundFee(value: number): number {
  return value >= 0.01 ? roundTo(value, 2) : roundTo(value, 8);
}

function selectedInfo(s: Selected) {
  return s.kind === 'owned' ? s.asset : s.result;
}

type Params = { id?: string; assetId?: string; providerId?: string; type?: string; walletId?: string };

export default function TransactionScreen() {
  const params = useLocalSearchParams<Params>();
  const p = usePortfolio();
  if (p.isLoading) return <Screen><Loading /></Screen>;
  return <TransactionForm params={params} />;
}

function TransactionForm({ params }: { params: Params }) {
  const { t } = useTranslation();
  const f = useFormat();
  const plan = usePlan();
  const p = usePortfolio();
  const save = useSaveTransactions();
  const remove = useDeleteTransaction();
  const base = p.base ?? 'USD';

  // Valores iniciales: operación a editar, activo recibido por parámetro o primera billetera.
  const [initial] = useState(() => {
    const editing = params.id ? p.transactions.find((tx) => tx.id === params.id) : undefined;
    const owned = editing
      ? p.assetsById.get(editing.assetId)
      : params.assetId
        ? p.assetsById.get(params.assetId)
        : params.providerId
          ? p.assets.find((a) => a.providerId === params.providerId && a.type === params.type)
          : undefined;
    return {
      editing,
      selected: owned ? ({ kind: 'owned', asset: owned } as Selected) : undefined,
      currency: editing?.currency ?? owned?.currency ?? base,
      /** Activo a buscar en el proveedor cuando todavía no está en la cartera. */
      pendingProvider: !owned && !editing && params.providerId && params.type ? { providerId: params.providerId, type: params.type } : undefined,
    };
  });
  const editing = initial.editing;

  const [walletId, setWalletId] = useState<string | undefined>(editing?.walletId ?? params.walletId ?? p.wallets[0]?.id);
  const [selected, setSelected] = useState<Selected | undefined>(initial.selected);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TransactionType>(editing?.type ?? 'buy');
  const [date, setDate] = useState(editing ? editing.date.slice(0, 10) : todayIso());
  const [quantity, setQuantity] = useState(editing?.quantity ? String(editing.quantity) : '');
  const [price, setPrice] = useState(editing?.price ? String(editing.price) : '');
  const [amount, setAmount] = useState(editing?.amount !== undefined ? String(editing.amount) : '');
  const [fee, setFee] = useState(editing?.fee ? String(editing.fee) : '');
  const [feeTouched, setFeeTouched] = useState(!!editing);
  const [currency, setCurrency] = useState<string>(initial.currency);
  const [fxRate, setFxRate] = useState(editing?.fxRate && editing.fxBase === base ? String(editing.fxRate) : '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useSearch(selected ? '' : query);

  useEffect(() => {
    const pending = initial.pendingProvider;
    if (!pending) return;
    void market.search(pending.providerId).then((results) => {
      const match = results.find((r) => r.providerId === pending.providerId && r.type === pending.type);
      if (match) {
        setSelected({ kind: 'search', result: match });
        setCurrency(match.currency);
      }
    });
  }, [initial.pendingProvider]);

  const wallet = p.wallets.find((w) => w.id === walletId);
  const info = selected ? selectedInfo(selected) : undefined;
  const isAmountType = AMOUNT_TYPES.includes(type);
  const isSplit = type === 'split';
  const isTransfer = ['deposit', 'withdraw', 'transfer_in', 'transfer_out'].includes(type);

  // Precarga el precio actual al elegir un activo con cotización.
  useEffect(() => {
    if (!info || editing || price !== '' || !('providerId' in info) || !info.providerId) return;
    void market.quotes([{ providerId: info.providerId, type: info.type }]).then(([q]) => {
      if (q) setPrice((current) => (current === '' ? String(Number(q.price.toPrecision(8))) : current));
    });
    // Solo al cambiar de activo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.symbol, info?.type]);

  const qty = parseInput(quantity);
  const px = parseInput(price);
  const amt = parseInput(amount);
  const gross = isAmountType ? (amt ?? 0) : (qty ?? 0) * (px ?? 0);
  const autoFee = wallet && TRADE_TYPES.includes(type) && Number.isFinite(gross) ? roundFee(calculateFee(wallet.fees, gross)) : 0;
  const feeValue = feeTouched ? (parseInput(fee) ?? 0) : autoFee;
  const fx = parseInput(fxRate);

  const errors = {
    wallet: !wallet ? t('tx.errors.wallet') : undefined,
    asset: !info ? t('tx.errors.asset') : undefined,
    date: !DATE_RE.test(date) || Number.isNaN(Date.parse(date)) ? t('tx.errors.date') : undefined,
    quantity: !isAmountType && !(qty !== undefined && qty > 0) ? t('tx.errors.quantity') : undefined,
    price: !isAmountType && !isSplit && !(px !== undefined && px >= 0) ? t('tx.errors.price') : undefined,
    amount: isAmountType && !(amt !== undefined && amt >= 0) ? t('tx.errors.amount') : undefined,
    fee: Number.isNaN(feeValue) || feeValue < 0 ? t('tx.errors.fee') : undefined,
    fx: fx !== undefined && !(fx > 0) ? t('tx.errors.price') : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const ownedResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return p.assets.slice(0, 8);
    return p.assets.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, p.assets]);

  const submit = async () => {
    setSubmitted(true);
    setError(null);
    if (hasErrors || !selected || !wallet) return;
    try {
      const asset = selected.kind === 'owned' ? selected.asset : await repository.ensureAsset(selected.result);
      if (!editing) {
        const held = new Set(p.transactions.map((tx) => tx.assetId));
        if (!canAddAsset(plan, held, asset.id).allowed) {
          router.replace('/paywall?reason=assets');
          return;
        }
      }
      await save.mutateAsync({
        transactions: [
          {
            id: editing?.id,
            walletId: wallet.id,
            assetId: asset.id,
            type,
            quantity: isAmountType ? 0 : qty!,
            price: isAmountType || isSplit ? 0 : px!,
            amount: isAmountType ? amt : undefined,
            fee: isSplit ? 0 : feeValue,
            currency,
            fxRate: currency !== base && fx ? fx : undefined,
            fxBase: currency !== base && fx ? base : undefined,
            date,
            note: note.trim() || undefined,
            source: editing?.source ?? 'manual',
            externalId: editing?.externalId,
          },
        ],
      });
      router.back();
    } catch (e) {
      if (isPlanLimitError(e)) router.replace(`/paywall?reason=${e.reason}`);
      else setError(t('common.error'));
    }
  };

  if (!p.isLoading && p.wallets.length === 0) {
    return (
      <Screen>
        <Notice text={t('tx.needWallet')} />
        <Button title={t('home.createWallet')} onPress={() => router.replace('/wallet/new')} />
      </Screen>
    );
  }

  const currencies = [...new Set([info?.currency, wallet?.currency, base, ...BASE_CURRENCIES, 'USDT'].filter(Boolean) as string[])];
  const showErr = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? t('tx.edit') : t('tx.new') }} />
      <Chips
        label={t('tx.wallet')}
        options={p.wallets.map((w) => ({ value: w.id, label: w.name }))}
        value={walletId}
        onChange={setWalletId}
      />

      <View style={{ gap: spacing.xs }}>
        <Text variant="label" muted>
          {t('tx.asset')}
        </Text>
        {info ? (
          <Card>
            <ListItem
              leading={<AssetAvatar symbol={info.symbol} />}
              title={`${info.symbol} · ${info.name}`}
              subtitle={`${t(`assetTypes.${info.type}`)} · ${info.currency}`}
            />
            {!editing ? (
              <Button
                title={t('tx.changeAsset')}
                variant="ghost"
                small
                onPress={() => {
                  setSelected(undefined);
                  setPrice('');
                }}
              />
            ) : null}
          </Card>
        ) : (
          <Card style={{ gap: spacing.sm }}>
            <Field
              label={t('tx.chooseAsset')}
              placeholder={t('market.searchPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="characters"
              autoCorrect={false}
              error={showErr('asset')}
            />
            {ownedResults.map((a) => (
              <ListItem
                key={a.id}
                leading={<AssetAvatar symbol={a.symbol} />}
                title={`${a.symbol} · ${a.name}`}
                subtitle={t(`assetTypes.${a.type}`)}
                onPress={() => {
                  setSelected({ kind: 'owned', asset: a });
                  setCurrency(a.currency);
                }}
              />
            ))}
            {(search.data ?? [])
              .filter((r) => !p.assets.some((a) => a.providerId === r.providerId && a.type === r.type))
              .slice(0, 8)
              .map((r) => (
                <ListItem
                  key={`${r.type}:${r.providerId}`}
                  leading={<AssetAvatar symbol={r.symbol} index={1} />}
                  title={`${r.symbol} · ${r.name}`}
                  subtitle={[t(`assetTypes.${r.type}`), r.exchange, r.currency].filter(Boolean).join(' · ')}
                  onPress={() => {
                    setSelected({ kind: 'search', result: r });
                    setCurrency(r.currency);
                  }}
                />
              ))}
            <Button title={t('market.customAsset')} variant="ghost" small onPress={() => router.push('/custom-asset')} />
          </Card>
        )}
      </View>

      <Chips
        label={t('tx.type')}
        options={TRANSACTION_TYPES.map((x) => ({ value: x, label: t(`txTypes.${x}`) }))}
        value={type}
        onChange={(next) => {
          setType(next);
          if (!editing) setFeeTouched(false);
        }}
      />

      <Field label={t('tx.date')} value={date} onChangeText={setDate} placeholder="2025-01-31" error={showErr('date')} maxLength={10} />

      {isAmountType ? (
        <Field label={t('tx.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={showErr('amount')} />
      ) : (
        <Row gap={spacing.sm} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field
              label={isSplit ? t('tx.splitRatio') : t('tx.quantity')}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              error={showErr('quantity')}
            />
          </View>
          {!isSplit ? (
            <View style={{ flex: 1 }}>
              <Field
                label={isTransfer ? t('tx.costPrice') : t('tx.price')}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                error={showErr('price')}
              />
            </View>
          ) : null}
        </Row>
      )}

      {!isSplit ? (
        <>
          <Chips label={t('tx.currency')} options={currencies.map((x) => ({ value: x, label: x }))} value={currency} onChange={setCurrency} />
          <Field
            label={t('tx.fee')}
            value={feeTouched ? fee : autoFee ? String(autoFee) : ''}
            onChangeText={(v) => {
              setFee(v);
              setFeeTouched(true);
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            help={!feeTouched && autoFee > 0 ? t('tx.feeAuto') : undefined}
            error={showErr('fee')}
          />
          {currency !== base ? (
            <Field
              label={`${t('tx.fxRate', { base })} (${t('common.optional')})`}
              value={fxRate}
              onChangeText={setFxRate}
              keyboardType="decimal-pad"
              help={t('tx.fxHelp', { base, currency })}
              error={showErr('fx')}
            />
          ) : null}
        </>
      ) : null}

      <Field label={`${t('tx.note')} (${t('common.optional')})`} value={note} onChangeText={setNote} maxLength={200} />

      {TRADE_TYPES.includes(type) && gross > 0 ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text muted>{type === 'buy' ? t('tx.total') : t('tx.netProceeds')}</Text>
            <Text style={{ fontWeight: '700' }}>
              {f.money(type === 'buy' ? gross + feeValue : gross - feeValue, currency)}
            </Text>
          </Row>
        </Card>
      ) : null}

      {error ? <Notice tone="warning" text={error} /> : null}
      <Button title={t('common.save')} onPress={submit} loading={save.isPending} />

      {editing ? (
        <>
          <Divider />
          <Button
            title={t('tx.deleteTitle')}
            variant="danger"
            onPress={() =>
              confirmDestructive(t('tx.deleteTitle'), t('tx.deleteBody'), t('common.delete'), t('common.cancel'), async () => {
                await remove.mutateAsync(editing.id);
                router.back();
              })
            }
          />
        </>
      ) : null}
    </Screen>
  );
}
