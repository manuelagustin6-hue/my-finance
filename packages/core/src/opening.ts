import type { Transaction, Wallet } from './types.ts';

/** Nota con la que se registran las tenencias del saldo inicial. */
export const OPENING_NOTE = 'Saldo inicial';

/** true si la operación forma parte del saldo inicial. */
export function isOpening(tx: Pick<Transaction, 'source'>): boolean {
  return tx.source === 'opening';
}

/**
 * Operaciones que cuentan para los cálculos: en billeteras con saldo inicial se descarta la
 * actividad hasta esa fecha inclusive (ya está reflejada en el saldo), salvo el saldo mismo.
 */
export function effectiveTransactions<T extends Pick<Transaction, 'walletId' | 'date' | 'source'>>(
  transactions: readonly T[],
  wallets: readonly Pick<Wallet, 'id' | 'openingDate'>[],
): T[] {
  const cutoff = new Map(wallets.filter((w) => w.openingDate).map((w) => [w.id, w.openingDate!]));
  if (cutoff.size === 0) return [...transactions];
  return transactions.filter((tx) => {
    const date = cutoff.get(tx.walletId);
    return !date || isOpening(tx) || tx.date.slice(0, 10) > date;
  });
}

/** true si una fila importada es anterior o igual a la fecha del saldo inicial. */
export function isBeforeOpening(date: string, openingDate: string | undefined): boolean {
  return !!openingDate && date.slice(0, 10) <= openingDate;
}
