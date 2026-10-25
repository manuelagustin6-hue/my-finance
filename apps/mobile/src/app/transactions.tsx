import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card, Divider, EmptyState, ListItem, Loading, Notice, Screen } from '@/components/ui';
import { usePortfolio } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { spacing } from '@/theme';

export default function TransactionsScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const p = usePortfolio();

  if (p.isLoading) return <Screen><Loading /></Screen>;

  const txs = [...p.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const warningsById = new Map((p.warnings ?? []).map((w) => [w.transactionId, w.message]));

  return (
    <Screen>
      {warningsById.size > 0 ? <Notice tone="warning" text={t('home.warnings', { count: warningsById.size })} /> : null}
      {txs.length === 0 ? (
        <EmptyState title={t('tx.empty')} />
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {txs.map((tx, i) => {
            const asset = p.assetsById.get(tx.assetId);
            const wallet = p.wallets.find((w) => w.id === tx.walletId);
            const warning = warningsById.get(tx.id);
            const amount = tx.amount ?? tx.quantity * tx.price;
            return (
              <View key={tx.id}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  title={`${t(`txTypes.${tx.type}`)} · ${asset?.symbol ?? '?'}`}
                  subtitle={warning ?? [f.date(tx.date), wallet?.name].filter(Boolean).join(' · ')}
                  right={tx.type === 'split' ? `×${tx.quantity}` : f.money(amount, tx.currency)}
                  rightSub={tx.type === 'split' || tx.amount !== undefined ? undefined : `${f.num(tx.quantity)} × ${f.money(tx.price, tx.currency)}`}
                  onPress={() => router.push({ pathname: '/transaction', params: { id: tx.id } })}
                />
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
