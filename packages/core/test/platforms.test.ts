import { describe, expect, it } from 'vitest';
import { PLATFORMS, platformById, searchPlatforms } from '../src/index.ts';

describe('catálogo de plataformas', () => {
  it('ids únicos', () => {
    expect(new Set(PLATFORMS.map((p) => p.id)).size).toBe(PLATFORMS.length);
  });

  it('busca por nombre, alias y sin acentos', () => {
    expect(searchPlatforms('bina')[0]?.id).toBe('binance');
    expect(searchPlatforms('IOL')[0]?.id).toBe('iol');
    expect(searchPlatforms('uala')[0]?.id).toBe('uala');
    expect(searchPlatforms('bull')[0]?.id).toBe('bullmarket');
    expect(searchPlatforms('zzzz')).toEqual([]);
  });

  it('prioriza las del país del usuario', () => {
    const ar = searchPlatforms('', 'AR');
    expect(ar[0]!.countries).toContain('AR');
    const santanderAr = searchPlatforms('santander', 'AR');
    expect(santanderAr[0]?.id).toBe('santander-ar');
  });

  it('busca por id', () => {
    expect(platformById('ibkr')?.name).toBe('Interactive Brokers');
    expect(platformById(undefined)).toBeUndefined();
  });
});
