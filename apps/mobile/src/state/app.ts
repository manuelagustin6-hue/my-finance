import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlanId } from '@my-finance/core';
import { create } from 'zustand';
import type { BillingState } from '@/billing/billing';

const DEMO_PRO_KEY = 'my-finance:demo-pro';

interface AppState {
  /** Usuario autenticado en Supabase (null en modo demo o sin sesión). */
  userId: string | null;
  email: string | null;
  /** true cuando ya se resolvió la sesión inicial. */
  ready: boolean;
  billing: BillingState;
  /** Plan según el servidor (tabla subscriptions, actualizada por el webhook). */
  serverPlan: PlanId;
  /** Pro simulado en modo demo, para probar las funciones pagas sin tiendas. */
  demoPro: boolean;
  setSession(userId: string | null, email: string | null): void;
  setReady(): void;
  setBilling(state: BillingState): void;
  setServerPlan(plan: PlanId): void;
  setDemoPro(value: boolean): Promise<void>;
  loadDemoPro(): Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  userId: null,
  email: null,
  ready: false,
  billing: { isPro: false },
  serverPlan: 'free',
  demoPro: false,
  setSession: (userId, email) => set({ userId, email }),
  setReady: () => set({ ready: true }),
  setBilling: (billing) => set({ billing }),
  setServerPlan: (serverPlan) => set({ serverPlan }),
  setDemoPro: async (demoPro) => {
    set({ demoPro });
    try {
      await AsyncStorage.setItem(DEMO_PRO_KEY, demoPro ? '1' : '0');
    } catch {
      // Preferencia de demo: si no se puede guardar, solo dura la sesión.
    }
  },
  loadDemoPro: async () => {
    try {
      set({ demoPro: (await AsyncStorage.getItem(DEMO_PRO_KEY)) === '1' });
    } catch {
      set({ demoPro: false });
    }
  },
}));

/** Plan vigente: Pro si lo confirma la tienda, el servidor o el modo demo. */
export function currentPlan(state: Pick<AppState, 'billing' | 'serverPlan' | 'demoPro'> = useAppStore.getState()): PlanId {
  return state.billing.isPro || state.serverPlan === 'pro' || state.demoPro ? 'pro' : 'free';
}

export function usePlan(): PlanId {
  return useAppStore((s) => currentPlan(s));
}
