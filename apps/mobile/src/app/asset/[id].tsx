import {
  assetStats,
  averageCost,
  hasFeature,
  canViewHistory,
  type Asset,
  type AssetRef,
  type AssetSearchResult,
  type Fundamentals,
  type HistoryRange,
  type Period,
} from '@my-finance/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, View } from 'react-native';
import { AssetLogo } from '@/components/AssetLogo';
import { LineChart } from '@/components/charts';
import {
  Button,
  Card,
  Chips,
  Divider,
  ErrorState,
  Field,
  ListItem,
  Loading,
  Notice,
  ProGate,
  Row,
  Screen,
  Section,
  Stat,
  StatGrid,
  Text,
} from '@/components/ui';
import { isDemoMode, market, repository } from '@/data';
import { keys, refOf, useFundamentals, useHistory, usePortfolio } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { parseAssetParam } from '@/lib/routes';
import { usePlan } from '@/state/app';
import { spacing, useTheme } from '@/theme';

const RANGES: HistoryRange[] = ['1M', '3M', '1Y', '5Y', 'MAX'];
const RETURN_PERIODS: Period[] = ['1W', '1M', '3M', 'YTD', '1Y'];

/** Información del activo: la del usuario si lo tiene, o la del proveedor. */
function useAssetInfo(param: string) {
  const portfolio = usePortfolio();
  const parsed = parseAssetParam(param);
  const owned: Asset | undefined =
    'assetId' in parsed
      ? portfolio.assetsById.get(parsed.assetId)
      : portfolio.assets.find((a) => a.providerId === parsed.providerId && a.type === parsed.type);

  const providerRef: AssetRef | undefined =
    'providerId' in parsed ? { providerId: parsed.providerId, type: parsed.type as AssetRef['type'] } : owned ? refOf(owned) : undefined;

  const lookup = useQuery({
    queryKey: ['asset-info', providerRef?.type, providerRef?.providerId],
    enabled: !!providerRef && !owned,
    queryFn: async (): Promise<AssetSearchResult | null> => {
      const results = await market.search(providerRef!.providerId);
      return results.find((r) => r.providerId === providerRef!.providerId && r.type === providerRef!.type) ?? null;
    },
  });

  const info = owned ?? lookup.data ?? undefined;
  return { portfolio, owned, ref: providerRef, info, isLoading: portfolio.isLoading || lookup.isLoading };
}

export default function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const plan = usePlan();
  const [range, setRange] = useState<HistoryRange>('1Y');
  /** Punto del gráfico que el usuario está tocando. */
  const [scrub, setScrub] = useState<number | null>(null);
  const { portfolio, owned, ref, info, isLoading } = useAssetInfo(String(id));

  const history = useHistory(ref, range);
  const yearHistory = useHistory(ref, '1Y');
  const isStock = info?.type === 'stock';
  const fundamentals = useFundamentals(ref, isStock && hasFeature(plan, 'fundamentals'));

  const stats = useMemo(
    () => (yearHistory.data && info ? assetStats(yearHistory.data, info.type) : undefined),
    [yearHistory.data, info],
  );

  if (isLoading) return <Screen><Loading /></Screen>;
  if (!info) {
    return (
      <Screen>
        <Text muted>{t('asset.notFound')}</Text>
      </Screen>
    );
  }

  const currency = info.currency;
  const quote = owned ? portfolio.quoteMap?.get(owned.id) : undefined;
  const lastPrice = quote?.price ?? stats?.lastPrice ?? owned?.manualPrice;
  const dayChange = quote?.previousClose ? quote.price / quote.previousClose - 1 : undefined;
  const points = canViewHistory(plan, range) ? (history.data ?? []) : [];
  const scrubPoint = scrub !== null ? points[scrub] : undefined;
  const firstClose = points[0]?.close;
  // Al tocar el gráfico se muestra el precio de ese día y su variación desde el inicio del período.
  const headerLabel = scrubPoint ? f.date(scrubPoint.date) : t('asset.lastPrice');
  const headerPrice = scrubPoint?.close ?? lastPrice;
  const headerChange =
    scrubPoint && firstClose ? scrubPoint.close / firstClose - 1 : dayChange;
  const headerChangeLabel = scrubPoint ? `${range}` : t('home.today');
  const position = owned ? portfolio.summary?.positions.find((p) => p.assetId === owned.id) : undefined;
  const closed = owned ? portfolio.summary?.closedPositions.find((p) => p.assetId === owned.id) : undefined;
  const myTxs = owned ? portfolio.transactions.filter((tx) => tx.assetId === owned.id).reverse() : [];
  const base = portfolio.base ?? 'USD';
  const rangeLocked = !canViewHistory(plan, range);

  const addTx = () =>
    router.push({
      pathname: '/transaction',
      params: owned ? { assetId: owned.id } : { providerId: ref?.providerId, type: info.type },
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: info.symbol }} />
      <Row gap={spacing.md}>
        <AssetLogo asset={info} size={48} />
        <View style={{ gap: spacing.xs, flex: 1 }}>
          <Text variant="heading">{info.name}</Text>
          <Text muted>
            {[t(`assetTypes.${info.type}`), info.exchange, currency].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Row>

      <Card style={{ gap: spacing.md }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text variant="caption" muted>
              {headerLabel}
            </Text>
            <Text variant="title">{headerPrice !== undefined ? f.money(headerPrice, currency) : '—'}</Text>
          </View>
          {headerChange !== undefined ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="label" color={f.tone(headerChange)}>
                {f.pct(headerChange)}
              </Text>
              <Text variant="caption" muted>
                {headerChangeLabel}
              </Text>
            </View>
          ) : null}
        </Row>
        {ref ? (
          <>
            <Chips
              options={RANGES.map((r) => ({ value: r, label: r }))}
              value={range}
              onChange={(r) => {
                setScrub(null);
                setRange(r);
              }}
            />
            {rangeLocked ? (
              <ProGate reason="full_price_history" description={t('asset.proRange')} />
            ) : history.isLoading ? (
              <Loading />
            ) : history.isError ? (
              <ErrorState onRetry={() => void history.refetch()} />
            ) : (history.data ?? []).length > 1 ? (
              <LineChart
                values={history.data!.map((p) => p.close)}
                dates={history.data!.map((p) => p.date)}
                formatValue={(v) => f.money(v, currency)}
                onScrub={setScrub}
                color={(() => {
                  const h = history.data!;
                  return h[h.length - 1]!.close >= h[0]!.close ? c.positive : c.negative;
                })()}
              />
            ) : (
              <Text muted>{t('asset.noHistory')}</Text>
            )}
          </>
        ) : null}
      </Card>

      {!ref && owned ? <ManualPrice asset={owned} /> : null}

      {stats ? (
        <Section title={t('asset.performance')}>
          <Card>
            <StatGrid>
              {RETURN_PERIODS.map((period) => {
                const r = stats.returns[period];
                return (
                  <Stat key={period} label={period} value={r !== undefined ? f.pct(r) : '—'} color={r !== undefined ? f.tone(r) : undefined} />
                );
              })}
            </StatGrid>
            <Divider />
            <Text variant="label" muted>
              {t('asset.risk')}
            </Text>
            <StatGrid>
              <Stat label={t('asset.volatility')} value={f.pct(stats.volatility1Y, false)} />
              <Stat label={t('asset.maxDrawdown')} value={f.pct(stats.maxDrawdown1Y)} color={c.negative} />
              <Stat label={t('asset.high52w')} value={stats.high52w !== undefined ? f.money(stats.high52w, currency) : '—'} />
              <Stat label={t('asset.low52w')} value={stats.low52w !== undefined ? f.money(stats.low52w, currency) : '—'} />
            </StatGrid>
          </Card>
        </Section>
      ) : null}

      {position || closed ? (
        <Section title={t('asset.myPosition')}>
          <Card>
            {position ? (
              <StatGrid>
                <Stat label={t('positions.quantity')} value={f.num(position.quantity)} />
                <Stat
                  label={position.quoteUnit !== 1 ? `${t('positions.avgCost')} · ${t('tx.perUnits', { unit: position.quoteUnit })}` : t('positions.avgCost')}
                  value={f.money(averageCost(position) * position.quoteUnit, currency)}
                />
                <Stat label={t('positions.value')} value={f.money(position.marketValueBase, base)} />
                <Stat label={t('home.invested')} value={f.money(position.costBasisBase, base)} />
                <Stat
                  label={t('home.unrealized')}
                  value={`${f.signedMoney(position.unrealizedPnlBase, base)} (${f.pct(position.costBasisBase > 0 ? position.unrealizedPnlBase / position.costBasisBase : 0)})`}
                  color={f.tone(position.unrealizedPnlBase)}
                />
                <Stat label={t('home.realized')} value={f.signedMoney(position.realizedPnlBase, base)} color={f.tone(position.realizedPnlBase)} />
                <Stat label={t('home.income')} value={f.money(position.incomeBase, base)} />
                <Stat label={t('home.fees')} value={f.money(position.feesPaidBase, base)} />
                <Stat label={t('positions.weight')} value={f.pct(position.weight, false)} />
              </StatGrid>
            ) : closed ? (
              <StatGrid>
                <Stat label={t('home.realized')} value={f.signedMoney(closed.realizedPnlBase, base)} color={f.tone(closed.realizedPnlBase)} />
                <Stat label={t('home.income')} value={f.money(closed.incomeBase, base)} />
                <Stat label={t('home.fees')} value={f.money(closed.feesPaidBase, base)} />
              </StatGrid>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Button title={t('asset.addTransaction')} icon="add" onPress={addTx} />

      {myTxs.length > 0 ? (
        <Section title={t('asset.myTransactions')}>
          <Card style={{ paddingVertical: spacing.xs }}>
            {myTxs.slice(0, 20).map((tx, i) => {
              const wallet = portfolio.wallets.find((w) => w.id === tx.walletId);
              const amount = tx.amount ?? tx.quantity * tx.price;
              return (
                <View key={tx.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListItem
                    title={`${t(`txTypes.${tx.type}`)} · ${f.date(tx.date)}`}
                    subtitle={[wallet?.name, tx.type === 'split' ? `×${tx.quantity}` : tx.amount === undefined ? `${f.num(tx.quantity)} × ${f.money(tx.price, tx.currency)}` : undefined]
                      .filter(Boolean)
                      .join(' · ')}
                    right={tx.type === 'split' ? '' : f.money(amount, tx.currency)}
                    rightSub={tx.fee > 0 ? `${t('tx.fee')}: ${f.money(tx.fee, tx.currency)}` : undefined}
                    onPress={() => router.push({ pathname: '/transaction', params: { id: tx.id } })}
                  />
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {isStock && ref ? (
        <Section title={t('asset.financials')}>
          {!hasFeature(plan, 'fundamentals') ? (
            <ProGate reason="fundamentals" description={t('paywall.reasons.fundamentals')} />
          ) : fundamentals.isLoading ? (
            <Loading />
          ) : fundamentals.isError ? (
            <ErrorState onRetry={() => void fundamentals.refetch()} />
          ) : fundamentals.data ? (
            <FundamentalsView data={fundamentals.data} />
          ) : (
            <Text muted>{t('common.noData')}</Text>
          )}
        </Section>
      ) : null}

      {isDemoMode ? <Notice text={t('common.simulatedData')} /> : null}
    </Screen>
  );
}

function ManualPrice({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState(asset.manualPrice !== undefined ? String(asset.manualPrice) : '');
  const [saving, setSaving] = useState(false);
  const parsed = Number(value.replace(',', '.'));
  const valid = value.trim() === '' || (Number.isFinite(parsed) && parsed >= 0);

  return (
    <Card style={{ gap: spacing.md }}>
      <Text variant="heading">{t('asset.manualPrice')}</Text>
      <Text muted>{t('asset.manualPriceHelp')}</Text>
      <Field
        label={`${t('tx.price')} (${asset.currency})`}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        error={valid ? undefined : t('tx.errors.price')}
      />
      <Button
        title={t('common.save')}
        loading={saving}
        disabled={!valid}
        onPress={async () => {
          setSaving(true);
          await repository.setManualPrice(asset.id, value.trim() === '' ? undefined : parsed);
          await qc.invalidateQueries({ queryKey: keys.assets });
          setSaving(false);
        }}
      />
    </Card>
  );
}

function FundamentalsView({ data }: { data: Fundamentals }) {
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const cur = data.currency;
  const periods = data.statements.slice(0, 4);
  const rows: { label: string; get: (s: (typeof periods)[number]) => number; perShare?: boolean }[] = [
    { label: t('asset.revenue'), get: (s) => s.revenue },
    { label: t('asset.netIncome'), get: (s) => s.netIncome },
    { label: t('asset.eps'), get: (s) => s.eps, perShare: true },
    { label: t('asset.fcf'), get: (s) => s.freeCashFlow },
    { label: t('asset.totalAssets'), get: (s) => s.totalAssets },
    { label: t('asset.totalLiabilities'), get: (s) => s.totalLiabilities },
    { label: t('asset.equity'), get: (s) => s.totalEquity },
    { label: t('asset.cash'), get: (s) => s.cash },
    { label: t('asset.debt'), get: (s) => s.totalDebt },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <Card>
        <Text variant="label" muted>
          {t('asset.keyData')}
        </Text>
        <StatGrid>
          {data.sector ? <Stat label={t('asset.sector')} value={data.sector} /> : null}
          {data.marketCap ? <Stat label={t('asset.marketCap')} value={f.money(data.marketCap, cur, true)} /> : null}
          {data.peRatio ? <Stat label={t('asset.pe')} value={f.num(data.peRatio, 1)} /> : null}
          {data.dividendYield !== undefined ? <Stat label={t('asset.dividendYield')} value={f.pct(data.dividendYield, false)} /> : null}
          {data.beta ? <Stat label={t('asset.beta')} value={f.num(data.beta, 2)} /> : null}
        </StatGrid>
      </Card>

      <Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ gap: spacing.sm }}>
            <Row gap={0}>
              <View style={{ width: 150 }} />
              {periods.map((p) => (
                <Text key={p.period} variant="label" muted style={{ width: 96, textAlign: 'right' }}>
                  {p.label}
                </Text>
              ))}
            </Row>
            {rows.map((row) => (
              <Row key={row.label} gap={0} style={{ borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: spacing.sm }}>
                <Text style={{ width: 150 }} numberOfLines={1}>
                  {row.label}
                </Text>
                {periods.map((p) => (
                  <Text key={p.period} style={{ width: 96, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {row.perShare ? f.money(row.get(p), cur) : f.money(row.get(p), cur, true)}
                  </Text>
                ))}
              </Row>
            ))}
          </View>
        </ScrollView>
      </Card>

      {data.filings.length > 0 ? (
        <Card style={{ paddingVertical: spacing.xs }}>
          <Text variant="label" muted style={{ paddingTop: spacing.sm }}>
            {t('asset.filings')}
          </Text>
          {data.filings.map((filing, i) => (
            <View key={`${filing.date}-${i}`}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                icon="document-text-outline"
                title={`${filing.form} · ${filing.title}`}
                subtitle={f.date(filing.date)}
                onPress={() => void Linking.openURL(filing.url)}
              />
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
