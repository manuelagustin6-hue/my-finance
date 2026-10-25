import type { Asset, ValuedPosition } from '@my-finance/core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useFormat } from '@/hooks/useFormat';
import { useTheme } from '@/theme';
import { ListItem, Text } from './ui';

/** Iniciales del activo en un círculo, como ícono liviano. */
export function AssetAvatar({ symbol, index = 0 }: { symbol: string; index?: number }) {
  const c = useTheme();
  const color = c.series[index % c.series.length]!;
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${color}22`,
      }}
    >
      <Text style={{ fontWeight: '700', fontSize: 12 }} color={color}>
        {symbol.slice(0, 4)}
      </Text>
    </View>
  );
}

export function PositionRow({
  position,
  asset,
  base,
  index,
}: {
  position: ValuedPosition;
  asset?: Asset;
  base: string;
  index?: number;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const symbol = asset?.symbol ?? '?';
  const subtitle = position.hasQuote
    ? `${f.num(position.quantity, 6)} · ${f.money(position.price ?? 0, asset?.currency ?? position.currency)}`
    : t('positions.noQuote');
  return (
    <ListItem
      leading={<AssetAvatar symbol={symbol} index={index} />}
      title={asset ? `${asset.symbol} · ${asset.name}` : symbol}
      subtitle={subtitle}
      right={f.money(position.marketValueBase, base)}
      rightSub={`${f.signedMoney(position.unrealizedPnlBase, base)} (${f.pct(position.costBasisBase > 0 ? position.unrealizedPnlBase / position.costBasisBase : 0)})`}
      rightSubColor={f.tone(position.unrealizedPnlBase)}
      onPress={() => router.push(`/asset/${position.assetId}`)}
    />
  );
}
