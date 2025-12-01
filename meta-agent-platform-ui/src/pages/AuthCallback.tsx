import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

const sanitizeRedirect = (value: string | null) => {
  if (!value || typeof window === 'undefined') {
    return '/';
  }
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  if (decoded.startsWith('/')) {
    return decoded;
  }
  try {
    const url = new URL(decoded, window.location.origin);
    if (url.origin !== window.location.origin) {
      return '/';
    }
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    return normalized || '/';
  } catch {
    return '/';
  }
};

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const restore = async () => {
      const searchParams = new URLSearchParams(location.search);
      const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));

      const redirect = searchParams.get('redirect') || hashParams.get('redirect');

      // Support both query and hash params, plus "token"/"refresh" from Atlas redirect.
      const accessToken =
        searchParams.get('token') ||
        searchParams.get('access_token') ||
        hashParams.get('token') ||
        hashParams.get('access_token');
      const refreshToken =
        searchParams.get('refresh') ||
        searchParams.get('refresh_token') ||
        hashParams.get('refresh') ||
        hashParams.get('refresh_token');

      if (!accessToken || !refreshToken) {
        // If Supabase already initialized the session (e.g., via hash parsing), just continue.
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setError(error.message);
          return;
        }
        if (data.session) {
          const destination = sanitizeRedirect(redirect);
          navigate(destination, { replace: true });
          return;
        }
        setError('Missing access or refresh token.');
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        setError(error.message);
        return;
      }

      const destination = sanitizeRedirect(redirect);
      navigate(destination, { replace: true });
    };

    restore();
  }, [location.search, location.hash, navigate]);

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
