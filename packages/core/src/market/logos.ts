import { MAIN_CURRENCIES } from '../fx/currencies.ts';
import type { AssetType } from '../types.ts';
import { MOCK_CATALOG } from './catalog.ts';

export interface LogoSubject {
  symbol: string;
  type: AssetType;
  exchange?: string;
  country?: string;
  /** Logo informado por el proveedor de datos; tiene prioridad. */
  logoUrl?: string;
}

/** Sufijo del ticker en cada bolsa (formato de Financial Modeling Prep / Yahoo). */
const EXCHANGE_SUFFIX: Record<string, string> = {
  BYMA: '.BA',
  B3: '.SA',
  BMV: '.MX',
  XETRA: '.DE',
  'Euronext Paris': '.PA',
  Euronext: '.AS',
  BME: '.MC',
  SIX: '.SW',
  LSE: '.L',
  TSE: '.T',
  BCS: '.SN',
  BVC: '.CL',
};

/** Sitio web conocido de cada emisor, para usar su ícono como respaldo. */
const KNOWN_DOMAINS: Record<string, string> = Object.fromEntries(
  MOCK_CATALOG.filter((e) => e.domain).map((e) => [e.symbol, e.domain!]),
);

/**
 * URLs candidatas para el logo de un activo, en orden de preferencia. La interfaz prueba
 * una por una y, si ninguna carga, muestra las iniciales.
 */
export function logoCandidates(asset: LogoSubject): string[] {
  const out: string[] = [];
  if (asset.logoUrl) out.push(asset.logoUrl);
  const symbol = asset.symbol.toUpperCase();

  if (asset.type === 'crypto') {
    const lower = symbol.toLowerCase();
    out.push(`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${lower}.png`);
    out.push(`https://assets.coincap.io/assets/icons/${lower}@2x.png`);
    return out;
  }

  if (asset.type === 'stock' || asset.type === 'etf' || asset.type === 'fund') {
    const suffix = asset.exchange ? EXCHANGE_SUFFIX[asset.exchange] : undefined;
    const tickers = suffix ? [`${symbol}${suffix}`, symbol] : [symbol];
    for (const ticker of tickers) out.push(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`);
    const domain = KNOWN_DOMAINS[symbol];
    if (domain) out.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  }
  return out;
}

/** Bandera (emoji) de un país ISO 3166-1 alfa-2, o de la Unión Europea con "EU". */
export function flagEmoji(country: string | undefined): string | undefined {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return undefined;
  const base = 0x1f1e6;
  const upper = country.toUpperCase();
  return String.fromCodePoint(base + upper.charCodeAt(0) - 65, base + upper.charCodeAt(1) - 65);
}

/** Bandera para bonos y efectivo: país del emisor o país de la moneda. */
export function assetFlag(asset: LogoSubject): string | undefined {
  if (asset.type === 'bond') return flagEmoji(asset.country);
  if (asset.type === 'cash') {
    const country = asset.country ?? MAIN_CURRENCIES.find((c) => c.code === asset.symbol.toUpperCase())?.country;
    return flagEmoji(country);
  }
  return undefined;
}
