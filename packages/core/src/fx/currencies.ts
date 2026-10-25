import type { CurrencyCode } from '../types.ts';

export interface CurrencyInfo {
  code: CurrencyCode;
  /** País principal (ISO 3166-1 alfa-2) o región. */
  country?: string;
  names: { es: string; en: string; pt: string };
}

/** Monedas más usadas, con nombre traducido. Se muestran primero en los selectores. */
export const MAIN_CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'USD', country: 'US', names: { es: 'Dólar estadounidense', en: 'US dollar', pt: 'Dólar americano' } },
  { code: 'EUR', country: 'EU', names: { es: 'Euro', en: 'Euro', pt: 'Euro' } },
  { code: 'ARS', country: 'AR', names: { es: 'Peso argentino', en: 'Argentine peso', pt: 'Peso argentino' } },
  { code: 'BRL', country: 'BR', names: { es: 'Real brasileño', en: 'Brazilian real', pt: 'Real' } },
  { code: 'MXN', country: 'MX', names: { es: 'Peso mexicano', en: 'Mexican peso', pt: 'Peso mexicano' } },
  { code: 'COP', country: 'CO', names: { es: 'Peso colombiano', en: 'Colombian peso', pt: 'Peso colombiano' } },
  { code: 'CLP', country: 'CL', names: { es: 'Peso chileno', en: 'Chilean peso', pt: 'Peso chileno' } },
  { code: 'UYU', country: 'UY', names: { es: 'Peso uruguayo', en: 'Uruguayan peso', pt: 'Peso uruguaio' } },
  { code: 'PEN', country: 'PE', names: { es: 'Sol peruano', en: 'Peruvian sol', pt: 'Sol peruano' } },
  { code: 'PYG', country: 'PY', names: { es: 'Guaraní paraguayo', en: 'Paraguayan guaraní', pt: 'Guarani paraguaio' } },
  { code: 'BOB', country: 'BO', names: { es: 'Boliviano', en: 'Bolivian boliviano', pt: 'Boliviano' } },
  { code: 'VES', country: 'VE', names: { es: 'Bolívar venezolano', en: 'Venezuelan bolívar', pt: 'Bolívar venezuelano' } },
  { code: 'CRC', country: 'CR', names: { es: 'Colón costarricense', en: 'Costa Rican colón', pt: 'Colón costarriquenho' } },
  { code: 'GTQ', country: 'GT', names: { es: 'Quetzal guatemalteco', en: 'Guatemalan quetzal', pt: 'Quetzal guatemalteco' } },
  { code: 'HNL', country: 'HN', names: { es: 'Lempira hondureño', en: 'Honduran lempira', pt: 'Lempira hondurenha' } },
  { code: 'NIO', country: 'NI', names: { es: 'Córdoba nicaragüense', en: 'Nicaraguan córdoba', pt: 'Córdoba nicaraguense' } },
  { code: 'DOP', country: 'DO', names: { es: 'Peso dominicano', en: 'Dominican peso', pt: 'Peso dominicano' } },
  { code: 'CUP', country: 'CU', names: { es: 'Peso cubano', en: 'Cuban peso', pt: 'Peso cubano' } },
  { code: 'PAB', country: 'PA', names: { es: 'Balboa panameño', en: 'Panamanian balboa', pt: 'Balboa panamenho' } },
  { code: 'GBP', country: 'GB', names: { es: 'Libra esterlina', en: 'British pound', pt: 'Libra esterlina' } },
  { code: 'CHF', country: 'CH', names: { es: 'Franco suizo', en: 'Swiss franc', pt: 'Franco suíço' } },
  { code: 'JPY', country: 'JP', names: { es: 'Yen japonés', en: 'Japanese yen', pt: 'Iene japonês' } },
  { code: 'CNY', country: 'CN', names: { es: 'Yuan chino', en: 'Chinese yuan', pt: 'Yuan chinês' } },
  { code: 'CAD', country: 'CA', names: { es: 'Dólar canadiense', en: 'Canadian dollar', pt: 'Dólar canadense' } },
  { code: 'AUD', country: 'AU', names: { es: 'Dólar australiano', en: 'Australian dollar', pt: 'Dólar australiano' } },
  { code: 'NZD', country: 'NZ', names: { es: 'Dólar neozelandés', en: 'New Zealand dollar', pt: 'Dólar neozelandês' } },
  { code: 'INR', country: 'IN', names: { es: 'Rupia india', en: 'Indian rupee', pt: 'Rupia indiana' } },
  { code: 'KRW', country: 'KR', names: { es: 'Won surcoreano', en: 'South Korean won', pt: 'Won sul-coreano' } },
  { code: 'HKD', country: 'HK', names: { es: 'Dólar de Hong Kong', en: 'Hong Kong dollar', pt: 'Dólar de Hong Kong' } },
  { code: 'SGD', country: 'SG', names: { es: 'Dólar de Singapur', en: 'Singapore dollar', pt: 'Dólar de Singapura' } },
  { code: 'SEK', country: 'SE', names: { es: 'Corona sueca', en: 'Swedish krona', pt: 'Coroa sueca' } },
  { code: 'NOK', country: 'NO', names: { es: 'Corona noruega', en: 'Norwegian krone', pt: 'Coroa norueguesa' } },
  { code: 'DKK', country: 'DK', names: { es: 'Corona danesa', en: 'Danish krone', pt: 'Coroa dinamarquesa' } },
  { code: 'PLN', country: 'PL', names: { es: 'Esloti polaco', en: 'Polish złoty', pt: 'Zloty polonês' } },
  { code: 'TRY', country: 'TR', names: { es: 'Lira turca', en: 'Turkish lira', pt: 'Lira turca' } },
  { code: 'ZAR', country: 'ZA', names: { es: 'Rand sudafricano', en: 'South African rand', pt: 'Rand sul-africano' } },
  { code: 'ILS', country: 'IL', names: { es: 'Nuevo séquel israelí', en: 'Israeli new shekel', pt: 'Novo shekel israelense' } },
  { code: 'AED', country: 'AE', names: { es: 'Dírham de los EAU', en: 'UAE dirham', pt: 'Dirham dos EAU' } },
];

/**
 * Resto de los códigos ISO 4217 vigentes. Su nombre se obtiene de Intl.DisplayNames
 * cuando el dispositivo lo soporta.
 */
export const OTHER_CURRENCY_CODES: readonly CurrencyCode[] = [
  'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND',
  'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CDF', 'CVE', 'CZK', 'DJF', 'DZD', 'EGP', 'ERN', 'ETB', 'FJD', 'FKP',
  'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GYD', 'HTG', 'HUF', 'IDR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'KES',
  'KGS', 'KHR', 'KMF', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA',
  'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MYR', 'MZN', 'NAD', 'NGN', 'NPR', 'OMR', 'PGK',
  'PHP', 'PKR', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SHP', 'SLE', 'SOS', 'SRD',
  'SSP', 'STN', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'UZS',
  'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XOF', 'XPF', 'YER', 'ZMW',
];

export const ALL_CURRENCY_CODES: readonly CurrencyCode[] = [
  ...MAIN_CURRENCIES.map((c) => c.code),
  ...OTHER_CURRENCY_CODES,
];

/**
 * Activos que cotizan 1:1 contra el dólar y se tratan como USD al convertir
 * (las cotizaciones de exchanges suelen venir en USDT o USDC).
 */
export const USD_PEGGED: Readonly<Record<CurrencyCode, number>> = {
  USD: 1,
  USDT: 1,
  USDC: 1,
  DAI: 1,
  FDUSD: 1,
  BUSD: 1,
  TUSD: 1,
};

export function currencyName(code: CurrencyCode, lang: 'es' | 'en' | 'pt' = 'es'): string {
  const main = MAIN_CURRENCIES.find((c) => c.code === code);
  if (main) return main.names[lang];
  try {
    const name = new Intl.DisplayNames([lang], { type: 'currency' }).of(code);
    if (name && name !== code) return name;
  } catch {
    // Intl.DisplayNames no está disponible en todos los motores.
  }
  return code;
}
