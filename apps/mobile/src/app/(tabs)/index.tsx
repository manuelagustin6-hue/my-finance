import { hasFeature } from '@my-finance/core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AllocationBar } from '@/components/charts';
import { CurrencyToggle } from '@/components/CurrencyPicker';
import { PositionRow } from '@/components/PositionRow';
import { WarningsCard } from '@/components/WarningsCard';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Loading,
  Notice,
  ProBadge,
  Row,
  Screen,
  Section,
  Stat,
  StatGrid,
  Text,
} from '@/components/ui';
import { isDemoMode } from '@/data';
import { usePortfolio } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { usePlan } from '@/state/app';
import { spacing, useTheme } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const plan = usePlan();
  const p = usePortfolio();

  if (p.isLoading) return <Screen><Loading /></Screen>;
  if (p.isError) return <Screen><ErrorState onRetry={() => void p.refetch()} /></Screen>;

  const base = p.base ?? 'USD';
  const s = p.summary;

  if (p.wallets.length === 0 || !s || p.transactions.length === 0) {
    return (
      <Screen>
        <EmptyState title={t('home.emptyTitle')} body={t('home.emptyBody')}>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
            {p.wallets.length === 0 ? (
              <Button title={t('home.createWallet')} icon="add" onPress={() => router.push('/wallet/new')} />
            ) : (
              <>
                <Button title={t('home.addTransaction')} icon="add" onPress={() => router.push('/transaction')} />
                <Button title={t('home.importHistory')} variant="secondary" icon="cloud-upload-outline" onPress={() => router.push('/import')} />
                <Button title={t('opening.load')} variant="secondary" icon="flag-outline" onPress={() => router.push('/opening')} />
              </>
            )}
          </View>
        </EmptyState>
        {isDemoMode ? <Notice text={t('common.simulatedData')} /> : null}
      </Screen>
    );
  }

  const totalPnlPct = s.totalCost > 0 ? s.unrealizedPnl / s.totalCost : 0;
  const other = p.display.options.find((o) => o !== base);
  const otherRate = other ? p.fxTable.rate(base, other) : undefined;

  return (
    <Screen refreshing={p.isFetchingQuotes} onRefresh={() => void p.refetch()}>
      <CurrencyToggle options={p.display.options} value={base} onChange={p.display.set} />
      <Card style={{ gap: spacing.md }}>
        <Text muted variant="label">
          {t('home.totalValue')}
        </Text>
        <Text variant="title">{f.money(s.totalValue, base)}</Text>
        {other && otherRate !== undefined ? (
          <Text muted>{t('fx.equivalent', { value: f.money(s.totalValue * otherRate, other) })}</Text>
        ) : null}
        <Row gap={spacing.lg}>
          <Text color={f.tone(s.dayChange)} variant="label">
            {t('home.today')}: {f.signedMoney(s.dayChange, base)} ({f.pct(s.dayChangePct)})
          </Text>
        </Row>
        <Divider />
        <StatGrid>
          <Stat label={t('home.totalPnl')} value={f.signedMoney(s.totalPnl, base)} color={f.tone(s.totalPnl)} />
          <Stat
            label={t('home.unrealized')}
            value={`${f.signedMoney(s.unrealizedPnl, base)} (${f.pct(totalPnlPct)})`}
            color={f.tone(s.unrealizedPnl)}
          />
          <Stat label={t('home.realized')} value={f.signedMoney(s.realizedPnl, base)} color={f.tone(s.realizedPnl)} />
          <Stat label={t('home.income')} value={f.money(s.income, base)} />
          <Stat label={t('home.invested')} value={f.money(s.totalCost, base)} />
          <Stat label={t('home.fees')} value={f.money(s.feesPaid, base)} />
        </StatGrid>
        <Text variant="caption" muted>
          {t('home.pnlNote')}
        </Text>
      </Card>

      {p.warnings && p.warnings.length > 0 ? <WarningsCard warnings={p.warnings} assetsById={p.assetsById} /> : null}

      <Row>
        <View style={{ flex: 1 }}>
          <Button title={t('home.addTransaction')} icon="add" small onPress={() => router.push('/transaction')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={t('home.importHistory')}
            icon="cloud-upload-outline"
            variant="secondary"
            small
            onPress={() => router.push('/import')}
          />
        </View>
      </Row>

      <Section title={t('home.allocationByType')}>
        <Card>
          <AllocationBar slices={s.byAssetType} labelOf={(k) => t(`assetTypes.${k}`)} currency={base} />
        </Card>
      </Section>

      <Section
        title={t('home.topPositions')}
        action={<Button title={t('common.seeAll')} variant="ghost" small onPress={() => router.push('/positions')} />}
      >
        <Card style={{ paddingVertical: spacing.xs }}>
          {s.positions.slice(0, 5).map((pos, i) => (
            <View key={pos.assetId}>
              {i > 0 ? <Divider /> : null}
              <PositionRow position={pos} asset={p.assetsById.get(pos.assetId)} base={base} index={i} />
            </View>
          ))}
        </Card>
      </Section>

      <Card onPress={() => router.push(hasFeature(plan, 'portfolio_analytics') ? '/analytics' : '/paywall?reason=portfolio_analytics')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">{t('home.analyticsTitle')}</Text>
          {plan === 'free' ? <ProBadge /> : null}
        </Row>
        <Text muted>{t('home.analyticsBody')}</Text>
      </Card>

      <Card onPress={() => router.push('/fx')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading">{t('fx.title')}</Text>
          {p.fxSnapshot && p.base !== 'USD' && p.fxSnapshot.rates[base] ? (
            <Text muted>{t('fx.perUsd', { value: f.money(p.fxSnapshot.rates[base]!, base) })}</Text>
          ) : null}
        </Row>
        <Text muted>{t('fx.subtitle')}</Text>
      </Card>

      {isDemoMode ? <Notice text={t('common.simulatedData')} /> : null}
      <Text variant="caption" muted align="center" color={c.muted}>
        {t('settings.disclaimer')}
      </Text>
    </Screen>
  );
}
