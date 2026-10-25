import { isOpening, OPENING_NOTE, type Asset, type Transaction, type Wallet } from '@my-finance/core';
import { repository, type NewTransaction } from '@/data';

export interface OpeningEntry {
  asset: Asset;
  quantity: number;
  /** Costo por unidad en la moneda del activo. */
  unitCost: number;
}

/** Operaciones del saldo inicial actual de la billetera. */
export function openingTransactions(transactions: readonly Transaction[], walletId: string): Transaction[] {
  return transactions.filter((tx) => tx.walletId === walletId && isOpening(tx));
}

/**
 * Reemplaza el saldo inicial de la billetera: borra el anterior, guarda las tenencias como
 * depósitos de origen 'opening' y fija la fecha de inicio.
 */
export async function saveOpeningBalance(
  wallet: Wallet,
  date: string,
  entries: readonly OpeningEntry[],
  existing: readonly Transaction[],
): Promise<void> {
  for (const tx of existing) await repository.deleteTransaction(tx.id);
  const transactions: NewTransaction[] = entries.map((e) => ({
    walletId: wallet.id,
    assetId: e.asset.id,
    type: 'deposit',
    quantity: e.quantity,
    price: e.unitCost,
    fee: 0,
    currency: e.asset.currency,
    date,
    note: OPENING_NOTE,
    source: 'opening',
  }));
  await repository.saveTransactions(transactions);
  await repository.saveWallet({ ...wallet, openingDate: date });
}
