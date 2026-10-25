import { axisGranularity, axisTickIndices, nearestIndex, type AllocationSlice, type AxisGranularity } from '@my-finance/core';
import { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { numberLocale } from '@/i18n';
import { useFormat } from '@/hooks/useFormat';
import { spacing, useTheme } from '@/theme';
import { Row, Text } from './ui';

/** Formato de fecha para el eje según el nivel de detalle. */
function axisLabel(date: string, granularity: AxisGranularity): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  const options: Intl.DateTimeFormatOptions =
    granularity === 'day'
      ? { day: 'numeric', month: 'short' }
      : granularity === 'month'
        ? { month: 'short', year: '2-digit' }
        : { year: 'numeric' };
  return d.toLocaleDateString(numberLocale(), { ...options, timeZone: 'UTC' });
}

/** Fecha compacta para la etiqueta del punto tocado (p. ej. "6 abr 26"). */
function shortDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString(numberLocale(), { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
    .replace(/ de /g, ' ');
}

const AXIS_HEIGHT = 20;
const LABEL_WIDTH = 72;

/**
 * Gráfico de línea con área, eje de fechas y lectura al tocar: al apoyar o deslizar el dedo
 * muestra el valor y la fecha de ese punto.
 */
export function LineChart({
  values,
  dates,
  height = 180,
  color,
  baseline,
  formatValue,
  onScrub,
}: {
  values: readonly number[];
  /** Fecha (YYYY-MM-DD) de cada valor; habilita el eje de tiempo y la lectura por día. */
  dates?: readonly string[];
  height?: number;
  color?: string;
  /** Valor de referencia dibujado como línea punteada (p. ej. aportes netos). */
  baseline?: readonly number[];
  formatValue?: (value: number) => string;
  /** Se llama con el índice del punto tocado, o null al soltar. */
  onScrub?: (index: number | null) => void;
}) {
  const c = useTheme();
  const f = useFormat();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const gradientId = `fill${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stroke = color ?? c.primary;
  const all = [...values, ...(baseline ?? [])].filter(Number.isFinite);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || Math.abs(max) || 1;
  const padTop = 10;
  const padBottom = 6;
  const fmt = formatValue ?? ((v: number) => f.num(v, 2));

  const xOf = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * width : 0);
  const yOf = (v: number) => padTop + (1 - (v - min) / span) * (height - padTop - padBottom);
  const toPath = (series: readonly number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i, series.length).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');

  const line = values.length > 1 && width > 0 ? toPath(values) : '';
  const area = line ? `${line} L${width},${height} L0,${height} Z` : '';
  const hasDates = !!dates && dates.length === values.length && values.length > 1;
  const granularity = hasDates ? axisGranularity(dates![0]!, dates![dates!.length - 1]!) : 'month';
  const ticks = hasDates ? axisTickIndices(values.length, 4) : [];

  const scrubTo = (x: number) => {
    const i = nearestIndex(x, width, values.length);
    setActive(i);
    onScrub?.(i);
  };
  const release = () => {
    setActive(null);
    onScrub?.(null);
  };

  const activeX = active !== null ? xOf(active, values.length) : 0;
  const activeY = active !== null ? yOf(values[active]!) : 0;
  const tooltip =
    active !== null
      ? `${fmt(values[active]!)}${hasDates ? ` · ${shortDate(dates![active]!)}` : ''}`
      : '';
  const tooltipWidth = 220;
  const tooltipLeft = Math.min(Math.max(activeX - tooltipWidth / 2, 0), Math.max(width - tooltipWidth, 0));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image">
      <View
        style={{ height }}
        onStartShouldSetResponder={() => values.length > 1}
        onMoveShouldSetResponder={() => values.length > 1}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => scrubTo(e.nativeEvent.locationX)}
        onResponderMove={(e) => scrubTo(e.nativeEvent.locationX)}
        onResponderRelease={release}
        onResponderTerminate={release}
      >
        {width > 0 && line ? (
          <Svg width={width} height={height} pointerEvents="none">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.25} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line x1={0} x2={width} y1={yOf(max)} y2={yOf(max)} stroke={c.border} strokeWidth={1} strokeDasharray="3 4" />
            <Line x1={0} x2={width} y1={yOf(min)} y2={yOf(min)} stroke={c.border} strokeWidth={1} strokeDasharray="3 4" />
            <Path d={area} fill={`url(#${gradientId})`} />
            {baseline && baseline.length > 1 ? (
              <Path d={toPath(baseline)} stroke={c.muted} strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
            ) : null}
            <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke={c.border} strokeWidth={1} />
            {active !== null ? (
              <>
                <Line x1={activeX} x2={activeX} y1={0} y2={height} stroke={c.muted} strokeWidth={1} />
                <Circle cx={activeX} cy={activeY} r={5} fill={stroke} stroke={c.card} strokeWidth={2} />
              </>
            ) : null}
          </Svg>
        ) : null}
        {width > 0 && line && active === null ? (
          <>
            <Text variant="caption" muted style={[styles.yLabel, { top: Math.max(yOf(max) - 16, 0) }]}>
              {fmt(max)}
            </Text>
            <Text variant="caption" muted style={[styles.yLabel, { top: Math.min(yOf(min) + 2, height - 16) }]}>
              {fmt(min)}
            </Text>
          </>
        ) : null}
        {active !== null ? (
          <View
            pointerEvents="none"
            style={[styles.tooltip, { left: tooltipLeft, width: tooltipWidth, backgroundColor: c.text }]}
          >
            <Text variant="caption" color={c.background} align="center" style={{ fontWeight: '700' }} numberOfLines={1}>
              {tooltip}
            </Text>
          </View>
        ) : null}
      </View>
      {hasDates && width > 0 ? (
        <View style={{ height: AXIS_HEIGHT }}>
          {ticks.map((i, k) => {
            const x = xOf(i, values.length);
            const first = k === 0;
            const last = k === ticks.length - 1;
            const left = first ? 0 : last ? width - LABEL_WIDTH : x - LABEL_WIDTH / 2;
            return (
              <Text
                key={i}
                variant="caption"
                muted
                numberOfLines={1}
                align={first ? 'left' : last ? 'right' : 'center'}
                style={{ position: 'absolute', top: 4, left, width: LABEL_WIDTH, fontSize: 11 }}
              >
                {axisLabel(dates![i]!, granularity)}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', right: 0, fontSize: 11 },
  tooltip: { position: 'absolute', top: -2, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
});

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
