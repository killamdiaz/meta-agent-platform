import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AuthProvider } from '@/context/AuthContext';

import '../styles/globals.css';

export default function ForgeApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Head>
        <title>Atlas Forge</title>
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
