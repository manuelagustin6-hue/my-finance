import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  legacyProviderId,
  canAddAsset,
  canAddWallet,
  canImport,
  type Asset,
  type AssetSearchResult,
  type Transaction,
  type Wallet,
} from '@my-finance/core';
import { randomId } from '@/lib/id';
import {
  PlanLimitError,
  type CustomAssetInput,
  type ExportBundle,
  type ImportJob,
  type NewTransaction,
  type NewWallet,
  type PlanGetter,
  type Profile,
  type Repository,
} from './types';

const STORAGE_KEY = 'my-finance:db:v1';

interface LocalDb {
  profile: Profile;
  wallets: Wallet[];
  assets: Asset[];
  transactions: Transaction[];
  imports: ImportJob[];
}

export function defaultProfile(): Profile {
  return { baseCurrency: 'USD', secondaryCurrency: 'USD', fxPreferences: {}, locale: 'es', onboarded: false };
}

function emptyDb(): LocalDb {
  return { profile: defaultProfile(), wallets: [], assets: [], transactions: [], imports: [] };
}

/** Repositorio local (modo demo): guarda todo en el dispositivo y aplica los límites del plan. */
export class LocalRepository implements Repository {
  readonly kind = 'local' as const;
  private cache: LocalDb | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly plan: PlanGetter) {}

  private async load(): Promise<LocalDb> {
    if (this.cache) return this.cache;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.cache = raw ? { ...emptyDb(), ...(JSON.parse(raw) as Partial<LocalDb>) } : emptyDb();
    } catch {
      this.cache = emptyDb();
    }
    // Los activos creados con los precios simulados pasan a los proveedores reales (se guarda en la próxima escritura).
    for (const asset of this.cache.assets) {
      const id = legacyProviderId(asset);
      if (id) asset.providerId = id;
    }
    return this.cache;
  }

  /** Serializa las escrituras para evitar condiciones de carrera. */
  private mutate<T>(fn: (db: LocalDb) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.load();
      const result = fn(db);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async getProfile() {
    // Completa campos agregados en versiones posteriores.
    return { ...defaultProfile(), ...(await this.load()).profile };
  }

  updateProfile(patch: Partial<Profile>) {
    return this.mutate((db) => (db.profile = { ...db.profile, ...patch }));
  }

  async listWallets() {
    return [...(await this.load()).wallets];
  }

  saveWallet(input: NewWallet) {
    return this.mutate((db) => {
      if (input.id) {
        const index = db.wallets.findIndex((w) => w.id === input.id);
        if (index >= 0) {
          const updated = { ...db.wallets[index]!, ...input, id: input.id };
          db.wallets[index] = updated;
          return updated;
        }
      }
      const check = canAddWallet(this.plan(), db.wallets.length);
      if (!check.allowed) throw new PlanLimitError('wallets');
      const wallet: Wallet = { ...input, id: input.id ?? randomId() };
      db.wallets.push(wallet);
      return wallet;
    });
  }

  deleteWallet(id: string) {
    return this.mutate((db) => {
      db.wallets = db.wallets.filter((w) => w.id !== id);
      db.transactions = db.transactions.filter((t) => t.walletId !== id);
    });
  }

  async listAssets() {
    return [...(await this.load()).assets];
  }

  ensureAsset(result: AssetSearchResult) {
    return this.mutate((db) => {
      const existing = db.assets.find((a) => a.providerId === result.providerId && a.type === result.type);
      if (existing) return existing;
      const asset: Asset = {
        id: randomId(),
        symbol: result.symbol,
        name: result.name,
        type: result.type,
        currency: result.currency,
        exchange: result.exchange,
        country: result.country,
        providerId: result.providerId,
        logoUrl: result.logoUrl,
      };
      db.assets.push(asset);
      return asset;
    });
  }

  createCustomAsset(input: CustomAssetInput) {
    return this.mutate((db) => {
      const asset: Asset = { ...input, id: randomId(), symbol: input.symbol.toUpperCase() };
      db.assets.push(asset);
      return asset;
    });
  }

  setManualPrice(assetId: string, price: number | undefined) {
    return this.mutate((db) => {
      const asset = db.assets.find((a) => a.id === assetId);
      if (asset) asset.manualPrice = price;
    });
  }

  async listTransactions() {
    return [...(await this.load()).transactions];
  }

  saveTransactions(inputs: NewTransaction[]) {
    return this.mutate((db) => {
      const held = new Set(db.transactions.map((t) => t.assetId));
      const saved: Transaction[] = [];
      for (const input of inputs) {
        if (input.id) {
          const index = db.transactions.findIndex((t) => t.id === input.id);
          if (index >= 0) {
            db.transactions[index] = { ...input, id: input.id };
            saved.push(db.transactions[index]!);
            continue;
          }
        }
        if (!canAddAsset(this.plan(), held, input.assetId).allowed) throw new PlanLimitError('assets');
        held.add(input.assetId);
        const tx: Transaction = { ...input, id: input.id ?? randomId() };
        db.transactions.push(tx);
        saved.push(tx);
      }
      return saved;
    });
  }

  deleteTransaction(id: string) {
    return this.mutate((db) => {
      db.transactions = db.transactions.filter((t) => t.id !== id);
    });
  }

  async listImports() {
    return [...(await this.load()).imports];
  }

  createImport(job: Omit<ImportJob, 'id' | 'createdAt'>) {
    return this.mutate((db) => {
      if (!canImport(this.plan(), db.imports.length).allowed) throw new PlanLimitError('imports');
      const created: ImportJob = { ...job, id: randomId(), createdAt: new Date().toISOString() };
      db.imports.push(created);
      return created;
    });
  }

  updateImport(id: string, patch: Partial<Pick<ImportJob, 'rowsImported' | 'rowsSkipped'>>) {
    return this.mutate((db) => {
      const job = db.imports.find((j) => j.id === id);
      if (job) Object.assign(job, patch);
    });
  }

  async exportAll(): Promise<ExportBundle> {
    const db = await this.load();
    return {
      exportedAt: new Date().toISOString(),
      profile: db.profile,
      wallets: db.wallets,
      assets: db.assets,
      transactions: db.transactions,
    };
  }

  async deleteAccount() {
    await this.mutate((db) => Object.assign(db, emptyDb()));
  }
}
