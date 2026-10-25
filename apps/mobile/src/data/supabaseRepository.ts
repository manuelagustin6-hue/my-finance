import type { Asset, AssetSearchResult, FxPreferences, Transaction, Wallet } from '@my-finance/core';
import { getSupabase } from '@/lib/supabase';
import type { RemoteMarketClient } from './market';
import {
  PlanLimitError,
  type CustomAssetInput,
  type ExportBundle,
  type ImportJob,
  type LimitReason,
  type NewTransaction,
  type NewWallet,
  type Profile,
  type Repository,
} from './types';

type Row = Record<string, unknown>;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const optNum = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : Number(v));
const optStr = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v));

function toWallet(r: Row): Wallet {
  return {
    id: String(r.id),
    name: String(r.name),
    type: r.type as Wallet['type'],
    currency: String(r.currency),
    fees: { percent: num(r.fee_percent), fixed: num(r.fee_fixed), minimum: num(r.fee_minimum) },
  };
}

function toAsset(r: Row): Asset {
  return {
    id: String(r.id),
    symbol: String(r.symbol),
    name: String(r.name),
    type: r.type as Asset['type'],
    currency: String(r.currency),
    exchange: optStr(r.exchange),
    country: optStr(r.country),
    providerId: optStr(r.provider_id),
    manualPrice: optNum(r.manual_price),
  };
}

function toTransaction(r: Row): Transaction {
  return {
    id: String(r.id),
    walletId: String(r.wallet_id),
    assetId: String(r.asset_id),
    type: r.type as Transaction['type'],
    quantity: num(r.quantity),
    price: num(r.price),
    amount: optNum(r.amount),
    fee: num(r.fee),
    currency: String(r.currency),
    fxRate: optNum(r.fx_rate),
    fxBase: optStr(r.fx_base),
    date: String(r.executed_at),
    note: optStr(r.note),
    source: r.source as Transaction['source'],
    externalId: optStr(r.external_id),
  };
}

function fromTransaction(t: NewTransaction, importJobId?: string): Row {
  return {
    ...(t.id ? { id: t.id } : {}),
    wallet_id: t.walletId,
    asset_id: t.assetId,
    type: t.type,
    quantity: t.quantity,
    price: t.price,
    amount: t.amount ?? null,
    fee: t.fee,
    currency: t.currency,
    fx_rate: t.fxRate ?? null,
    fx_base: t.fxBase ?? null,
    executed_at: t.date.length === 10 ? `${t.date}T12:00:00Z` : t.date,
    note: t.note ?? null,
    source: t.source ?? 'manual',
    external_id: t.externalId ?? null,
    import_job_id: importJobId ?? null,
  };
}

function toImport(r: Row): ImportJob {
  return {
    id: String(r.id),
    walletId: String(r.wallet_id ?? ''),
    template: String(r.template),
    fileName: optStr(r.file_name),
    rowsTotal: num(r.rows_total),
    rowsImported: num(r.rows_imported),
    rowsSkipped: num(r.rows_skipped),
    createdAt: String(r.created_at),
  };
}

/** Convierte los errores de límite que lanzan los triggers de la base en PlanLimitError. */
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    const m = /PLAN_LIMIT_(WALLETS|ASSETS|IMPORTS)/.exec(result.error.message);
    if (m) throw new PlanLimitError(m[1]!.toLowerCase() as LimitReason);
    throw new Error(result.error.message);
  }
  return result.data;
}

/** Repositorio en la nube: los datos se guardan en Supabase y se protegen con RLS. */
export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;

  constructor(private readonly market: RemoteMarketClient) {}

  private get db() {
    return getSupabase();
  }

  private async userId(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Sesión no iniciada');
    return id;
  }

  async getProfile(): Promise<Profile> {
    const id = await this.userId();
    const row = check(await this.db.from('profiles').select('*').eq('id', id).single()) as Row;
    return {
      displayName: optStr(row.display_name),
      baseCurrency: String(row.base_currency),
      secondaryCurrency: String(row.secondary_currency ?? 'USD'),
      fxPreferences: (row.fx_preferences ?? {}) as FxPreferences,
      locale: String(row.locale),
      onboarded: Boolean(row.onboarded),
    };
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const id = await this.userId();
    const update: Row = {};
    if (patch.displayName !== undefined) update.display_name = patch.displayName;
    if (patch.baseCurrency !== undefined) update.base_currency = patch.baseCurrency;
    if (patch.secondaryCurrency !== undefined) update.secondary_currency = patch.secondaryCurrency;
    if (patch.fxPreferences !== undefined) update.fx_preferences = patch.fxPreferences;
    if (patch.locale !== undefined) update.locale = patch.locale;
    if (patch.onboarded !== undefined) update.onboarded = patch.onboarded;
    check(await this.db.from('profiles').update(update).eq('id', id));
    return this.getProfile();
  }

  async listWallets(): Promise<Wallet[]> {
    const rows = check(await this.db.from('wallets').select('*').eq('archived', false).order('created_at')) as Row[];
    return rows.map(toWallet);
  }

  async saveWallet(w: NewWallet): Promise<Wallet> {
    const row = {
      name: w.name,
      type: w.type,
      currency: w.currency,
      fee_percent: w.fees.percent,
      fee_fixed: w.fees.fixed,
      fee_minimum: w.fees.minimum,
    };
    const query = w.id
      ? this.db.from('wallets').update(row).eq('id', w.id).select('*').single()
      : this.db.from('wallets').insert(row).select('*').single();
    return toWallet(check(await query) as Row);
  }

  async deleteWallet(id: string): Promise<void> {
    check(await this.db.from('wallets').delete().eq('id', id));
  }

  async listAssets(): Promise<Asset[]> {
    const used = check(await this.db.from('transactions').select('asset_id')) as Row[];
    const ids = [...new Set(used.map((r) => String(r.asset_id)))];
    const userId = await this.userId();
    const filter = ids.length > 0 ? `id.in.(${ids.join(',')}),owner_id.eq.${userId}` : `owner_id.eq.${userId}`;
    const rows = check(await this.db.from('assets').select('*').or(filter)) as Row[];
    return rows.map(toAsset);
  }

  async ensureAsset(result: AssetSearchResult): Promise<Asset> {
    const row = await this.market.call<Row>({
      action: 'ensure_asset',
      asset: { providerId: result.providerId, type: result.type },
    });
    return toAsset(row);
  }

  async createCustomAsset(input: CustomAssetInput): Promise<Asset> {
    const userId = await this.userId();
    const row = check(
      await this.db
        .from('assets')
        .insert({
          owner_id: userId,
          symbol: input.symbol.toUpperCase(),
          name: input.name,
          type: input.type,
          currency: input.currency,
          exchange: input.exchange ?? null,
          country: input.country ?? null,
          manual_price: input.manualPrice ?? null,
        })
        .select('*')
        .single(),
    ) as Row;
    return toAsset(row);
  }

  async setManualPrice(assetId: string, price: number | undefined): Promise<void> {
    // Solo se puede editar el precio de activos personalizados (RLS lo garantiza).
    check(await this.db.from('assets').update({ manual_price: price ?? null }).eq('id', assetId));
  }

  async listTransactions(): Promise<Transaction[]> {
    const rows = check(await this.db.from('transactions').select('*').order('executed_at')) as Row[];
    return rows.map(toTransaction);
  }

  async saveTransactions(transactions: NewTransaction[], importJobId?: string): Promise<Transaction[]> {
    if (transactions.length === 0) return [];
    const rows = transactions.map((t) => fromTransaction(t, importJobId));
    const result = check(await this.db.from('transactions').upsert(rows, { defaultToNull: false }).select('*')) as Row[];
    return result.map(toTransaction);
  }

  async deleteTransaction(id: string): Promise<void> {
    check(await this.db.from('transactions').delete().eq('id', id));
  }

  async listImports(): Promise<ImportJob[]> {
    const rows = check(await this.db.from('import_jobs').select('*').order('created_at')) as Row[];
    return rows.map(toImport);
  }

  async createImport(job: Omit<ImportJob, 'id' | 'createdAt'>): Promise<ImportJob> {
    const row = check(
      await this.db
        .from('import_jobs')
        .insert({
          wallet_id: job.walletId,
          template: job.template,
          file_name: job.fileName ?? null,
          rows_total: job.rowsTotal,
          rows_imported: job.rowsImported,
          rows_skipped: job.rowsSkipped,
        })
        .select('*')
        .single(),
    ) as Row;
    return toImport(row);
  }

  async updateImport(id: string, patch: Partial<Pick<ImportJob, 'rowsImported' | 'rowsSkipped'>>): Promise<void> {
    const update: Row = {};
    if (patch.rowsImported !== undefined) update.rows_imported = patch.rowsImported;
    if (patch.rowsSkipped !== undefined) update.rows_skipped = patch.rowsSkipped;
    check(await this.db.from('import_jobs').update(update).eq('id', id));
  }

  async exportAll(): Promise<ExportBundle> {
    const [profile, wallets, assets, transactions] = await Promise.all([
      this.getProfile(),
      this.listWallets(),
      this.listAssets(),
      this.listTransactions(),
    ]);
    return { exportedAt: new Date().toISOString(), profile, wallets, assets, transactions };
  }

  async deleteAccount(): Promise<void> {
    check(await this.db.rpc('delete_my_account'));
    await this.db.auth.signOut();
  }
}
