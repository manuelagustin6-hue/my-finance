import { assetFlag, logoCandidates, type LogoSubject } from '@my-finance/core';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from './ui';

/**
 * Logo del activo en un círculo. Prueba las URLs candidatas en orden; bonos y efectivo
 * muestran la bandera; si no hay logo disponible, muestra las iniciales.
 */
export function AssetLogo({ asset, index = 0, size = 36 }: { asset: LogoSubject; index?: number; size?: number }) {
  const c = useTheme();
  const urls = useMemo(() => logoCandidates(asset), [asset]);
  const flag = assetFlag(asset);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const color = c.series[index % c.series.length]!;
  const url = urls[attempt];

  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  if (flag && !asset.logoUrl) {
    return (
      <View style={[circle, { backgroundColor: c.cardAlt }]} accessibilityLabel={asset.symbol}>
        <Text style={{ fontSize: size * 0.55 }}>{flag}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        circle,
        loaded
          ? { backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }
          : { backgroundColor: `${color}22` },
      ]}
      accessibilityLabel={asset.symbol}
    >
      {!loaded ? (
        <Text style={{ fontWeight: '700', fontSize: size / 3 }} color={color}>
          {asset.symbol.slice(0, 4)}
        </Text>
      ) : null}
      {url ? (
        <Image
          key={url}
          source={{ uri: url }}
          resizeMode="contain"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setAttempt((n) => n + 1);
          }}
          style={{ position: 'absolute', width: size * 0.78, height: size * 0.78, opacity: loaded ? 1 : 0 }}
        />
      ) : null}
    </View>
  );
}
