import type { Asset, ValuedPosition } from '@my-finance/core';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFormat } from '@/hooks/useFormat';
import { AssetLogo } from './AssetLogo';
import { ListItem } from './ui';

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
      leading={<AssetLogo asset={asset ?? { symbol, type: 'other' }} index={index} />}
      title={asset ? `${asset.symbol} · ${asset.name}` : symbol}
      subtitle={subtitle}
      right={f.money(position.marketValueBase, base)}
      rightSub={`${f.signedMoney(position.unrealizedPnlBase, base)} (${f.pct(position.costBasisBase > 0 ? position.unrealizedPnlBase / position.costBasisBase : 0)})`}
      rightSubColor={f.tone(position.unrealizedPnlBase)}
      onPress={() => router.push(`/asset/${position.assetId}`)}
    />
  );
}
