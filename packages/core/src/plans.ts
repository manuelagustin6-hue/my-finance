/** Planes de la app y sus límites. Es la única fuente de verdad: la usan la app y el servidor. */
export type PlanId = 'free' | 'pro';

export type Feature =
  | 'portfolio_analytics'
  | 'fundamentals'
  | 'full_price_history'
  | 'unlimited_imports'
  | 'export_data';

export interface PlanLimits {
  maxWallets: number;
  maxAssets: number;
  maxImports: number;
  /** Días máximos de historia de precios consultables. */
  maxHistoryDays: number;
  features: readonly Feature[];
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    maxWallets: 2,
    maxAssets: 15,
    maxImports: 1,
    maxHistoryDays: 365,
    features: [],
  },
  pro: {
    maxWallets: Infinity,
    maxAssets: Infinity,
    maxImports: Infinity,
    maxHistoryDays: Infinity,
    features: ['portfolio_analytics', 'fundamentals', 'full_price_history', 'unlimited_imports', 'export_data'],
  },
};

/** Identificador del entitlement en RevenueCat que habilita el plan Pro. */
export const PRO_ENTITLEMENT = 'pro';

export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

export type LimitCheck = { allowed: true } | { allowed: false; limit: number; reason: 'wallets' | 'assets' | 'imports' };

export function canAddWallet(plan: PlanId, currentWallets: number): LimitCheck {
  const limit = PLANS[plan].maxWallets;
  return currentWallets < limit ? { allowed: true } : { allowed: false, limit, reason: 'wallets' };
}

/**
 * `currentAssetIds` son los activos ya presentes en la cartera; agregar operaciones sobre
 * un activo que ya existe nunca se bloquea.
 */
export function canAddAsset(plan: PlanId, currentAssetIds: ReadonlySet<string>, assetId: string): LimitCheck {
  if (currentAssetIds.has(assetId)) return { allowed: true };
  const limit = PLANS[plan].maxAssets;
  return currentAssetIds.size < limit ? { allowed: true } : { allowed: false, limit, reason: 'assets' };
}

export function canImport(plan: PlanId, importsDone: number): LimitCheck {
  const limit = PLANS[plan].maxImports;
  return importsDone < limit ? { allowed: true } : { allowed: false, limit, reason: 'imports' };
}
