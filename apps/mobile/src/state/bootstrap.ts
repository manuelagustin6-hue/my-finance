import { useEffect } from 'react';
import { initBilling } from '@/billing/billing';
import { isSupabaseConfigured } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import { useAppStore } from './app';

async function loadServerPlan(userId: string) {
  const { data } = await getSupabase().rpc('current_plan', { uid: userId });
  useAppStore.getState().setServerPlan(data === 'pro' ? 'pro' : 'free');
}

/**
 * Resuelve la sesión inicial, escucha cambios de autenticación e inicializa los pagos.
 * En modo demo solo carga la preferencia de Pro simulado.
 */
export function useBootstrap() {
  useEffect(() => {
    const store = useAppStore.getState();
    const setBilling = store.setBilling;

    if (!isSupabaseConfigured) {
      void store.loadDemoPro().finally(() => {
        void initBilling(null, setBilling).catch(() => undefined);
        store.setReady();
      });
      return;
    }

    const supabase = getSupabase();
    const apply = (userId: string | null, email: string | null) => {
      useAppStore.getState().setSession(userId, email);
      if (userId) {
        void loadServerPlan(userId).catch(() => undefined);
        void initBilling(userId, setBilling).catch(() => undefined);
      } else {
        useAppStore.getState().setServerPlan('free');
        setBilling({ isPro: false });
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      apply(user?.id ?? null, user?.email ?? null);
      useAppStore.getState().setReady();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      const current = useAppStore.getState().userId;
      if ((user?.id ?? null) !== current) apply(user?.id ?? null, user?.email ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
}
