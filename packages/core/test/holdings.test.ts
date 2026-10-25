import { describe, expect, it } from 'vitest';
import { holdingsTemplate, importFile, importHoldings, inferPriceUnit, templateLang, type HoldingsResult, type TemplateLang } from '../src/index.ts';

/** Tenencia como la muestra un broker argentino (datos inventados). */
const AR = [
  'Mi cartera al 24/10/2026',
  '',
  'Instrumento;Moneda;Cantidad;Último precio;PPC;Valorizado;Rendimiento',
  'BONO REP. ARGENTINA USD STEP UP 2030 (AL30);ARS;1.000;85.300,00;66.020,50;853.000,00;29,2%',
  'CEDEAR APPLE INC. (AAPL);ARS;12;15.250,5;12.000;183.006,00;27,1%',
  'FCI EJEMPLO RENDIMIENTO (FEJR);ARS;212.075,1679;8,9123;8,0278;1.890.068,42;11,0%',
  'Pesos;ARS;;;;45.320,10;',
  'Dólares MEP;USD;150,25;;;150,25;',
  'Total;;;;;3.021.394,52;',
].join('\n');

const row = (r: HoldingsResult, symbol: string) => r.rows.find((x) => x.symbol === symbol)!;

describe('tenencias', () => {
  it('lee una tenencia en español con bonos cada 100, efectivo y totales', () => {
    const r = importHoldings(AR, 'ARS')!;
    expect(r.mapping.numberFormat).toBe('comma');
    expect(r.rows.map((x) => x.symbol)).toEqual(['AL30', 'AAPL', 'FEJR', 'ARS', 'USD']);
    expect(r.skipped).toBe(1);
    expect(row(r, 'AL30')).toMatchObject({ quantity: 1000, unitCost: 66020.5, marketPrice: 85300, priceUnit: 100, assetType: 'bond', currency: 'ARS' });
    expect(row(r, 'AAPL')).toMatchObject({ quantity: 12, unitCost: 12000, priceUnit: 1, assetType: 'stock', name: 'CEDEAR APPLE INC.' });
    expect(row(r, 'FEJR')).toMatchObject({ assetType: 'fund', priceUnit: 1 });
    expect(row(r, 'FEJR').quantity).toBeCloseTo(212075.1679);
    expect(row(r, 'ARS')).toMatchObject({ assetType: 'cash', quantity: 45320.1, unitCost: 1, currency: 'ARS' });
    expect(row(r, 'USD')).toMatchObject({ assetType: 'cash', quantity: 150.25, currency: 'USD' });
  });

  it('lee una tenencia en inglés sin costo y suma activos repetidos', () => {
    const csv = ['Symbol,Description,Quantity,Price,Market Value,Currency', 'AAPL,Apple Inc,10,230.5,2305,USD', 'BTC,Bitcoin,0.5,60000,30000,USD', 'AAPL,Apple Inc,5,230.5,1152.5,USD'].join('\n');
    const r = importHoldings(csv, 'USD')!;
    expect(r.rows.map((x) => [x.symbol, x.quantity])).toEqual([
      ['AAPL', 15],
      ['BTC', 0.5],
    ]);
    expect(row(r, 'AAPL').unitCost).toBeUndefined();
    expect(row(r, 'BTC')).toMatchObject({ assetType: 'crypto', marketPrice: 60000 });
  });

  it('calcula el costo unitario desde el costo total (portugués)', () => {
    const csv = ['Ativo;Quantidade;Preço médio;Valor atual', 'PETR4;100;30,50;3.800,00', 'Reais;;;1.200,00'].join('\n');
    const r = importHoldings(csv, 'BRL')!;
    expect(row(r, 'PETR4')).toMatchObject({ quantity: 100, unitCost: 30.5, priceUnit: 1 });
    expect(row(r, 'BRL')).toMatchObject({ assetType: 'cash', quantity: 1200 });

    const total = importHoldings(['Activo;Cantidad;Costo total', 'GGAL;10;50.000'].join('\n'), 'ARS')!;
    expect(row(total, 'GGAL').unitCost).toBe(5000);
  });

  it('infiere la unidad de cotización', () => {
    expect(inferPriceUnit(1000, 85300, 853000, 1.25)).toBe(100);
    expect(inferPriceUnit(10, 230, 2300, 1.25)).toBe(1);
    expect(inferPriceUnit(10, 230, 5000, 1.25)).toBeUndefined();
    expect(inferPriceUnit(1000, 66020, 853000, 3)).toBe(100);
  });

  it('distingue movimientos de tenencia', () => {
    expect(importFile(AR, { defaultCurrency: 'ARS' }).kind).toBe('holdings');
    const movements = ['Fecha;Operación;Especie;Cantidad;Precio', '10/03/2025;Compra;APPLE (AAPL);10;200'].join('\n');
    const m = importFile(movements, { defaultCurrency: 'ARS' });
    expect(m.kind).toBe('transactions');
    expect(m.kind === 'transactions' && m.result.rows.length).toBe(1);
    const unknown = importFile('hola;chau\n1;2', {});
    expect(unknown.kind).toBe('transactions');
    expect(unknown.kind === 'transactions' && unknown.result.errors.length).toBe(1);
  });

  it.each<[TemplateLang, string]>([
    ['es', 'ARS'],
    ['en', 'USD'],
    ['pt', 'BRL'],
  ])('reconoce la planilla de tenencia de la app (%s)', (lang, cash) => {
    const file = importFile(holdingsTemplate(lang), { defaultCurrency: cash === 'USD' ? 'USD' : cash });
    expect(file.kind).toBe('holdings');
    if (file.kind !== 'holdings') return;
    const r = file.result;
    expect(r.rows).toHaveLength(4);
    expect(r.errors).toEqual([]);
    expect(row(r, cash)).toMatchObject({ assetType: 'cash', unitCost: 1 });
    expect(row(r, 'BTC')).toMatchObject({ quantity: 0.05, unitCost: 98000, assetType: 'crypto', currency: 'USD' });
    expect(r.rows.filter((x) => x.assetType !== 'cash').every((x) => x.unitCost !== undefined && x.name)).toBe(true);
  });

  it('elige el idioma de la planilla', () => {
    expect(templateLang('es-AR')).toBe('es');
    expect(templateLang('pt-BR')).toBe('pt');
    expect(templateLang('en')).toBe('en');
    expect(templateLang('fr')).toBe('es');
  });
});
