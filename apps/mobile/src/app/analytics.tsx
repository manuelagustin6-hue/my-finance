import {
  dailyDates,
  FxTable,
  weeklyDates,
  hasFeature,
  periodStart,
  portfolioRisk,
  portfolioSeries,
  type PricePoint,
} from '@my-finance/core';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AllocationBar, LineChart } from '@/components/charts';
import { Card, Loading, Notice, ProGate, Screen, Section, Stat, StatGrid, Text } from '@/components/ui';
import { market } from '@/data';
import { refOf, useFxHistory, usePortfolio } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { numberLocale } from '@/i18n';
import { usePlan } from '@/state/app';
import { useTheme } from '@/theme';

const MIN_POINTS_FOR_RISK = 30;

function countryName(code: string, noCountry: string): string {
  if (code === '—') return noCountry;
  try {
    return new Intl.DisplayNames([numberLocale()], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export default function AnalyticsScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const plan = usePlan();
  const allowed = hasFeature(plan, 'portfolio_analytics');
  const p = usePortfolio();

  const held = useMemo(() => p.assets.filter((a) => a.providerId), [p.assets]);
  const histories = useQueries({
    queries: held.map((a) => ({
      queryKey: ['history', a.type, a.providerId, '1Y', plan],
      queryFn: () => market.history(refOf(a)!, '1Y'),
      enabled: allowed,
      staleTime: 5 * 60_000,
    })),
  });
  const historiesLoading = histories.some((h) => h.isLoading);

  // Tipos de cambio semanales del período para valuar la serie en la moneda elegida.
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = periodStart('1Y', new Date())!;
  const fxCurrencies = useMemo(
    () => [...new Set([...p.assets.map((a) => a.currency), ...p.effective.map((tx) => tx.currency), p.base ?? 'USD'])],
    [p.assets, p.effective, p.base],
  );
  const fxDates = useMemo(
    () => [...weeklyDates(yearAgo, today), ...p.effective.map((tx) => tx.date.slice(0, 10))],
    [yearAgo, today, p.effective],
  );
  const fxHistory = useFxHistory(allowed ? fxDates : [], fxCurrencies, p.prefs);

  const analysis = useMemo(() => {
    if (!allowed || !p.base || historiesLoading || fxHistory.isLoading || p.effective.length === 0) return undefined;
    const fxTable = new FxTable(p.fxSnapshot?.rates ?? {}, fxHistory.data ?? {});
    const map = new Map<string, readonly PricePoint[]>();
    held.forEach((a, i) => {
      const data = histories[i]?.data;
      if (data) map.set(a.id, data);
    });
    // Activos sin cotización: se usa su precio manual como serie constante.
    for (const a of p.assets) {
      if (!a.providerId && a.manualPrice !== undefined) map.set(a.id, [{ date: '1900-01-01', close: a.manualPrice }]);
    }
    const first = p.effective.reduce((min, tx) => (tx.date < min ? tx.date : min), today).slice(0, 10);
    const dates = dailyDates(first > yearAgo ? first : yearAgo, today);
    const points = portfolioSeries({
      transactions: p.effective,
      histories: map,
      currencies: new Map(p.assets.map((a) => [a.id, a.currency])),
      baseCurrency: p.base,
      fx: fxTable.lookup(),
      dates,
    });
    return { points, risk: portfolioRisk(points) };
  }, [allowed, p.base, p.fxSnapshot, fxHistory.data, fxHistory.isLoading, p.effective, p.assets, held, histories, historiesLoading, today, yearAgo]);

  if (!allowed) {
    return (
      <Screen>
        <ProGate reason="portfolio_analytics" description={t('home.analyticsBody')} />
      </Screen>
    );
  }
  if (p.isLoading || historiesLoading || fxHistory.isLoading) return <Screen><Loading /></Screen>;

  const base = p.base ?? 'USD';
  const s = p.summary;
  const enough = (analysis?.points.filter((x) => x.value > 0).length ?? 0) >= MIN_POINTS_FOR_RISK;
  const walletSlices = (() => {
    const totals = [...(p.walletTotals?.values() ?? [])].filter((w) => w.value > 0);
    const sum = totals.reduce((acc, w) => acc + w.value, 0);
    return totals
      .map((w) => ({ key: w.walletId, value: w.value, weight: sum > 0 ? w.value / sum : 0 }))
      .sort((a, b) => b.value - a.value);
  })();

  return (
    <Screen>
      <Section title={t('analytics.evolution')}>
        <Card>
          <Text variant="caption" muted>
            {t('analytics.period')}
          </Text>
          {analysis && analysis.points.length > 1 ? (
            <>
              <LineChart
                values={analysis.points.map((x) => x.value)}
                dates={analysis.points.map((x) => x.date)}
                baseline={analysis.points.map((x) => x.netInvested)}
                formatValue={(v) => f.money(v, base)}
              />
              <Text variant="caption" muted>
                — {t('positions.value')} · - - {t('analytics.netInvested')}
              </Text>
            </>
          ) : (
            <Text muted>{t('common.noData')}</Text>
          )}
        </Card>
      </Section>

      <Card>
        {enough && analysis ? (
          <StatGrid>
            <Stat label={t('analytics.twr')} value={f.pct(analysis.risk.twr)} color={f.tone(analysis.risk.twr)} />
            <Stat label={t('analytics.volatility')} value={f.pct(analysis.risk.volatility, false)} />
            <Stat label={t('analytics.maxDrawdown')} value={f.pct(analysis.risk.maxDrawdown)} color={c.negative} />
          </StatGrid>
        ) : (
          <Text muted>{t('analytics.notEnoughData')}</Text>
        )}
        <Text variant="caption" muted>
          {t('analytics.method')}
        </Text>
      </Card>

      {s ? (
        <>
          <Section title={t('analytics.byType')}>
            <Card>
              <AllocationBar slices={s.byAssetType} labelOf={(k) => t(`assetTypes.${k}`)} currency={base} />
            </Card>
          </Section>
          <Section title={t('analytics.byCountry')}>
            <Card>
              <AllocationBar slices={s.byCountry} labelOf={(code) => countryName(code, t('analytics.noCountry'))} currency={base} />
            </Card>
          </Section>
          <Section title={t('analytics.byCurrency')}>
            <Card>
              <AllocationBar slices={s.byCurrency} labelOf={(k) => k} currency={base} />
            </Card>
          </Section>
          {walletSlices.length > 0 ? (
            <Section title={t('analytics.byWallet')}>
              <Card>
                <AllocationBar
                  slices={walletSlices}
                  labelOf={(id) => p.wallets.find((w) => w.id === id)?.name ?? id}
                  currency={base}
                />
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}

      <Notice text={t('common.priceSources')} />
    </Screen>
  );
}
