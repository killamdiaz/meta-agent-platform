"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

export default function ProtectedRoute({ children, loadingFallback = <div>Loading...</div> }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || user || typeof window === 'undefined') {
      return;
    }
    const requestedPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const search = requestedPath ? `?redirect=${encodeURIComponent(requestedPath)}` : '';
    const loginPath = `/login${search}`;
    if (router.asPath === loginPath) {
      return;
    }
    router.replace(loginPath);
  }, [loading, user, router]);

  if (loading || (!user && typeof window !== 'undefined')) {
    return <>{loadingFallback}</>;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
