import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
      <h1>Atlas Forge</h1>
      <p>Jump to the dashboard once you authenticate.</p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link href="/login">Login</Link>
        <Link href="/dashboard">Dashboard</Link>
      </div>
    </main>
  );
}
