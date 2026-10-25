import { describe, expect, it } from 'vitest';
import { normalizeWebUrl, PLATFORMS, platformById, platformWebUrl, searchPlatforms, urlHost } from '../src/index.ts';

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

describe('dirección web de la plataforma', () => {
  it('usa la página de ingreso o la portada del dominio', () => {
    expect(platformWebUrl(platformById('cocos')!)).toBe('https://app.cocos.capital');
    expect(platformWebUrl(platformById('binance')!)).toBe('https://binance.com');
  });

  it('normaliza lo que escribe el usuario', () => {
    expect(normalizeWebUrl('mibroker.com.ar/login')).toBe('https://mibroker.com.ar/login');
    expect(normalizeWebUrl('http://WWW.Broker.com')).toBe('https://www.broker.com');
    expect(normalizeWebUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeWebUrl('file:///etc/passwd')).toBeUndefined();
    expect(normalizeWebUrl('no es una web')).toBeUndefined();
    expect(normalizeWebUrl('localhost')).toBeUndefined();
    expect(urlHost('https://www.app.cocos.capital/movimientos?x=1')).toBe('app.cocos.capital');
  });
});
