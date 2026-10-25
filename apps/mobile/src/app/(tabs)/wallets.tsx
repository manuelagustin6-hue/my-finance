import { canAddWallet } from '@my-finance/core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AllocationBar } from '@/components/charts';
import { Button, Card, Divider, EmptyState, ErrorState, ListItem, Loading, Screen, Section } from '@/components/ui';
import { usePortfolio } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { usePlan } from '@/state/app';
import { spacing } from '@/theme';

export default function WalletsScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const plan = usePlan();
  const p = usePortfolio();

  if (p.isLoading) return <Screen><Loading /></Screen>;
  if (p.isError) return <Screen><ErrorState onRetry={() => void p.refetch()} /></Screen>;

  const base = p.base ?? 'USD';
  const totals = p.walletTotals;
  const grandTotal = [...(totals?.values() ?? [])].reduce((sum, w) => sum + w.value, 0);
  const slices = p.wallets
    .map((w) => ({ key: w.id, value: totals?.get(w.id)?.value ?? 0, weight: 0 }))
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, weight: grandTotal > 0 ? s.value / grandTotal : 0 }))
    .sort((a, b) => b.value - a.value);
  const nameOf = (id: string) => p.wallets.find((w) => w.id === id)?.name ?? id;

  const addWallet = () => {
    if (!canAddWallet(plan, p.wallets.length).allowed) router.push('/paywall?reason=wallets');
    else router.push('/wallet/new');
  };

  return (
    <Screen>
      {p.wallets.length === 0 ? (
        <EmptyState title={t('wallets.empty')} body={t('home.emptyBody')}>
          <Button title={t('wallets.new')} icon="add" onPress={addWallet} />
        </EmptyState>
      ) : (
        <>
          <Card style={{ paddingVertical: spacing.xs }}>
            {p.wallets.map((w, i) => {
              const total = totals?.get(w.id);
              return (
                <View key={w.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListItem
                    icon="wallet-outline"
                    title={w.name}
                    subtitle={`${t(`walletTypes.${w.type}`)} · ${t('wallets.positions', { count: total?.assetCount ?? 0 })}`}
                    right={f.money(total?.value ?? 0, base)}
                    rightSub={f.signedMoney(total?.pnl ?? 0, base)}
                    rightSubColor={f.tone(total?.pnl ?? 0)}
                    onPress={() => router.push(`/wallet/${w.id}`)}
                  />
                </View>
              );
            })}
          </Card>
          <Button title={t('wallets.new')} icon="add" variant="secondary" onPress={addWallet} />
          {slices.length > 1 ? (
            <Section title={t('home.allocationByWallet')}>
              <Card>
                <AllocationBar slices={slices} labelOf={nameOf} currency={base} />
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
