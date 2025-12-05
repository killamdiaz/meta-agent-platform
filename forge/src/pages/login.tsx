import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabaseClient';

const atlasLoginUrl = process.env.NEXT_PUBLIC_ATLAS_LOGIN_URL ?? 'https://atlasos.app/login';
const samlProviderId = process.env.NEXT_PUBLIC_SUPABASE_SAML_PROVIDER_ID;
const samlDomain = process.env.NEXT_PUBLIC_SUPABASE_SSO_DOMAIN;
const samlConfigured = Boolean(samlProviderId || samlDomain);

const normalizeDestination = (value: string | null, origin: string): string => {
  if (!value) {
    return '/dashboard';
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) {
      return '/dashboard';
    }
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return normalized || '/dashboard';
  } catch {
    return '/dashboard';
  }
};

export default function AtlasForgeLogin() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [redirectTarget, setRedirectTarget] = useState<string>('/dashboard');
  const [activeAction, setActiveAction] = useState<'atlas' | 'saml' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') {
      return;
    }
    const raw = typeof router.query.redirect === 'string' ? router.query.redirect : null;
    setRedirectTarget(normalizeDestination(raw, window.location.origin));
  }, [router.isReady, router.query]);

  const destinationUrl = useMemo(() => redirectTarget || '/dashboard', [redirectTarget]);

  useEffect(() => {
    if (!router.isReady || authLoading || !user) {
      return;
    }
    router.replace(destinationUrl);
  }, [router, router.isReady, authLoading, user, destinationUrl]);

  const buildCallbackUrl = useCallback(() => {
    if (typeof window === 'undefined') {
      return '/auth/callback';
    }
    const callback = new URL('/auth/callback', window.location.origin);
    if (destinationUrl) {
      callback.searchParams.set('redirect', destinationUrl);
    }
    return callback.toString();
  }, [destinationUrl]);

  const beginAtlasLogin = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setActiveAction('atlas');
    setErrorMessage(null);
    setStatusMessage('Redirecting you to Atlas…');
    const callbackUrl = encodeURIComponent(buildCallbackUrl());
    window.location.href = `${atlasLoginUrl}?source=forge&redirect=${callbackUrl}`;
  }, [buildCallbackUrl, atlasLoginUrl]);

  const beginSamlLogin = useCallback(async () => {
    if (!samlConfigured) {
      return;
    }
    setActiveAction('saml');
    setErrorMessage(null);
    setStatusMessage('Preparing secure SAML/Okta session…');

    try {
      const client = getBrowserClient();
      const redirectTo = buildCallbackUrl();
      let params: Parameters<typeof client.auth.signInWithSSO>[0];
      if (samlProviderId) {
        params = { providerId: samlProviderId, options: { redirectTo } };
      } else if (samlDomain) {
        params = { domain: samlDomain, options: { redirectTo } };
      } else {
        throw new Error('SAML/Okta login is not configured.');
      }

      const { data, error } = await client.auth.signInWithSSO(params);
      if (error) {
        throw error;
      }
      if (!data?.url) {
        throw new Error('Unable to start SAML/Okta login. Please try again.');
      }
      window.location.href = data.url;
    } catch (error) {
      console.error('[login] SAML/Okta failed', error);
      setActiveAction(null);
      setStatusMessage(null);
      const message = error instanceof Error ? error.message : 'SAML/Okta login failed.';
      setErrorMessage(message);
    }
  }, [buildCallbackUrl, samlConfigured, samlDomain, samlProviderId]);

  const showSamlDisabled = !samlConfigured;

  return (
    <>
      <Head>
        <title>Atlas Forge Login</title>
      </Head>
      <div className="page">
        <header className="page-header">
          <div className="brand">
            <div className="brand-icon">
              <FileText size={22} />
            </div>
            <div>
              <p className="brand-title">Atlas Forge</p>
              <p className="brand-subtitle">Secure Automation Launchpad</p>
            </div>
          </div>
        </header>

        <main className="content">
          <div className="hero-icon">
            <ShieldCheck size={32} />
          </div>
          <h1>Sign in to Atlas Forge</h1>
          <p className="intro">
            Choose how you would like to authenticate. Atlas Forge keeps your automation blueprints encrypted end-to-end.
          </p>

          <div className="card">
            <p className="card-heading">Select a login method</p>

            <div className="option">
              <div>
                <p className="option-title">Login with Atlas</p>
                <p className="option-subtitle">Use your Atlas account to seamlessly enter Forge.</p>
              </div>
              <button className="primary" onClick={beginAtlasLogin} disabled={activeAction !== null}>
                {activeAction === 'atlas' ? (
                  <span className="spinner" aria-label="Redirecting" />
                ) : (
                  <ArrowRight size={18} aria-hidden />
                )}
                <span>{activeAction === 'atlas' ? 'Redirecting…' : 'Continue'}</span>
              </button>
            </div>

            <div className={`option${showSamlDisabled ? ' disabled' : ''}`}>
              <div>
                <p className="option-title">Login with SAML/Okta</p>
                <p className="option-subtitle">Enterprise single sign-on powered by your IdP.</p>
              </div>
              <button
                className="secondary"
                onClick={beginSamlLogin}
                disabled={activeAction !== null || showSamlDisabled}
              >
                {activeAction === 'saml' ? (
                  <span className="spinner dark" aria-label="Starting SSO" />
                ) : (
                  <KeyRound size={18} aria-hidden />
                )}
                <span>{activeAction === 'saml' ? 'Connecting…' : 'Start SSO'}</span>
              </button>
            </div>

            {statusMessage && <p className="status">{statusMessage}</p>}
            {errorMessage && <p className="error">{errorMessage}</p>}

            {showSamlDisabled && (
              <p className="note">SAML/Okta has not been configured for this environment. Contact your Atlas admin to enable it.</p>
            )}
          </div>

          <p className="footer-note">Need help? Contact atlas-support@atlasos.app.</p>
        </main>
      </div>
      <style jsx>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(circle at 20% 20%, rgba(108, 99, 255, 0.15), transparent 50%),
            radial-gradient(circle at 80% 0%, rgba(0, 180, 255, 0.15), transparent 45%),
            #05050b;
          color: #f8fafc;
          display: flex;
          flex-direction: column;
        }

        .page-header {
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 1rem 0;
          backdrop-filter: blur(8px);
          position: sticky;
          top: 0;
          background: rgba(5, 5, 11, 0.8);
        }

        .brand {
          max-width: 960px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .brand-icon {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-title {
          font-weight: 600;
          margin: 0;
        }

        .brand-subtitle {
          margin: 0;
          font-size: 0.85rem;
          color: rgba(248, 250, 252, 0.7);
        }

        .content {
          flex: 1;
          max-width: 420px;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
          text-align: center;
        }

        .hero-icon {
          width: 72px;
          height: 72px;
          margin: 0 auto 1.5rem;
          border-radius: 24px;
          background: rgba(99, 102, 241, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        h1 {
          margin: 0 0 0.75rem;
          font-size: 2rem;
        }

        .intro {
          margin: 0 auto 2.5rem;
          color: rgba(248, 250, 252, 0.75);
          line-height: 1.5;
        }

        .card {
          background: rgba(15, 17, 33, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 1.75rem;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(12px);
          text-align: left;
        }

        .card-heading {
          margin-top: 0;
          margin-bottom: 1.5rem;
          font-weight: 600;
          color: rgba(248, 250, 252, 0.85);
        }

        .option {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .option.disabled {
          opacity: 0.6;
        }

        .option-title {
          margin: 0;
          font-weight: 600;
        }

        .option-subtitle {
          margin: 0.25rem 0 0;
          color: rgba(248, 250, 252, 0.7);
          font-size: 0.95rem;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 0.6rem 1.2rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        button.primary {
          background: linear-gradient(135deg, #7c3aed, #6366f1);
          color: #fff;
          box-shadow: 0 10px 30px rgba(99, 102, 241, 0.3);
        }

        button.secondary {
          background: rgba(248, 250, 252, 0.1);
          color: #f8fafc;
          border: 1px solid rgba(248, 250, 252, 0.2);
        }

        button:not(:disabled):hover {
          transform: translateY(-1px);
        }

        .spinner {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.8);
          border-top-color: transparent;
          animation: spin 0.8s linear infinite;
        }

        .spinner.dark {
          border-color: rgba(255, 255, 255, 0.6);
          border-top-color: transparent;
        }

        .status,
        .error,
        .note {
          margin: 1rem 0 0;
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .status {
          color: rgba(125, 211, 252, 0.9);
        }

        .error {
          color: #f87171;
        }

        .note {
          color: rgba(248, 250, 252, 0.65);
        }

        .footer-note {
          margin-top: 2rem;
          color: rgba(248, 250, 252, 0.6);
          font-size: 0.85rem;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
