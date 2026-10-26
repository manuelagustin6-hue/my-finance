import type { Asset } from '../types.ts';

/** Ids de CoinGecko de las criptomonedas del catálogo de desarrollo. */
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
  LTC: 'litecoin',
  TRX: 'tron',
  TON: 'the-open-network',
  SHIB: 'shiba-inu',
};

/**
 * Convierte el `providerId` de los datos simulados (símbolo pelado, p. ej. "AL30") al formato de
 * los proveedores reales (`ar:AL30D`, `us:AAPL`, `cg:bitcoin`). Devuelve undefined si no aplica.
 */
export function legacyProviderId(asset: Pick<Asset, 'providerId' | 'symbol' | 'type' | 'currency' | 'exchange' | 'country'>): string | undefined {
  const id = asset.providerId;
  if (!id || id.includes(':')) return undefined;
  const symbol = id.toUpperCase();
  if (asset.type === 'crypto') {
    const cg = COINGECKO_IDS[symbol];
    return cg ? `cg:${cg}` : undefined;
  }
  if (asset.type === 'cash') return undefined;
  if (asset.exchange === 'BYMA' || asset.country === 'AR') {
    // En los datos simulados los bonos en dólares usaban el símbolo en pesos (AL30 en USD = AL30D).
    return asset.currency === 'USD' && !symbol.endsWith('D') ? `ar:${symbol}D` : `ar:${symbol}`;
  }
  if (asset.currency === 'USD') return `us:${symbol}`;
  return undefined;
}
