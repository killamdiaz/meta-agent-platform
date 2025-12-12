import { useCallback } from 'react';
import type { Provider } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type OauthProvider = 'google' | 'azure' | 'apple';

interface SignUpResult {
  error: Error | null;
}

interface SignInResult {
  error: Error | null;
  requiresMfa?: boolean;
}

interface MfaResult {
  error: Error | null;
}

interface UseAuthValue {
  signUp: (email: string, password: string, country: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  verifyMfa: (code: string) => Promise<MfaResult>;
  verifyRecoveryCode: (code: string) => Promise<MfaResult>;
  signInWithOAuth: (provider: OauthProvider) => Promise<{ error: Error | null }>;
}

export function useAuth(): UseAuthValue {
  const signUp = useCallback<UseAuthValue['signUp']>(async (email, password, country) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          country,
        },
      },
    });
    return { error };
  }, []);

  const signIn = useCallback<UseAuthValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error, requiresMfa: false };
  }, []);

  const verifyMfa = useCallback<UseAuthValue['verifyMfa']>(async () => {
    return { error: new Error('MFA verification is not configured in this environment.') };
  }, []);

  const verifyRecoveryCode = useCallback<UseAuthValue['verifyRecoveryCode']>(async () => {
    return { error: new Error('Recovery codes are not configured in this environment.') };
  }, []);

  const signInWithOAuth = useCallback<UseAuthValue['signInWithOAuth']>(async (provider) => {
    let redirectTo: string | undefined;
    if (typeof window !== 'undefined') {
      redirectTo = `${window.location.origin}/auth/callback`;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: {
        redirectTo,
      },
    });
    return { error };
  }, []);

  return {
    signUp,
    signIn,
    verifyMfa,
    verifyRecoveryCode,
    signInWithOAuth,
  };
}
