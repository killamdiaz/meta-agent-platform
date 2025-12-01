import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || user) {
      return;
    }
    const requestedPath = `${location.pathname}${location.search}${location.hash}`;
    const search = requestedPath ? `?redirect=${encodeURIComponent(requestedPath)}` : '';
    navigate(`/login${search}`, { replace: true });
  }, [loading, user, location.pathname, location.search, location.hash, navigate]);

  if (loading || (!user && typeof window !== 'undefined')) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Authenticating…</div>;
  }

  if (!user) {
    return null;
  }

  return <Outlet />;
}
