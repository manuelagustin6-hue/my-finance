/** Nivel de detalle de las fechas del eje horizontal según el período mostrado. */
export type AxisGranularity = 'day' | 'month' | 'year';

const DAY_MS = 86_400_000;

/** Hasta ~2 meses: días; hasta ~2 años: meses; más: años. */
export function axisGranularity(from: string, to: string): AxisGranularity {
  const days = (Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY_MS;
  if (days <= 62) return 'day';
  if (days <= 730) return 'month';
  return 'year';
}

/**
 * Índices de los puntos que llevan etiqueta en el eje: `count` marcas repartidas de forma pareja,
 * incluyendo el primero y el último punto.
 */
export function axisTickIndices(length: number, count = 4): number[] {
  if (length <= 0) return [];
  if (length === 1 || count <= 1) return [0];
  const n = Math.min(count, length);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) out.add(Math.round((i * (length - 1)) / (n - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Índice del punto más cercano a una posición horizontal (0..width) en un gráfico de `length` puntos. */
export function nearestIndex(x: number, width: number, length: number): number {
  if (length <= 1 || width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, x / width));
  return Math.round(ratio * (length - 1));
}
