import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { api, apiBaseUrl } from '@/lib/api';

type SamlUser = {
  id: string;
  email: string;
  org_id?: string;
  role?: string;
  provider?: string;
  first_name?: string;
  last_name?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

type AuthUser = User | SamlUser | null;

interface AuthContextValue {
  user: AuthUser;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [samlUser, setSamlUser] = useState<SamlUser | null>(null);
  const [checkedSupabase, setCheckedSupabase] = useState(false);
  const [checkedSaml, setCheckedSaml] = useState(false);
  const loading = !checkedSupabase || !checkedSaml;

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[auth] failed to restore session', error);
          setSession(null);
        } else {
          setSession(data.session ?? null);
        }
      })
      .finally(() => {
        if (active) setCheckedSupabase(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchSamlSession()
      .then((result) => {
        if (!cancelled) {
          setSamlUser(result.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSamlUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckedSaml(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    await Promise.allSettled([
      supabase.auth.signOut(),
      fetch(`${apiBaseUrl}/auth/saml/logout`, { method: 'POST', credentials: 'include' }),
    ]);
    setSession(null);
    setSamlUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user: samlUser ?? session?.user ?? null,
      session,
      loading,
      signOut,
    }),
    [loading, session, samlUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
