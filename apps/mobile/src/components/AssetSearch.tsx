import type { Asset, AssetSearchResult } from '@my-finance/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSearch } from '@/hooks/queries';
import { spacing } from '@/theme';
import { AssetLogo } from './AssetLogo';
import { Button, Card, Divider, Field, ListItem } from './ui';

export type PickedAsset = { kind: 'owned'; asset: Asset } | { kind: 'search'; result: AssetSearchResult };

export function pickedInfo(p: PickedAsset): Asset | AssetSearchResult {
  return p.kind === 'owned' ? p.asset : p.result;
}

/** Clave estable de un activo elegido (para no repetirlo en una lista). */
export function pickedKey(p: PickedAsset): string {
  const info = pickedInfo(p);
  return 'providerId' in info && info.providerId ? `${info.type}:${info.providerId}` : `id:${'id' in info ? info.id : info.symbol}`;
}

/** Buscador de activos: primero los del usuario, luego el mercado y, si no está, crear uno a mano. */
export function AssetSearch({
  owned,
  onSelect,
  exclude = [],
}: {
  owned: readonly Asset[];
  onSelect: (picked: PickedAsset) => void;
  /** Claves (pickedKey) que no se muestran porque ya fueron elegidas. */
  exclude?: readonly string[];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const search = useSearch(query);

  const ownedMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return owned
      .filter((a) => !q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .filter((a) => !exclude.includes(pickedKey({ kind: 'owned', asset: a })))
      .slice(0, 6);
  }, [query, owned, exclude]);

  const marketMatches = (search.data ?? [])
    .filter((r) => !owned.some((a) => a.providerId === r.providerId && a.type === r.type))
    .filter((r) => !exclude.includes(pickedKey({ kind: 'search', result: r })))
    .slice(0, 8);

  const rows: { key: string; picked: PickedAsset }[] = [
    ...ownedMatches.map((a) => ({ key: `o:${a.id}`, picked: { kind: 'owned', asset: a } as PickedAsset })),
    ...marketMatches.map((r) => ({ key: `s:${r.type}:${r.providerId}`, picked: { kind: 'search', result: r } as PickedAsset })),
  ];

  return (
    <Card style={{ gap: spacing.sm }}>
      <Field
        label={t('tx.chooseAsset')}
        placeholder={t('market.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="done"
      />
      {rows.map(({ key, picked }, i) => {
        const info = pickedInfo(picked);
        return (
          <View key={key}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              leading={<AssetLogo asset={info} index={i} />}
              title={`${info.symbol} · ${info.name}`}
              subtitle={[t(`assetTypes.${info.type}`), info.currency].join(' · ')}
              onPress={() => {
                onSelect(picked);
                setQuery('');
              }}
            />
          </View>
        );
      })}
      <Button title={t('market.customAsset')} variant="ghost" small onPress={() => router.push({ pathname: '/custom-asset', params: { then: 'back' } })} />
    </Card>
  );
}
