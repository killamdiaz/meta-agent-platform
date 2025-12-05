import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabaseClient';

const sanitizeDestination = (value: string | string[] | undefined, origin: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    return '/dashboard';
  }
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) {
      return '/dashboard';
    }
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return normalized || '/dashboard';
  } catch {
    return '/dashboard';
  }
};

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const rawToken = router.query.token;
    const rawRefresh = router.query.refresh_token;
    const token = typeof rawToken === 'string' ? rawToken : null;
    const refreshToken = typeof rawRefresh === 'string' ? rawRefresh : null;

    if (!token || !refreshToken) {
      setError('Missing tokens in callback.');
      return;
    }

    const run = async () => {
      const client = getBrowserClient();
      const { error } = await client.auth.setSession({
        access_token: token,
        refresh_token: refreshToken,
      });
      if (error) {
        setError(error.message);
        return;
      }
      const destination =
        typeof window !== 'undefined'
          ? sanitizeDestination(router.query.redirect, window.location.origin)
          : '/dashboard';
      router.replace(destination);
    };

    run();
  }, [router]);

  if (error) {
    return <div>Authentication failed: {error}</div>;
  }

  return <div>Signing you in…</div>;
}
