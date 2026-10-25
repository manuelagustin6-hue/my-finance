import { PRO_ENTITLEMENT } from '@my-finance/core';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { isBillingConfigured, REVENUECAT_API_KEY } from '@/lib/config';

export interface PlanOption {
  id: string;
  kind: 'monthly' | 'annual' | 'other';
  title: string;
  priceString: string;
  /** Precio por mes para comparar planes (solo anual). */
  monthlyEquivalent?: string;
  freeTrial?: string;
  /** Paquete real de RevenueCat (ausente en modo demo). */
  pkg?: PurchasesPackage;
}

export interface BillingState {
  isPro: boolean;
  expiresAt?: string;
  willRenew?: boolean;
}

/** Precios de referencia mostrados en modo demo. Los reales se configuran en App Store Connect y Google Play. */
const DEMO_OPTIONS: PlanOption[] = [
  { id: 'demo_monthly', kind: 'monthly', title: 'Pro mensual', priceString: 'USD 4,99' },
  { id: 'demo_annual', kind: 'annual', title: 'Pro anual', priceString: 'USD 39,99', monthlyEquivalent: 'USD 3,33', freeTrial: '7' },
];

let configured = false;

function stateFrom(info: CustomerInfo): BillingState {
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT];
  return {
    isPro: !!entitlement,
    expiresAt: entitlement?.expirationDate ?? undefined,
    willRenew: entitlement?.willRenew,
  };
}

/**
 * Inicializa RevenueCat. El App User ID es el id de Supabase para que el webhook pueda
 * actualizar el plan del usuario correcto. Devuelve false si los pagos no están configurados.
 */
export async function initBilling(userId: string | null, onChange: (state: BillingState) => void): Promise<boolean> {
  if (!isBillingConfigured) return false;
  if (!configured) {
    Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
    Purchases.addCustomerInfoUpdateListener((info) => onChange(stateFrom(info)));
    configured = true;
  } else if (userId) {
    await Purchases.logIn(userId);
  }
  onChange(stateFrom(await Purchases.getCustomerInfo()));
  return true;
}

export async function getPlanOptions(): Promise<PlanOption[]> {
  if (!isBillingConfigured) return DEMO_OPTIONS;
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return packages.map((pkg) => {
    const kind = pkg.packageType === 'MONTHLY' ? 'monthly' : pkg.packageType === 'ANNUAL' ? 'annual' : 'other';
    const intro = pkg.product.introPrice;
    return {
      id: pkg.identifier,
      kind,
      title: pkg.product.title,
      priceString: pkg.product.priceString,
      monthlyEquivalent: kind === 'annual' ? (pkg.product.pricePerMonthString ?? undefined) : undefined,
      freeTrial: intro && intro.price === 0 ? String(intro.periodNumberOfUnits) : undefined,
      pkg,
    };
  });
}

/** Compra un plan. Devuelve el nuevo estado, o null si el usuario canceló. */
export async function purchase(option: PlanOption): Promise<BillingState | null> {
  if (!option.pkg) throw new Error('Pagos no configurados');
  try {
    const { customerInfo } = await Purchases.purchasePackage(option.pkg);
    return stateFrom(customerInfo);
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) return null;
    throw error;
  }
}

export async function restore(): Promise<BillingState> {
  return stateFrom(await Purchases.restorePurchases());
}

export async function manageSubscription(): Promise<void> {
  if (isBillingConfigured) await Purchases.showManageSubscriptions();
}

export async function logOutBilling(): Promise<void> {
  if (isBillingConfigured && configured) await Purchases.logOut().catch(() => undefined);
}
