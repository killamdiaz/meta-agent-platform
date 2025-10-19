import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const ATLAS_LOGIN_URL = import.meta.env.VITE_ATLAS_LOGIN_URL || 'https://atlasos.app/login';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      const currentUrl = window.location.origin + location.pathname + window.location.search;
      const redirectParam = encodeURIComponent(currentUrl);
      window.location.href = `${ATLAS_LOGIN_URL}?source=forge&redirect=${redirectParam}`;
    }
  }, [loading, user, location.pathname, location.search]);

  if (loading || (!user && typeof window !== 'undefined')) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Authenticating…</div>;
  }

  if (!user) {
    return null;
  }

  return <Outlet />;
}
