import { describe, expect, it } from 'vitest';
import { axisGranularity, axisTickIndices, nearestIndex } from '../src/index.ts';

describe('eje de tiempo del gráfico', () => {
  it('elige días, meses o años según el período', () => {
    expect(axisGranularity('2025-01-01', '2025-01-31')).toBe('day');
    expect(axisGranularity('2025-01-01', '2025-12-31')).toBe('month');
    expect(axisGranularity('2020-01-01', '2025-01-01')).toBe('year');
  });

  it('reparte las marcas incluyendo extremos', () => {
    expect(axisTickIndices(366, 4)).toEqual([0, 122, 243, 365]);
    expect(axisTickIndices(2, 4)).toEqual([0, 1]);
    expect(axisTickIndices(1)).toEqual([0]);
    expect(axisTickIndices(0)).toEqual([]);
  });

  it('encuentra el punto más cercano al dedo', () => {
    expect(nearestIndex(0, 300, 11)).toBe(0);
    expect(nearestIndex(150, 300, 11)).toBe(5);
    expect(nearestIndex(299, 300, 11)).toBe(10);
    expect(nearestIndex(-20, 300, 11)).toBe(0);
    expect(nearestIndex(500, 300, 11)).toBe(10);
  });
});
