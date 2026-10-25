import type { AssetType, CurrencyCode } from '../types.ts';

/** Activo del catálogo de desarrollo, con parámetros para simular su precio. */
export interface CatalogEntry {
  symbol: string;
  name: string;
  type: AssetType;
  currency: CurrencyCode;
  exchange?: string;
  country?: string;
  /** Precio de referencia en la fecha ancla de la simulación. */
  basePrice: number;
  /** Volatilidad anual aproximada (0.3 = 30 %). */
  volatility: number;
  /** Rendimiento anual esperado aproximado. */
  drift: number;
  sector?: string;
  /** Capitalización aproximada en millones de la moneda del activo. */
  marketCapM?: number;
  /** Sitio web del emisor (para su ícono). */
  domain?: string;
}

/**
 * Catálogo usado por el proveedor simulado. Los precios son ilustrativos y no
 * representan cotizaciones reales.
 */
export const MOCK_CATALOG: readonly CatalogEntry[] = [
  // Cripto
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD', basePrice: 95000, volatility: 0.55, drift: 0.3 },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto', currency: 'USD', basePrice: 3500, volatility: 0.7, drift: 0.25 },
  { symbol: 'SOL', name: 'Solana', type: 'crypto', currency: 'USD', basePrice: 180, volatility: 0.9, drift: 0.3 },
  { symbol: 'BNB', name: 'BNB', type: 'crypto', currency: 'USD', basePrice: 650, volatility: 0.6, drift: 0.2 },
  { symbol: 'XRP', name: 'XRP', type: 'crypto', currency: 'USD', basePrice: 2.3, volatility: 0.85, drift: 0.15 },
  { symbol: 'ADA', name: 'Cardano', type: 'crypto', currency: 'USD', basePrice: 0.75, volatility: 0.85, drift: 0.1 },
  { symbol: 'DOGE', name: 'Dogecoin', type: 'crypto', currency: 'USD', basePrice: 0.2, volatility: 1.0, drift: 0.1 },
  { symbol: 'LINK', name: 'Chainlink', type: 'crypto', currency: 'USD', basePrice: 18, volatility: 0.8, drift: 0.15 },
  { symbol: 'AVAX', name: 'Avalanche', type: 'crypto', currency: 'USD', basePrice: 30, volatility: 0.9, drift: 0.1 },
  { symbol: 'USDT', name: 'Tether USD', type: 'crypto', currency: 'USD', basePrice: 1, volatility: 0.002, drift: 0 },
  { symbol: 'USDC', name: 'USD Coin', type: 'crypto', currency: 'USD', basePrice: 1, volatility: 0.002, drift: 0 },

  // Estados Unidos
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 230, volatility: 0.27, drift: 0.12, sector: 'Tecnología', marketCapM: 3500000, domain: 'apple.com' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 450, volatility: 0.25, drift: 0.13, sector: 'Tecnología', marketCapM: 3300000, domain: 'microsoft.com' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 140, volatility: 0.5, drift: 0.3, sector: 'Tecnología', marketCapM: 3400000, domain: 'nvidia.com' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 210, volatility: 0.32, drift: 0.14, sector: 'Consumo discrecional', marketCapM: 2200000, domain: 'amazon.com' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Clase A', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 180, volatility: 0.3, drift: 0.12, sector: 'Comunicaciones', marketCapM: 2200000, domain: 'abc.xyz' },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 600, volatility: 0.38, drift: 0.15, sector: 'Comunicaciones', marketCapM: 1500000, domain: 'meta.com' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 300, volatility: 0.6, drift: 0.1, sector: 'Consumo discrecional', marketCapM: 950000, domain: 'tesla.com' },
  { symbol: 'KO', name: 'The Coca-Cola Co.', type: 'stock', currency: 'USD', exchange: 'NYSE', country: 'US', basePrice: 70, volatility: 0.15, drift: 0.06, sector: 'Consumo básico', marketCapM: 300000, domain: 'coca-colacompany.com' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'stock', currency: 'USD', exchange: 'NYSE', country: 'US', basePrice: 240, volatility: 0.24, drift: 0.1, sector: 'Financiero', marketCapM: 680000, domain: 'jpmorganchase.com' },
  { symbol: 'MELI', name: 'MercadoLibre Inc.', type: 'stock', currency: 'USD', exchange: 'NASDAQ', country: 'AR', basePrice: 2100, volatility: 0.42, drift: 0.18, sector: 'Consumo discrecional', marketCapM: 105000, domain: 'mercadolibre.com' },

  // ETFs
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'etf', currency: 'USD', exchange: 'NYSE Arca', country: 'US', basePrice: 600, volatility: 0.17, drift: 0.09, domain: 'ssga.com' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'etf', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 520, volatility: 0.22, drift: 0.11, domain: 'invesco.com' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'etf', currency: 'USD', exchange: 'NYSE Arca', country: 'US', basePrice: 290, volatility: 0.17, drift: 0.09, domain: 'vanguard.com' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', type: 'etf', currency: 'USD', exchange: 'NYSE Arca', country: 'US', basePrice: 45, volatility: 0.2, drift: 0.05, domain: 'ishares.com' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', type: 'etf', currency: 'USD', exchange: 'NYSE Arca', country: 'US', basePrice: 250, volatility: 0.15, drift: 0.06, domain: 'spdrgoldshares.com' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', type: 'etf', currency: 'USD', exchange: 'NASDAQ', country: 'US', basePrice: 90, volatility: 0.16, drift: 0.02, domain: 'ishares.com' },

  // Bonos
  { symbol: 'UST10Y', name: 'US Treasury Note 10 años', type: 'bond', currency: 'USD', country: 'US', basePrice: 98, volatility: 0.07, drift: 0.01 },
  { symbol: 'AL30', name: 'Bono Rep. Argentina 2030 (Ley local)', type: 'bond', currency: 'USD', exchange: 'BYMA', country: 'AR', basePrice: 65, volatility: 0.25, drift: 0.1 },
  { symbol: 'GD30', name: 'Bono Rep. Argentina 2030 (Ley NY)', type: 'bond', currency: 'USD', exchange: 'BYMA', country: 'AR', basePrice: 68, volatility: 0.24, drift: 0.1 },

  // Argentina
  { symbol: 'GGAL', name: 'Grupo Financiero Galicia', type: 'stock', currency: 'ARS', exchange: 'BYMA', country: 'AR', basePrice: 6500, volatility: 0.55, drift: 0.4, sector: 'Financiero', marketCapM: 9500000, domain: 'gfgsa.com' },
  { symbol: 'YPFD', name: 'YPF S.A.', type: 'stock', currency: 'ARS', exchange: 'BYMA', country: 'AR', basePrice: 40000, volatility: 0.5, drift: 0.4, sector: 'Energía', marketCapM: 15700000, domain: 'ypf.com' },
  { symbol: 'PAMP', name: 'Pampa Energía S.A.', type: 'stock', currency: 'ARS', exchange: 'BYMA', country: 'AR', basePrice: 3200, volatility: 0.48, drift: 0.4, sector: 'Energía', marketCapM: 4300000, domain: 'pampaenergia.com' },
  { symbol: 'BMA', name: 'Banco Macro S.A.', type: 'stock', currency: 'ARS', exchange: 'BYMA', country: 'AR', basePrice: 9000, volatility: 0.55, drift: 0.4, sector: 'Financiero', marketCapM: 5700000, domain: 'macro.com.ar' },

  // Brasil
  { symbol: 'PETR4', name: 'Petrobras PN', type: 'stock', currency: 'BRL', exchange: 'B3', country: 'BR', basePrice: 38, volatility: 0.32, drift: 0.08, sector: 'Energía', marketCapM: 490000, domain: 'petrobras.com.br' },
  { symbol: 'VALE3', name: 'Vale ON', type: 'stock', currency: 'BRL', exchange: 'B3', country: 'BR', basePrice: 60, volatility: 0.3, drift: 0.06, sector: 'Materiales', marketCapM: 260000, domain: 'vale.com' },
  { symbol: 'ITUB4', name: 'Itaú Unibanco PN', type: 'stock', currency: 'BRL', exchange: 'B3', country: 'BR', basePrice: 35, volatility: 0.25, drift: 0.09, sector: 'Financiero', marketCapM: 340000, domain: 'itau.com.br' },

  // México, Chile, Colombia
  { symbol: 'WALMEX', name: 'Walmart de México', type: 'stock', currency: 'MXN', exchange: 'BMV', country: 'MX', basePrice: 60, volatility: 0.24, drift: 0.07, sector: 'Consumo básico', marketCapM: 1050000, domain: 'walmex.mx' },
  { symbol: 'AMXB', name: 'América Móvil', type: 'stock', currency: 'MXN', exchange: 'BMV', country: 'MX', basePrice: 16, volatility: 0.26, drift: 0.05, sector: 'Comunicaciones', marketCapM: 1000000, domain: 'americamovil.com' },
  { symbol: 'SQM-B', name: 'Sociedad Química y Minera', type: 'stock', currency: 'CLP', exchange: 'BCS', country: 'CL', basePrice: 40000, volatility: 0.4, drift: 0.05, sector: 'Materiales', marketCapM: 11000000, domain: 'sqm.com' },
  { symbol: 'ECOPETROL', name: 'Ecopetrol S.A.', type: 'stock', currency: 'COP', exchange: 'BVC', country: 'CO', basePrice: 2000, volatility: 0.33, drift: 0.04, sector: 'Energía', marketCapM: 82000000, domain: 'ecopetrol.com.co' },

  // Europa y Asia
  { symbol: 'SAP', name: 'SAP SE', type: 'stock', currency: 'EUR', exchange: 'XETRA', country: 'DE', basePrice: 240, volatility: 0.26, drift: 0.12, sector: 'Tecnología', marketCapM: 280000, domain: 'sap.com' },
  { symbol: 'ASML', name: 'ASML Holding N.V.', type: 'stock', currency: 'EUR', exchange: 'Euronext', country: 'NL', basePrice: 700, volatility: 0.36, drift: 0.12, sector: 'Tecnología', marketCapM: 275000, domain: 'asml.com' },
  { symbol: 'MC', name: 'LVMH Moët Hennessy', type: 'stock', currency: 'EUR', exchange: 'Euronext Paris', country: 'FR', basePrice: 650, volatility: 0.28, drift: 0.07, sector: 'Consumo discrecional', marketCapM: 325000, domain: 'lvmh.com' },
  { symbol: 'SAN', name: 'Banco Santander S.A.', type: 'stock', currency: 'EUR', exchange: 'BME', country: 'ES', basePrice: 5, volatility: 0.28, drift: 0.08, sector: 'Financiero', marketCapM: 75000, domain: 'santander.com' },
  { symbol: 'NESN', name: 'Nestlé S.A.', type: 'stock', currency: 'CHF', exchange: 'SIX', country: 'CH', basePrice: 85, volatility: 0.16, drift: 0.03, sector: 'Consumo básico', marketCapM: 220000, domain: 'nestle.com' },
  { symbol: 'SHEL', name: 'Shell plc', type: 'stock', currency: 'GBP', exchange: 'LSE', country: 'GB', basePrice: 26, volatility: 0.24, drift: 0.06, sector: 'Energía', marketCapM: 165000, domain: 'shell.com' },
  { symbol: '7203', name: 'Toyota Motor Corp.', type: 'stock', currency: 'JPY', exchange: 'TSE', country: 'JP', basePrice: 2800, volatility: 0.28, drift: 0.07, sector: 'Consumo discrecional', marketCapM: 44000000, domain: 'toyota-global.com' },

  // Efectivo
  { symbol: 'USD', name: 'Dólar estadounidense', type: 'cash', currency: 'USD', basePrice: 1, volatility: 0, drift: 0 },
  { symbol: 'EUR', name: 'Euro', type: 'cash', currency: 'EUR', basePrice: 1, volatility: 0, drift: 0 },
  { symbol: 'ARS', name: 'Peso argentino', type: 'cash', currency: 'ARS', basePrice: 1, volatility: 0, drift: 0 },
];

/** Unidades de cada moneda por 1 USD (valores ilustrativos para desarrollo). */
export const MOCK_FX_PER_USD: Record<CurrencyCode, number> = {
  USD: 1,
  USDT: 1,
  USDC: 1,
  EUR: 0.92,
  GBP: 0.79,
  CHF: 0.88,
  JPY: 150,
  CAD: 1.37,
  ARS: 1150,
  BRL: 5.5,
  MXN: 18,
  CLP: 940,
  COP: 4000,
  PEN: 3.7,
  UYU: 40,
};
