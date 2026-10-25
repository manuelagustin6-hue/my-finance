/** Código de moneda ISO 4217 (USD, ARS, EUR…) o de un activo usado como moneda de cotización (USDT, BTC). */
export type CurrencyCode = string;

export type AssetType = 'crypto' | 'stock' | 'etf' | 'bond' | 'fund' | 'cash' | 'other';

export const ASSET_TYPES: readonly AssetType[] = ['crypto', 'stock', 'etf', 'bond', 'fund', 'cash', 'other'];

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
  /** Moneda en la que cotiza el activo. */
  currency: CurrencyCode;
  exchange?: string;
  /** País ISO 3166-1 alfa-2 del emisor o mercado. */
  country?: string;
  /** Identificador del activo en el proveedor de datos de mercado. */
  providerId?: string;
  /** Precio cargado a mano (bonos u otros activos sin cotización automática). */
  manualPrice?: number;
  /** Logo informado por el proveedor de datos. */
  logoUrl?: string;
}

export type WalletType = 'exchange' | 'broker' | 'bank' | 'self_custody' | 'other';

export const WALLET_TYPES: readonly WalletType[] = ['exchange', 'broker', 'bank', 'self_custody', 'other'];

/**
 * Esquema de comisiones de una billetera o broker.
 * comisión = max(mínimo, monto × porcentaje / 100 + fijo)
 */
export interface FeeSchedule {
  /** Porcentaje sobre el monto operado, en puntos porcentuales (0.5 = 0,5 %). */
  percent: number;
  /** Monto fijo por operación, en la moneda de la operación. */
  fixed: number;
  /** Comisión mínima por operación, en la moneda de la operación. */
  minimum: number;
}

export interface Wallet {
  id: string;
  name: string;
  /** Plataforma del catálogo (Binance, IOL…); vacío si la creó el usuario a mano. */
  platformId?: string;
  type: WalletType;
  /** Moneda principal de la billetera. */
  currency: CurrencyCode;
  fees: FeeSchedule;
  /**
   * Fecha del saldo inicial (YYYY-MM-DD). Las tenencias cargadas como saldo inicial reflejan
   * el portafolio al cierre de ese día; la actividad anterior o de ese mismo día se ignora.
   */
  openingDate?: string;
}

export type TransactionType =
  | 'buy'
  | 'sell'
  | 'deposit'
  | 'withdraw'
  | 'transfer_in'
  | 'transfer_out'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'split';

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  'buy',
  'sell',
  'deposit',
  'withdraw',
  'transfer_in',
  'transfer_out',
  'dividend',
  'interest',
  'fee',
  'split',
];

/** Tipos de operación que mueven unidades del activo y usan cantidad × precio. */
export const QUANTITY_TYPES: readonly TransactionType[] = [
  'buy',
  'sell',
  'deposit',
  'withdraw',
  'transfer_in',
  'transfer_out',
];

/** Tipos de operación que representan un monto (cobro o pago) sin mover unidades. */
export const AMOUNT_TYPES: readonly TransactionType[] = ['dividend', 'interest', 'fee'];

export interface Transaction {
  id: string;
  walletId: string;
  assetId: string;
  type: TransactionType;
  /**
   * Unidades del activo. En `split` es la relación del split (2 = 2 por 1).
   * En dividendos, intereses y comisiones sueltas no se usa.
   */
  quantity: number;
  /** Precio unitario en `currency`. En depósitos/transferencias es el costo unitario de origen. */
  price: number;
  /** Monto total para dividendos, intereses y comisiones sueltas, en `currency`. */
  amount?: number;
  /** Comisión pagada en la operación, en `currency`. */
  fee: number;
  /** Moneda del precio, del monto y de la comisión. */
  currency: CurrencyCode;
  /** Unidades de `fxBase` por 1 unidad de `currency` a la fecha de la operación. */
  fxRate?: number;
  /**
   * Moneda base contra la que se registró `fxRate`. Si difiere de la moneda base actual,
   * `fxRate` se ignora y se usa el tipo de cambio del proveedor.
   */
  fxBase?: CurrencyCode;
  /** Fecha ISO 8601 (YYYY-MM-DD o fecha y hora). */
  date: string;
  note?: string;
  /** 'opening' = parte del saldo inicial de la billetera. */
  source?: 'manual' | 'csv' | 'api' | 'opening';
  /** Identificador externo (p. ej. id de la operación en el exchange) para evitar duplicados. */
  externalId?: string;
}

export interface Quote {
  assetId: string;
  price: number;
  currency: CurrencyCode;
  previousClose?: number;
  /**
   * Cantidad de unidades a la que corresponde el precio (por defecto 1). Los bonos suelen
   * cotizar cada 100 nominales: `price` 65 con `unit` 100 = 0,65 por nominal.
   */
  unit?: number;
  /** Fecha ISO de la cotización. */
  asOf: string;
}

export interface PricePoint {
  date: string;
  close: number;
  /** Unidades a las que corresponde el precio (ver Quote.unit). */
  unit?: number;
}

/** Devuelve cuántas unidades de `to` vale 1 unidad de `from`, o undefined si no se conoce. */
export type FxLookup = (from: CurrencyCode, to: CurrencyCode, date?: string) => number | undefined;
