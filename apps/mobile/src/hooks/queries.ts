import {
  computePositions,
  summarizePortfolio,
  valuePosition,
  type Asset,
  type AssetRef,
  type FxLookup,
  type HistoryRange,
  type Quote,
  type Transaction,
  type ValuedPosition,
} from '@my-finance/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { market, repository, type NewTransaction, type NewWallet, type Profile } from '@/data';
import { usePlan } from '@/state/app';

export const keys = {
  profile: ['profile'] as const,
  wallets: ['wallets'] as const,
  assets: ['assets'] as const,
  transactions: ['transactions'] as const,
  imports: ['imports'] as const,
};

const QUOTE_REFRESH_MS = 60_000;

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: () => repository.getProfile() });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Profile>) => repository.updateProfile(patch),
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  });
}

export function useWallets() {
  return useQuery({ queryKey: keys.wallets, queryFn: () => repository.listWallets() });
}

export function useAssets() {
  return useQuery({ queryKey: keys.assets, queryFn: () => repository.listAssets() });
}

export function useTransactions() {
  return useQuery({ queryKey: keys.transactions, queryFn: () => repository.listTransactions() });
}

export function useImports() {
  return useQuery({ queryKey: keys.imports, queryFn: () => repository.listImports() });
}

/** Invalida los datos del usuario tras una escritura. */
export function useInvalidateUserData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.wallets }),
      qc.invalidateQueries({ queryKey: keys.assets }),
      qc.invalidateQueries({ queryKey: keys.transactions }),
      qc.invalidateQueries({ queryKey: keys.imports }),
    ]);
}

export function useSaveWallet() {
  const invalidate = useInvalidateUserData();
  return useMutation({ mutationFn: (w: NewWallet) => repository.saveWallet(w), onSuccess: invalidate });
}

export function useDeleteWallet() {
  const invalidate = useInvalidateUserData();
  return useMutation({ mutationFn: (id: string) => repository.deleteWallet(id), onSuccess: invalidate });
}

export function useSaveTransactions() {
  const invalidate = useInvalidateUserData();
  return useMutation({
    mutationFn: ({ transactions, importJobId }: { transactions: NewTransaction[]; importJobId?: string }) =>
      repository.saveTransactions(transactions, importJobId),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateUserData();
  return useMutation({ mutationFn: (id: string) => repository.deleteTransaction(id), onSuccess: invalidate });
}

export function refOf(asset: Pick<Asset, 'providerId' | 'type'>): AssetRef | undefined {
  return asset.providerId ? { providerId: asset.providerId, type: asset.type } : undefined;
}

export function useQuotes(refs: AssetRef[]) {
  const ids = refs.map((r) => `${r.type}:${r.providerId}`).sort();
  return useQuery({
    queryKey: ['quotes', ids],
    queryFn: () => market.quotes(refs),
    enabled: refs.length > 0,
    refetchInterval: QUOTE_REFRESH_MS,
    staleTime: QUOTE_REFRESH_MS / 2,
  });
}

export function useFxRates(base: string | undefined, currencies: string[]) {
  const list = [...new Set(currencies)].sort();
  return useQuery({
    queryKey: ['fx', base, list],
    queryFn: () => market.fx(base!, list),
    enabled: !!base && list.length > 0,
    staleTime: 10 * 60_000,
  });
}

/** Construye la función de conversión a partir de "unidades de base por 1 unidad de moneda". */
export function fxLookupFrom(base: string, rates: Record<string, number> | undefined): FxLookup {
  return (from, to) => {
    if (from === to) return 1;
    const fromRate = from === base ? 1 : rates?.[from];
    const toRate = to === base ? 1 : rates?.[to];
    if (fromRate === undefined || toRate === undefined) return undefined;
    return fromRate / toRate;
  };
}

export function useHistory(ref: AssetRef | undefined, range: HistoryRange) {
  const plan = usePlan();
  return useQuery({
    queryKey: ['history', ref?.type, ref?.providerId, range, plan],
    queryFn: () => market.history(ref!, range),
    enabled: !!ref,
    staleTime: 5 * 60_000,
    retry: (count, error) => error.name !== 'ProRequiredError' && count < 2,
  });
}

export function useFundamentals(ref: AssetRef | undefined, enabled: boolean) {
  const plan = usePlan();
  return useQuery({
    queryKey: ['fundamentals', ref?.providerId, plan],
    queryFn: () => market.fundamentals(ref!),
    enabled: !!ref && enabled,
    staleTime: 60 * 60_000,
    retry: (count, error) => error.name !== 'ProRequiredError' && count < 2,
  });
}

export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q.toLowerCase()],
    queryFn: () => market.search(q),
    enabled: q.length >= 1,
    staleTime: 5 * 60_000,
  });
}

export interface WalletTotals {
  walletId: string;
  value: number;
  cost: number;
  pnl: number;
  assetCount: number;
}

/**
 * Cartera consolidada valuada en moneda base. Con `walletId` se limita a una billetera.
 * Reúne operaciones, activos, cotizaciones y tipos de cambio y usa el motor de @my-finance/core.
 */
export function usePortfolio(walletId?: string) {
  const profile = useProfile();
  const wallets = useWallets();
  const assets = useAssets();
  const transactions = useTransactions();
  const base = profile.data?.baseCurrency;

  const assetsById = useMemo(() => new Map((assets.data ?? []).map((a) => [a.id, a])), [assets.data]);

  const refs = useMemo(() => {
    const seen = new Map<string, AssetRef>();
    for (const a of assets.data ?? []) {
      const ref = refOf(a);
      if (ref) seen.set(`${ref.type}:${ref.providerId}`, ref);
    }
    return [...seen.values()];
  }, [assets.data]);

  const quotes = useQuotes(refs);

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions.data ?? []) set.add(t.currency);
    for (const a of assets.data ?? []) set.add(a.currency);
    for (const q of quotes.data ?? []) set.add(q.currency);
    for (const w of wallets.data ?? []) set.add(w.currency);
    if (base) set.delete(base);
    return [...set];
  }, [transactions.data, assets.data, quotes.data, wallets.data, base]);

  const fx = useFxRates(base, currencies);

  const result = useMemo(() => {
    if (!base || !transactions.data || !assets.data) return undefined;
    const fxLookup = fxLookupFrom(base, fx.data);

    const quoteMap = new Map<string, Quote>();
    const byProvider = new Map((quotes.data ?? []).map((q) => [q.assetId, q]));
    for (const a of assets.data) {
      const q = a.providerId ? byProvider.get(a.providerId) : undefined;
      if (q) quoteMap.set(a.id, { ...q, assetId: a.id });
    }

    const txs: Transaction[] = walletId ? transactions.data.filter((t) => t.walletId === walletId) : transactions.data;
    const computed = computePositions(txs, { baseCurrency: base, fx: fxLookup });
    const ctx = { baseCurrency: base, quotes: quoteMap, fx: fxLookup, assets: assetsById };
    const summary = summarizePortfolio(computed.consolidated, ctx);

    const walletTotals = new Map<string, WalletTotals>();
    const byWalletValued: ValuedPosition[] = computed.byWallet.map((p) => valuePosition(p, ctx));
    for (const p of byWalletValued) {
      const id = p.walletId!;
      const acc = walletTotals.get(id) ?? { walletId: id, value: 0, cost: 0, pnl: 0, assetCount: 0 };
      if (p.quantity > 0) {
        acc.value += p.marketValueBase;
        acc.cost += p.costBasisBase;
        acc.assetCount += 1;
      }
      acc.pnl += p.totalPnlBase;
      walletTotals.set(id, acc);
    }

    return {
      summary,
      warnings: computed.warnings,
      walletTotals,
      byWallet: byWalletValued,
      quoteMap,
      fxLookup,
    };
  }, [base, transactions.data, assets.data, quotes.data, fx.data, walletId, assetsById]);

  const isLoading = profile.isLoading || wallets.isLoading || assets.isLoading || transactions.isLoading;
  const isError = profile.isError || wallets.isError || assets.isError || transactions.isError;

  return {
    ...result,
    base,
    profile: profile.data,
    wallets: wallets.data ?? [],
    assets: assets.data ?? [],
    assetsById,
    transactions: transactions.data ?? [],
    isLoading,
    isError,
    isFetchingQuotes: quotes.isFetching,
    refetch: () => Promise.all([quotes.refetch(), fx.refetch(), transactions.refetch(), assets.refetch()]),
  };
}
