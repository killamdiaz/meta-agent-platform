import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { token, refresh_token, redirect } = router.query;
    if (!token || !refresh_token) {
      setError('Missing tokens in callback.');
      return;
    }

    const run = async () => {
      const client = getBrowserClient();
      const { error } = await client.auth.setSession({
        access_token: String(token),
        refresh_token: String(refresh_token),
      });
      if (error) {
        setError(error.message);
        return;
      }
      const destination = typeof redirect === 'string' ? redirect : '/dashboard';
      router.replace(destination);
    };

    run();
  }, [router]);

  if (error) {
    return <div>Authentication failed: {error}</div>;
  }

  return <div>Signing you in…</div>;
}
