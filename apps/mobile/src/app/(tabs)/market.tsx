import { MOCK_CATALOG, type AssetSearchResult } from '@my-finance/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AssetLogo } from '@/components/AssetLogo';
import { Button, Card, Divider, Field, ListItem, Loading, Notice, Screen, Section, Text } from '@/components/ui';
import { isDemoMode } from '@/data';
import { useQuotes, useSearch } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { searchResultHref } from '@/lib/routes';
import { spacing } from '@/theme';

const POPULAR = ['BTC', 'ETH', 'AAPL', 'NVDA', 'SPY', 'MELI', 'GGAL', 'PETR4', 'AL30', 'SAP'];

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function ResultList({ results }: { results: AssetSearchResult[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const quotes = useQuotes(results.map((r) => ({ providerId: r.providerId, type: r.type })));
  const byId = new Map((quotes.data ?? []).map((q) => [q.assetId, q]));
  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      {results.map((r, i) => {
        const q = byId.get(r.providerId);
        const change = q?.previousClose ? q.price / q.previousClose - 1 : undefined;
        return (
          <View key={`${r.type}:${r.providerId}`}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              leading={<AssetLogo asset={r} index={i} />}
              title={`${r.symbol} · ${r.name}`}
              subtitle={[t(`assetTypes.${r.type}`), r.exchange].filter(Boolean).join(' · ')}
              right={q ? f.money(q.price, q.currency) : undefined}
              rightSub={change !== undefined ? f.pct(change) : undefined}
              rightSubColor={change !== undefined ? f.tone(change) : undefined}
              onPress={() => router.push(searchResultHref(r))}
            />
          </View>
        );
      })}
    </Card>
  );
}

export default function MarketScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const search = useSearch(debounced);

  const popular: AssetSearchResult[] = isDemoMode
    ? POPULAR.map((symbol) => MOCK_CATALOG.find((e) => e.symbol === symbol)!)
        .filter(Boolean)
        .map((e) => ({ providerId: e.symbol, symbol: e.symbol, name: e.name, type: e.type, currency: e.currency, exchange: e.exchange, country: e.country }))
    : [];

  return (
    <Screen>
      <Field
        label={t('tabs.market')}
        placeholder={t('market.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="characters"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
      {debounced.trim() === '' ? (
        <>
          <Text muted>{t('market.hint')}</Text>
          {popular.length > 0 ? (
            <Section title={t('market.popular')}>
              <ResultList results={popular} />
            </Section>
          ) : null}
        </>
      ) : search.isLoading ? (
        <Loading />
      ) : (search.data ?? []).length === 0 ? (
        <Text muted>{t('market.noResults', { query: debounced })}</Text>
      ) : (
        <ResultList results={search.data!} />
      )}
      <Button title={t('market.customAsset')} variant="ghost" onPress={() => router.push('/custom-asset')} />
      {isDemoMode ? <Notice text={t('common.simulatedData')} /> : null}
    </Screen>
  );
}
