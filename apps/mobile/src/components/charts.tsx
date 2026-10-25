import type { AllocationSlice } from '@my-finance/core';
import { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { useFormat } from '@/hooks/useFormat';
import { spacing, useTheme } from '@/theme';
import { Row, Text } from './ui';

/** Gráfico de línea con área, escalado al rango de los datos. */
export function LineChart({
  values,
  height = 160,
  color,
  baseline,
}: {
  values: readonly number[];
  height?: number;
  color?: string;
  /** Valor de referencia dibujado como línea punteada (p. ej. aportes netos). */
  baseline?: readonly number[];
}) {
  const c = useTheme();
  const [width, setWidth] = useState(0);
  const gradientId = `fill${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stroke = color ?? c.primary;
  const all = [...values, ...(baseline ?? [])].filter(Number.isFinite);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || Math.abs(max) || 1;
  const pad = 6;

  const toPath = (series: readonly number[]) =>
    series
      .map((v, i) => {
        const x = series.length > 1 ? (i / (series.length - 1)) * width : 0;
        const y = pad + (1 - (v - min) / span) * (height - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const line = values.length > 1 && width > 0 ? toPath(values) : '';
  const area = line ? `${line} L${width},${height} L0,${height} Z` : '';

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
    >
      {width > 0 && line ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.25} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gradientId})`} />
          {baseline && baseline.length > 1 ? (
            <Path d={toPath(baseline)} stroke={c.muted} strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
          ) : null}
          <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" />
          <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={c.border} strokeWidth={1} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Barra apilada de distribución con leyenda (más legible que un gráfico de torta en pantallas chicas). */
export function AllocationBar({
  slices,
  labelOf,
  currency,
  maxItems = 6,
}: {
  slices: readonly AllocationSlice[];
  labelOf: (key: string) => string;
  currency: string;
  maxItems?: number;
}) {
  const c = useTheme();
  const f = useFormat();
  const top = slices.slice(0, maxItems);
  const rest = slices.slice(maxItems);
  const items = rest.length
    ? [
        ...top,
        {
          key: '__other__',
          value: rest.reduce((s, x) => s + x.value, 0),
          weight: rest.reduce((s, x) => s + x.weight, 0),
        },
      ]
    : top;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.cardAlt }}>
        {items.map((s, i) => (
          <View
            key={s.key}
            style={{
              flex: Math.max(s.weight, 0.0001),
              backgroundColor: c.series[i % c.series.length],
              marginRight: i < items.length - 1 ? 2 : 0,
            }}
          />
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        {items.map((s, i) => (
          <Row key={s.key} style={{ justifyContent: 'space-between' }}>
            <Row gap={spacing.sm} style={{ flex: 1 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.series[i % c.series.length] }} />
              <Text numberOfLines={1} style={{ flex: 1 }}>
                {s.key === '__other__' ? '…' : labelOf(s.key)}
              </Text>
            </Row>
            <Text muted style={{ fontVariant: ['tabular-nums'] }}>
              {f.money(s.value, currency, true)}
            </Text>
            <Text numberOfLines={1} style={{ minWidth: 76, textAlign: 'right', fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              {f.pct(s.weight, false)}
            </Text>
          </Row>
        ))}
      </View>
    </View>
  );
}
