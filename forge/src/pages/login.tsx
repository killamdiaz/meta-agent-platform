import { useEffect } from 'react';

const atlasLoginUrl = process.env.NEXT_PUBLIC_ATLAS_LOGIN_URL ?? 'https://atlasos.app/login';

export default function Login() {
  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const redirect = encodeURIComponent(`${origin}/auth/callback`);
    window.location.href = `${atlasLoginUrl}?source=forge&redirect=${redirect}`;
  }, []);

  return <p>Redirecting to Atlas login…</p>;
}

