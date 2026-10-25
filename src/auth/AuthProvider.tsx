import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { openAppDatabase } from '@/src/data/db';

import { authConfigurationError, supabase } from './client';
import { ensureRemoteHouseholdMapping } from './householdBootstrap';

type HouseholdBootstrapStatus = 'signed-out' | 'pending' | 'ready' | 'failed';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  householdBootstrapStatus: HouseholdBootstrapStatus;
  householdBootstrapError: string | null;
  sendMagicLink: (email: string) => Promise<void>;
  exchangeCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryHouseholdBootstrap: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);
  const [error, setError] = useState<string | null>(null);
  const [householdBootstrapStatus, setHouseholdBootstrapStatus] =
    useState<HouseholdBootstrapStatus>('signed-out');
  const [householdBootstrapError, setHouseholdBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setError(null);
        setLoading(false);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) throw sessionError;
        setSession(data.session);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error ? cause.message : 'Unable to restore your sign-in session.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const userId = session?.user.id;
    const supabaseClient = supabase;

    if (!userId || !supabaseClient) {
      return () => {
        active = false;
      };
    }

    void Promise.resolve()
      .then(async () => {
        if (active) {
          setHouseholdBootstrapStatus('pending');
          setHouseholdBootstrapError(null);
        }
        const db = await openAppDatabase();
        await ensureRemoteHouseholdMapping(db, userId, {
          async createHousehold(household) {
            const { data, error: rpcError } = await supabaseClient.rpc('bootstrap_household', {
              p_name: household.name,
              p_currency: household.currency,
              p_month_start_day: household.monthStartDay,
            });
            if (rpcError) throw rpcError;
            if (typeof data !== 'string') {
              throw new Error('Supabase did not return a household ID.');
            }
            return data;
          },
        });
        if (active) setHouseholdBootstrapStatus('ready');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setHouseholdBootstrapStatus('failed');
        setHouseholdBootstrapError(
          cause instanceof Error ? cause.message : 'Unable to link the local household.',
        );
      });

    return () => {
      active = false;
    };
  }, [bootstrapAttempt, session?.user.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      error,
      householdBootstrapStatus: session ? householdBootstrapStatus : 'signed-out',
      householdBootstrapError: session ? householdBootstrapError : null,
      retryHouseholdBootstrap() {
        setBootstrapAttempt((attempt) => attempt + 1);
      },
      async sendMagicLink(email) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { error: requestError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: Linking.createURL('auth/callback') },
        });
        if (requestError) throw requestError;
      },
      async exchangeCode(code) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        setSession(data.session);
        setError(null);
      },
      async signOut() {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw signOutError;
        setSession(null);
      },
    }),
    [error, householdBootstrapError, householdBootstrapStatus, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
