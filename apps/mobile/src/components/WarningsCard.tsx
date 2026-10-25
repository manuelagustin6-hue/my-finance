import type { Asset, PositionWarning, PositionWarningCode } from '@my-finance/core';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { spacing, useTheme } from '@/theme';
import { Button, Card, Divider, Row, Text } from './ui';

const ORDER: PositionWarningCode[] = ['oversell', 'currency_mismatch', 'missing_fx', 'invalid_quantity'];

export interface WarningGroup {
  code: PositionWarningCode;
  symbols: string[];
  count: number;
}

/** Agrupa los avisos del motor por tipo, con los activos afectados. */
export function groupWarnings(warnings: readonly PositionWarning[], assetsById: ReadonlyMap<string, Asset>): WarningGroup[] {
  const groups = new Map<PositionWarningCode, WarningGroup>();
  for (const w of warnings) {
    const g = groups.get(w.code) ?? { code: w.code, symbols: [], count: 0 };
    const symbol = assetsById.get(w.assetId)?.symbol ?? '?';
    if (!g.symbols.includes(symbol)) g.symbols.push(symbol);
    g.count++;
    groups.set(w.code, g);
  }
  return ORDER.map((code) => groups.get(code)).filter((g): g is WarningGroup => !!g);
}

/** Explica cada tipo de aviso: qué pasa, con qué activos y cómo resolverlo. */
export function WarningsCard({
  warnings,
  assetsById,
  showLink = true,
}: {
  warnings: readonly PositionWarning[];
  assetsById: ReadonlyMap<string, Asset>;
  showLink?: boolean;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const groups = groupWarnings(warnings, assetsById);
  if (groups.length === 0) return null;

  return (
    <Card style={{ gap: spacing.md, borderColor: c.warning }}>
      <Row>
        <Ionicons name="warning-outline" size={20} color={c.warning} />
        <Text variant="heading" color={c.warning}>
          {t('warnings.title')}
        </Text>
      </Row>
      {groups.map((g, i) => (
        <View key={g.code} style={{ gap: spacing.xs }}>
          {i > 0 ? <Divider /> : null}
          <Text style={{ fontWeight: '600' }}>
            {t(`warnings.${g.code}.title`, { assets: g.symbols.join(', '), count: g.count })}
          </Text>
          <Text variant="caption" muted>
            {t(`warnings.${g.code}.body`)}
          </Text>
        </View>
      ))}
      {showLink ? (
        <Button title={t('warnings.seeOperations')} variant="ghost" small onPress={() => router.push('/transactions')} />
      ) : null}
    </Card>
  );
}
