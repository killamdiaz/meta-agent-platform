import { useEffect } from 'react';

const ATLAS_LOGIN_URL = import.meta.env.VITE_ATLAS_LOGIN_URL || 'https://atlasos.app/login';

export default function Login() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const callbackUrl = `${origin}/auth/callback`;
    const redirectParam = encodeURIComponent(callbackUrl);
    window.location.href = `${ATLAS_LOGIN_URL}?source=forge&redirect=${redirectParam}`;
  }, []);

  return <div className="flex h-screen items-center justify-center text-muted-foreground">Redirecting to Atlas login…</div>;
}
