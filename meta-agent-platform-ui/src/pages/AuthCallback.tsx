import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accessToken = params.get('token') || params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const redirect = params.get('redirect');

    if (!accessToken || !refreshToken) {
      setError('Missing access or refresh token.');
      return;
    }

    const restore = async () => {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setError(error.message);
        return;
      }

      if (typeof window !== 'undefined') {
        const target = redirect ? decodeURIComponent(redirect) : '/';
        navigate(target, { replace: true });
      }
    };

    restore();
  }, [location.search, navigate]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-6 py-4 text-destructive">
          Authentication failed: {error}
        </div>
      </div>
    );
  }

  return <div className="flex h-screen items-center justify-center text-muted-foreground">Signing you in…</div>;
}
