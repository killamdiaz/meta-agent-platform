"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

const atlasLoginUrl = process.env.NEXT_PUBLIC_ATLAS_LOGIN_URL ?? 'https://atlasos.app/login';

export default function ProtectedRoute({ children, loadingFallback = <div>Loading...</div> }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      const redirectUrl = encodeURIComponent(window.location.href);
      window.location.href = `${atlasLoginUrl}?source=forge&redirect=${redirectUrl}`;
    }
  }, [loading, user]);

  if (loading || (!user && typeof window !== 'undefined')) {
    return <>{loadingFallback}</>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

