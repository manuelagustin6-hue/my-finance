import type { CurrencyCode, WalletType } from './types.ts';

/** Plataforma conocida donde el usuario puede tener inversiones. */
export interface Platform {
  id: string;
  name: string;
  type: WalletType;
  /** Países donde opera (ISO 3166-1 alfa-2); vacío = global. */
  countries: readonly string[];
  /** Moneda principal de la cuenta. */
  currency: CurrencyCode;
  /** Sitio web (para mostrar su ícono). */
  domain: string;
  /** Otros nombres con los que se la busca. */
  aliases?: readonly string[];
}

const G: readonly string[] = [];

/** Catálogo inicial de plataformas. Si la del usuario no está, la crea a mano. */
export const PLATFORMS: readonly Platform[] = [
  // Exchanges globales
  { id: 'binance', name: 'Binance', type: 'exchange', countries: G, currency: 'USDT', domain: 'binance.com' },
  { id: 'coinbase', name: 'Coinbase', type: 'exchange', countries: G, currency: 'USD', domain: 'coinbase.com' },
  { id: 'kraken', name: 'Kraken', type: 'exchange', countries: G, currency: 'USD', domain: 'kraken.com' },
  { id: 'bybit', name: 'Bybit', type: 'exchange', countries: G, currency: 'USDT', domain: 'bybit.com' },
  { id: 'okx', name: 'OKX', type: 'exchange', countries: G, currency: 'USDT', domain: 'okx.com' },
  { id: 'kucoin', name: 'KuCoin', type: 'exchange', countries: G, currency: 'USDT', domain: 'kucoin.com' },
  { id: 'bitget', name: 'Bitget', type: 'exchange', countries: G, currency: 'USDT', domain: 'bitget.com' },
  { id: 'cryptocom', name: 'Crypto.com', type: 'exchange', countries: G, currency: 'USD', domain: 'crypto.com' },
  { id: 'gemini', name: 'Gemini', type: 'exchange', countries: G, currency: 'USD', domain: 'gemini.com' },
  { id: 'bitstamp', name: 'Bitstamp', type: 'exchange', countries: G, currency: 'USD', domain: 'bitstamp.net' },
  { id: 'bitfinex', name: 'Bitfinex', type: 'exchange', countries: G, currency: 'USD', domain: 'bitfinex.com' },

  // Exchanges y billeteras virtuales de Latinoamérica
  { id: 'bitso', name: 'Bitso', type: 'exchange', countries: ['MX', 'AR', 'CO', 'BR'], currency: 'USD', domain: 'bitso.com' },
  { id: 'lemon', name: 'Lemon', type: 'exchange', countries: ['AR'], currency: 'ARS', domain: 'lemon.me', aliases: ['Lemon Cash'] },
  { id: 'belo', name: 'Belo', type: 'exchange', countries: ['AR'], currency: 'ARS', domain: 'belo.app' },
  { id: 'buenbit', name: 'Buenbit', type: 'exchange', countries: ['AR', 'PE'], currency: 'ARS', domain: 'buenbit.com' },
  { id: 'ripio', name: 'Ripio', type: 'exchange', countries: ['AR', 'BR', 'MX', 'CO', 'UY'], currency: 'ARS', domain: 'ripio.com' },
  { id: 'mercadopago', name: 'Mercado Pago', type: 'bank', countries: ['AR', 'MX', 'BR', 'CL', 'CO', 'UY', 'PE'], currency: 'ARS', domain: 'mercadopago.com' },
  { id: 'mercadobitcoin', name: 'Mercado Bitcoin', type: 'exchange', countries: ['BR'], currency: 'BRL', domain: 'mercadobitcoin.com.br' },
  { id: 'foxbit', name: 'Foxbit', type: 'exchange', countries: ['BR'], currency: 'BRL', domain: 'foxbit.com.br' },
  { id: 'buda', name: 'Buda', type: 'exchange', countries: ['CL', 'CO', 'PE', 'AR'], currency: 'CLP', domain: 'buda.com' },
  { id: 'cryptomkt', name: 'CryptoMKT', type: 'exchange', countries: ['CL', 'AR', 'BR', 'MX'], currency: 'CLP', domain: 'cryptomkt.com' },

  // Brokers internacionales
  { id: 'ibkr', name: 'Interactive Brokers', type: 'broker', countries: G, currency: 'USD', domain: 'interactivebrokers.com', aliases: ['IBKR', 'IB'] },
  { id: 'schwab', name: 'Charles Schwab', type: 'broker', countries: G, currency: 'USD', domain: 'schwab.com', aliases: ['Schwab', 'TD Ameritrade'] },
  { id: 'fidelity', name: 'Fidelity', type: 'broker', countries: ['US'], currency: 'USD', domain: 'fidelity.com' },
  { id: 'vanguard', name: 'Vanguard', type: 'broker', countries: ['US'], currency: 'USD', domain: 'vanguard.com' },
  { id: 'robinhood', name: 'Robinhood', type: 'broker', countries: ['US', 'GB'], currency: 'USD', domain: 'robinhood.com' },
  { id: 'webull', name: 'Webull', type: 'broker', countries: G, currency: 'USD', domain: 'webull.com' },
  { id: 'etoro', name: 'eToro', type: 'broker', countries: G, currency: 'USD', domain: 'etoro.com' },
  { id: 'trading212', name: 'Trading 212', type: 'broker', countries: G, currency: 'EUR', domain: 'trading212.com' },
  { id: 'degiro', name: 'DEGIRO', type: 'broker', countries: G, currency: 'EUR', domain: 'degiro.com' },
  { id: 'saxo', name: 'Saxo Bank', type: 'broker', countries: G, currency: 'EUR', domain: 'home.saxo', aliases: ['Saxo'] },
  { id: 'revolut', name: 'Revolut', type: 'broker', countries: G, currency: 'EUR', domain: 'revolut.com' },
  { id: 'hapi', name: 'Hapi', type: 'broker', countries: ['AR', 'CO', 'MX', 'PE', 'CL', 'UY'], currency: 'USD', domain: 'hapi.trade' },

  // Argentina
  { id: 'iol', name: 'InvertirOnline', type: 'broker', countries: ['AR'], currency: 'ARS', domain: 'invertironline.com', aliases: ['IOL'] },
  { id: 'balanz', name: 'Balanz', type: 'broker', countries: ['AR', 'UY'], currency: 'ARS', domain: 'balanz.com' },
  { id: 'bullmarket', name: 'Bull Market Brokers', type: 'broker', countries: ['AR'], currency: 'ARS', domain: 'bullmarketbrokers.com', aliases: ['Bull Market'] },
  { id: 'ppi', name: 'Portfolio Personal Inversiones', type: 'broker', countries: ['AR'], currency: 'ARS', domain: 'portfoliopersonal.com', aliases: ['PPI'] },
  { id: 'cocos', name: 'Cocos Capital', type: 'broker', countries: ['AR'], currency: 'ARS', domain: 'cocos.capital', aliases: ['Cocos'] },
  { id: 'allaria', name: 'Allaria', type: 'broker', countries: ['AR'], currency: 'ARS', domain: 'allaria.com.ar' },
  { id: 'inviu', name: 'Inviu', type: 'broker', countries: ['AR'], currency: 'ARS', domain: 'inviu.com.ar' },
  { id: 'ieb', name: 'IEB+', type: 'broker', countries: ['AR'], currency: 'ARS', domain: 'iebmas.com.ar', aliases: ['Invertir en Bolsa'] },
  { id: 'galicia', name: 'Banco Galicia', type: 'bank', countries: ['AR'], currency: 'ARS', domain: 'galicia.ar', aliases: ['Galicia'] },
  { id: 'santander-ar', name: 'Santander Argentina', type: 'bank', countries: ['AR'], currency: 'ARS', domain: 'santander.com.ar' },
  { id: 'bbva-ar', name: 'BBVA Argentina', type: 'bank', countries: ['AR'], currency: 'ARS', domain: 'bbva.com.ar' },
  { id: 'nacion', name: 'Banco Nación', type: 'bank', countries: ['AR'], currency: 'ARS', domain: 'bna.com.ar', aliases: ['BNA'] },
  { id: 'macro', name: 'Banco Macro', type: 'bank', countries: ['AR'], currency: 'ARS', domain: 'macro.com.ar' },
  { id: 'brubank', name: 'Brubank', type: 'bank', countries: ['AR'], currency: 'ARS', domain: 'brubank.com' },
  { id: 'uala', name: 'Ualá', type: 'bank', countries: ['AR', 'MX', 'CO'], currency: 'ARS', domain: 'uala.com.ar', aliases: ['Uala'] },
  { id: 'naranjax', name: 'Naranja X', type: 'bank', countries: ['AR'], currency: 'ARS', domain: 'naranjax.com' },

  // Brasil
  { id: 'xp', name: 'XP Investimentos', type: 'broker', countries: ['BR'], currency: 'BRL', domain: 'xpi.com.br', aliases: ['XP'] },
  { id: 'btg', name: 'BTG Pactual', type: 'broker', countries: ['BR'], currency: 'BRL', domain: 'btgpactual.com' },
  { id: 'rico', name: 'Rico', type: 'broker', countries: ['BR'], currency: 'BRL', domain: 'rico.com.vc' },
  { id: 'clear', name: 'Clear Corretora', type: 'broker', countries: ['BR'], currency: 'BRL', domain: 'clear.com.br', aliases: ['Clear'] },
  { id: 'nubank', name: 'Nubank', type: 'bank', countries: ['BR', 'MX', 'CO'], currency: 'BRL', domain: 'nubank.com.br', aliases: ['Nu', 'NuInvest'] },
  { id: 'inter', name: 'Banco Inter', type: 'bank', countries: ['BR'], currency: 'BRL', domain: 'bancointer.com.br', aliases: ['Inter'] },
  { id: 'itau', name: 'Itaú', type: 'bank', countries: ['BR', 'CL', 'UY', 'PY', 'AR'], currency: 'BRL', domain: 'itau.com.br', aliases: ['Itau'] },

  // México
  { id: 'gbm', name: 'GBM+', type: 'broker', countries: ['MX'], currency: 'MXN', domain: 'gbm.com', aliases: ['GBM'] },
  { id: 'bursanet', name: 'Bursanet', type: 'broker', countries: ['MX'], currency: 'MXN', domain: 'bursanet.mx' },
  { id: 'kuspit', name: 'Kuspit', type: 'broker', countries: ['MX'], currency: 'MXN', domain: 'kuspit.com' },
  { id: 'actinver', name: 'Actinver', type: 'broker', countries: ['MX'], currency: 'MXN', domain: 'actinver.com' },
  { id: 'cetesdirecto', name: 'Cetesdirecto', type: 'broker', countries: ['MX'], currency: 'MXN', domain: 'cetesdirecto.com', aliases: ['CETES'] },
  { id: 'bbva-mx', name: 'BBVA México', type: 'bank', countries: ['MX'], currency: 'MXN', domain: 'bbva.mx' },

  // Chile, Colombia, Perú, Uruguay
  { id: 'fintual', name: 'Fintual', type: 'broker', countries: ['CL', 'MX'], currency: 'CLP', domain: 'fintual.cl' },
  { id: 'racional', name: 'Racional', type: 'broker', countries: ['CL'], currency: 'CLP', domain: 'racional.cl' },
  { id: 'larrainvial', name: 'LarrainVial', type: 'broker', countries: ['CL', 'CO', 'PE'], currency: 'CLP', domain: 'larrainvial.com' },
  { id: 'bancochile', name: 'Banco de Chile', type: 'bank', countries: ['CL'], currency: 'CLP', domain: 'bancochile.cl' },
  { id: 'trii', name: 'trii', type: 'broker', countries: ['CO', 'PE', 'CL'], currency: 'COP', domain: 'trii.co' },
  { id: 'bancolombia', name: 'Bancolombia', type: 'bank', countries: ['CO'], currency: 'COP', domain: 'bancolombia.com' },
  { id: 'davivienda', name: 'Davivienda', type: 'bank', countries: ['CO'], currency: 'COP', domain: 'davivienda.com' },
  { id: 'bcp', name: 'BCP', type: 'bank', countries: ['PE'], currency: 'PEN', domain: 'viabcp.com', aliases: ['Banco de Crédito del Perú'] },
  { id: 'brou', name: 'BROU', type: 'bank', countries: ['UY'], currency: 'UYU', domain: 'brou.com.uy', aliases: ['Banco República'] },

  // Billeteras propias (autocustodia)
  { id: 'metamask', name: 'MetaMask', type: 'self_custody', countries: G, currency: 'USD', domain: 'metamask.io' },
  { id: 'ledger', name: 'Ledger', type: 'self_custody', countries: G, currency: 'USD', domain: 'ledger.com' },
  { id: 'trezor', name: 'Trezor', type: 'self_custody', countries: G, currency: 'USD', domain: 'trezor.io' },
  { id: 'trustwallet', name: 'Trust Wallet', type: 'self_custody', countries: G, currency: 'USD', domain: 'trustwallet.com' },
  { id: 'phantom', name: 'Phantom', type: 'self_custody', countries: G, currency: 'USD', domain: 'phantom.com' },
  { id: 'exodus', name: 'Exodus', type: 'self_custody', countries: G, currency: 'USD', domain: 'exodus.com' },
  { id: 'coinbasewallet', name: 'Coinbase Wallet', type: 'self_custody', countries: G, currency: 'USD', domain: 'wallet.coinbase.com' },
];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Busca plataformas por nombre o alias (sin distinguir mayúsculas ni acentos). Ordena primero
 * las coincidencias al inicio del nombre y, a igualdad, las que operan en el país del usuario.
 */
export function searchPlatforms(query: string, country?: string, limit = 8): Platform[] {
  const q = normalize(query);
  const local = (p: Platform) => (country && p.countries.includes(country) ? 0 : p.countries.length === 0 ? 1 : 2);
  if (!q) {
    return [...PLATFORMS].sort((a, b) => local(a) - local(b)).slice(0, limit);
  }
  const scored: { p: Platform; score: number }[] = [];
  for (const p of PLATFORMS) {
    const names = [p.name, ...(p.aliases ?? [])].map(normalize);
    let score = Infinity;
    for (const n of names) {
      if (n === q) score = Math.min(score, 0);
      else if (n.startsWith(q)) score = Math.min(score, 1);
      else if (n.includes(q)) score = Math.min(score, 2);
    }
    if (score !== Infinity) scored.push({ p, score: score * 10 + local(p) });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.p).slice(0, limit);
}

export function platformById(id: string | undefined): Platform | undefined {
  return id ? PLATFORMS.find((p) => p.id === id) : undefined;
}

/** Ícono de la plataforma (favicon de su sitio). */
export function platformLogoUrl(platform: Pick<Platform, 'domain'>): string {
  return `https://www.google.com/s2/favicons?domain=${platform.domain}&sz=128`;
}
