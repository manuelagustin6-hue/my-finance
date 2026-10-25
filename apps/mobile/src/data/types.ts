import type { Asset, AssetSearchResult, PlanId, Transaction, Wallet } from '@my-finance/core';

export interface Profile {
  displayName?: string;
  baseCurrency: string;
  locale: string;
  /** true cuando el usuario ya eligió su moneda base. */
  onboarded: boolean;
}

export interface ImportJob {
  id: string;
  walletId: string;
  template: string;
  fileName?: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  createdAt: string;
}

export type NewWallet = Omit<Wallet, 'id'> & { id?: string };
export type NewTransaction = Omit<Transaction, 'id'> & { id?: string };
export type CustomAssetInput = Pick<Asset, 'symbol' | 'name' | 'type' | 'currency'> &
  Partial<Pick<Asset, 'exchange' | 'country' | 'manualPrice'>>;

export type LimitReason = 'wallets' | 'assets' | 'imports';

/** Error lanzado cuando una acción supera los límites del plan Gratis. */
export class PlanLimitError extends Error {
  constructor(readonly reason: LimitReason) {
    super(`PLAN_LIMIT_${reason.toUpperCase()}`);
    this.name = 'PlanLimitError';
  }
}

export function isPlanLimitError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError;
}

export interface ExportBundle {
  exportedAt: string;
  profile: Profile;
  wallets: Wallet[];
  assets: Asset[];
  transactions: Transaction[];
}

/** Acceso a los datos del usuario. Hay una implementación local (modo demo) y otra con Supabase. */
export interface Repository {
  readonly kind: 'local' | 'supabase';
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;

  listWallets(): Promise<Wallet[]>;
  saveWallet(wallet: NewWallet): Promise<Wallet>;
  deleteWallet(id: string): Promise<void>;

  /** Activos usados por el usuario y activos personalizados. */
  listAssets(): Promise<Asset[]>;
  /** Devuelve el activo del catálogo correspondiente al resultado de búsqueda, creándolo si hace falta. */
  ensureAsset(result: AssetSearchResult): Promise<Asset>;
  createCustomAsset(input: CustomAssetInput): Promise<Asset>;
  setManualPrice(assetId: string, price: number | undefined): Promise<void>;

  listTransactions(): Promise<Transaction[]>;
  /** Guarda una o varias operaciones. `importJobId` vincula operaciones importadas. */
  saveTransactions(transactions: NewTransaction[], importJobId?: string): Promise<Transaction[]>;
  deleteTransaction(id: string): Promise<void>;

  listImports(): Promise<ImportJob[]>;
  createImport(job: Omit<ImportJob, 'id' | 'createdAt'>): Promise<ImportJob>;
  updateImport(id: string, patch: Partial<Pick<ImportJob, 'rowsImported' | 'rowsSkipped'>>): Promise<void>;

  exportAll(): Promise<ExportBundle>;
  deleteAccount(): Promise<void>;
}

export type PlanGetter = () => PlanId;
