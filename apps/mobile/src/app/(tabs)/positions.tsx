import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { CurrencyToggle } from '@/components/CurrencyPicker';
import { PositionRow } from '@/components/PositionRow';
import { Card, Chips, Divider, EmptyState, ErrorState, ListItem, Loading, Screen, Section } from '@/components/ui';
import { usePortfolio, useWallets } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { router } from 'expo-router';
import { spacing } from '@/theme';

const ALL = '__all__';

export default function PositionsScreen() {
  const { t } = useTranslation();
  const f = useFormat();
  const wallets = useWallets();
  const [walletId, setWalletId] = useState<string>(ALL);
  const p = usePortfolio(walletId === ALL ? undefined : walletId);

  if (p.isLoading) return <Screen><Loading /></Screen>;
  if (p.isError) return <Screen><ErrorState onRetry={() => void p.refetch()} /></Screen>;

  const base = p.base ?? 'USD';
  const options = [
    { value: ALL, label: t('common.all') },
    ...(wallets.data ?? []).map((w) => ({ value: w.id, label: w.name })),
  ];
  const open = p.summary?.positions ?? [];
  const closed = p.summary?.closedPositions ?? [];

  return (
    <Screen refreshing={p.isFetchingQuotes} onRefresh={() => void p.refetch()}>
      <CurrencyToggle options={p.display.options} value={base} onChange={p.display.set} />
      {options.length > 2 ? <Chips options={options} value={walletId} onChange={setWalletId} /> : null}
      {open.length === 0 ? (
        <EmptyState title={t('positions.empty')} />
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {open.map((pos, i) => (
            <View key={pos.assetId}>
              {i > 0 ? <Divider /> : null}
              <PositionRow position={pos} asset={p.assetsById.get(pos.assetId)} base={base} index={i} />
            </View>
          ))}
        </Card>
      )}
      {closed.length > 0 ? (
        <Section title={t('positions.closed')}>
          <Card style={{ paddingVertical: spacing.xs }}>
            {closed.map((pos, i) => {
              const asset = p.assetsById.get(pos.assetId);
              const result = pos.realizedPnlBase + pos.incomeBase;
              return (
                <View key={pos.assetId}>
                  {i > 0 ? <Divider /> : null}
                  <ListItem
                    title={asset ? `${asset.symbol} · ${asset.name}` : pos.assetId}
                    subtitle={t('home.realized')}
                    right={f.signedMoney(result, base)}
                    rightSubColor={f.tone(result)}
                    onPress={() => router.push(`/asset/${pos.assetId}`)}
                  />
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
