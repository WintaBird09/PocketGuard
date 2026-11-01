import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { setActiveDatabaseName } from '@/src/data/activeDatabase';
import { openAppDatabase } from '@/src/data/db';
import { cancelAllNotifications } from '@/src/notifications/schedule';

import { authConfigurationError, supabase } from './client';
import { ensureRemoteHouseholdMapping } from './householdBootstrap';
import { prepareLocalDatabase } from './localDatabase';

type HouseholdBootstrapStatus = 'signed-out' | 'pending' | 'ready' | 'failed';
type LocalDatabaseStatus = 'none' | 'preparing' | 'ready' | 'failed';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  localDatabaseStatus: LocalDatabaseStatus;
  localDatabaseError: string | null;
  retryLocalDatabase: () => void;
  householdBootstrapStatus: HouseholdBootstrapStatus;
  householdBootstrapError: string | null;
  sendMagicLink: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  // Resolves true when the account was created but the email must be confirmed first.
  signUpWithPassword: (email: string, password: string) => Promise<boolean>;
  updateDisplayName: (name: string) => Promise<void>;
  updateProfileMetadata: (metadata: Record<string, unknown>) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  // Sends a confirmation link; the address only changes once it is opened.
  requestEmailChange: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
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
  const [bootstrapUser, setBootstrapUser] = useState<string | null>(null);
  const [localDatabase, setLocalDatabase] = useState<{
    userId: string;
    error: string | null;
  } | null>(null);
  const [localDatabaseAttempt, setLocalDatabaseAttempt] = useState(0);
  const previousUserId = useRef<string | null>(null);
  const userId = session?.user.id ?? null;
  const localDatabaseStatus: LocalDatabaseStatus = !userId
    ? 'none'
    : localDatabase?.userId !== userId
      ? 'preparing'
      : localDatabase.error
        ? 'failed'
        : 'ready';

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

  // Each account owns a separate local database; it is opened only for the signed-in user.
  useEffect(() => {
    let active = true;
    setActiveDatabaseName(null);

    if (!userId) {
      if (previousUserId.current) void cancelAllNotifications();
      previousUserId.current = null;
      return () => {
        active = false;
      };
    }
    previousUserId.current = userId;

    void prepareLocalDatabase(userId)
      .then((name) => {
        if (!active) return;
        setActiveDatabaseName(name);
        setLocalDatabase({ userId, error: null });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLocalDatabase({
          userId,
          error: cause instanceof Error ? cause.message : 'Unable to open your data.',
        });
      });

    return () => {
      active = false;
    };
  }, [userId, localDatabaseAttempt]);

  useEffect(() => {
    let active = true;
    const bootstrapUserId = localDatabaseStatus === 'ready' ? userId : null;
    const supabaseClient = supabase;

    if (!bootstrapUserId || !supabaseClient) {
      return () => {
        active = false;
      };
    }

    void Promise.resolve()
      .then(async () => {
        if (active) {
          setBootstrapUser(bootstrapUserId);
          setHouseholdBootstrapStatus('pending');
          setHouseholdBootstrapError(null);
        }
        const db = await openAppDatabase();
        await ensureRemoteHouseholdMapping(db, bootstrapUserId, {
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
  }, [bootstrapAttempt, userId, localDatabaseStatus]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      error,
      localDatabaseStatus,
      localDatabaseError: localDatabase?.userId === userId ? localDatabase.error : null,
      retryLocalDatabase() {
        setLocalDatabaseAttempt((attempt) => attempt + 1);
      },
      // Status from a previous account must never be mistaken for the current one.
      householdBootstrapStatus: !session
        ? 'signed-out'
        : bootstrapUser === userId
          ? householdBootstrapStatus
          : 'pending',
      householdBootstrapError: session && bootstrapUser === userId ? householdBootstrapError : null,
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
      async signInWithPassword(email, password) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        setSession(data.session);
        setError(null);
      },
      async signUpWithPassword(email, password) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: Linking.createURL('auth/callback') },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          setSession(data.session);
          setError(null);
          return false;
        }
        return true;
      },
      async updateDisplayName(name) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { data, error: updateError } = await supabase.auth.updateUser({
          data: { display_name: name.trim() },
        });
        if (updateError) throw updateError;
        setSession((current) => (current && data.user ? { ...current, user: data.user } : current));
      },
      async updateProfileMetadata(metadata) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { data, error: updateError } = await supabase.auth.updateUser({ data: metadata });
        if (updateError) throw updateError;
        setSession((current) => (current && data.user ? { ...current, user: data.user } : current));
      },
      async updatePassword(password) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
      },
      async requestEmailChange(email) {
        if (!supabase) throw new Error(authConfigurationError ?? 'Supabase is not configured.');
        const { data, error: updateError } = await supabase.auth.updateUser(
          { email: email.trim().toLowerCase() },
          { emailRedirectTo: Linking.createURL('auth/callback') },
        );
        if (updateError) throw updateError;
        setSession((current) => (current && data.user ? { ...current, user: data.user } : current));
      },
      async refreshUser() {
        if (!supabase) return;
        const { data, error: getError } = await supabase.auth.getUser();
        if (getError) throw getError;
        setSession((current) => (current && data.user ? { ...current, user: data.user } : current));
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
    [
      bootstrapUser,
      error,
      householdBootstrapError,
      householdBootstrapStatus,
      loading,
      localDatabase,
      localDatabaseStatus,
      session,
      userId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
