import { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { AtlasBridgeClient } from '@/lib/bridgeClient';

interface SummaryResponse {
  [key: string]: unknown;
}

function DashboardContent() {
  const { user, signOut } = useAuth();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new AtlasBridgeClient();
    client
      .getUserSummary()
      .then((data) => setSummary(data as SummaryResponse))
      .catch((error) => {
        console.error('[bridge] summary failed', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      });
  }, []);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Welcome, {user?.email}</h1>
      <button onClick={() => signOut()}>Sign out</button>
      {error && <p style={{ color: 'red' }}>Failed to load summary: {error}</p>}
      {summary ? <pre>{JSON.stringify(summary, null, 2)}</pre> : <p>Loading summary…</p>}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
