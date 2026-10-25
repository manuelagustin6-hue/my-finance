import { platformLogoUrl, searchPlatforms, type Platform } from '@my-finance/core';
import { Ionicons } from '@expo/vector-icons';
import { getLocales } from 'expo-localization';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { spacing, useTheme } from '@/theme';
import { AssetLogo } from './AssetLogo';
import { Button, Card, Divider, Field, ListItem, Row, Text } from './ui';

/** Logo de una plataforma (ícono de su sitio) con iniciales de respaldo. */
export function PlatformLogo({ platform, name, size = 36 }: { platform?: Platform; name: string; size?: number }) {
  return (
    <AssetLogo
      asset={{ symbol: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?', type: 'other' }}
      urls={platform ? [platformLogoUrl(platform)] : []}
      size={size}
    />
  );
}

export type PlatformChoice = { kind: 'platform'; platform: Platform } | { kind: 'custom'; name: string };

/** País del dispositivo, para sugerir primero las plataformas locales. */
function deviceCountry(): string | undefined {
  return getLocales()[0]?.regionCode ?? undefined;
}

/**
 * Buscador de exchanges, brokers, bancos y billeteras. Si la plataforma no está en el
 * catálogo, ofrece crearla a mano con el nombre escrito.
 */
export function PlatformSearch({ onSelect }: { onSelect: (choice: PlatformChoice) => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const [query, setQuery] = useState('');
  const country = useMemo(() => deviceCountry(), []);
  const results = useMemo(() => searchPlatforms(query, country, 8), [query, country]);
  const typed = query.trim();
  const exact = results.some((p) => p.name.toLowerCase() === typed.toLowerCase());

  return (
    <View style={{ gap: spacing.sm }}>
      <Field
        label={t('wallets.platform')}
        placeholder={t('wallets.platformSearch')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoFocus
        returnKeyType="done"
        maxLength={80}
      />
      <Card style={{ paddingVertical: spacing.xs }}>
        {!typed ? (
          <Text variant="caption" muted style={{ paddingTop: spacing.sm }}>
            {t('wallets.suggested')}
          </Text>
        ) : null}
        {results.map((p, i) => (
          <View key={p.id}>
            {i > 0 ? <Divider /> : null}
            <ListItem
              leading={<PlatformLogo platform={p} name={p.name} />}
              title={p.name}
              subtitle={t(`walletTypes.${p.type}`)}
              onPress={() => onSelect({ kind: 'platform', platform: p })}
            />
          </View>
        ))}
        {typed && !exact ? (
          <>
            {results.length > 0 ? <Divider /> : null}
            <ListItem
              leading={
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardAlt }}>
                  <Ionicons name="add" size={22} color={c.primary} />
                </View>
              }
              title={t('wallets.createCustom', { name: typed })}
              subtitle={t('wallets.customPlatform')}
              onPress={() => onSelect({ kind: 'custom', name: typed })}
            />
          </>
        ) : null}
      </Card>
    </View>
  );
}

/** Plataforma elegida, con opción de cambiarla. */
export function SelectedPlatform({
  platform,
  name,
  onChange,
}: {
  platform?: Platform;
  name: string;
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={spacing.md} style={{ flex: 1 }}>
          <PlatformLogo platform={platform} name={platform?.name ?? name} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={1}>
              {platform?.name ?? name}
            </Text>
            <Text variant="caption" muted>
              {platform ? t(`walletTypes.${platform.type}`) : t('wallets.customPlatform')}
            </Text>
          </View>
        </Row>
        {onChange ? <Button title={t('tx.changeAsset')} variant="ghost" small onPress={onChange} /> : null}
      </Row>
    </Card>
  );
}
