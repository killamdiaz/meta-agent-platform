import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, ArrowRight, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useBrandStore } from '@/store/brandStore';

const ATLAS_LOGIN_URL = import.meta.env.VITE_ATLAS_LOGIN_URL || 'https://atlasos.app/login';

const safeDecode = (value: string | null) => {
  if (!value) {
    return null;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeRedirect = (value: string | null) => {
  if (!value || typeof window === 'undefined') {
    return '/';
  }
  if (value.startsWith('/')) {
    return value;
  }
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) {
      return '/';
    }
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    return normalized || '/';
  } catch {
    return '/';
  }
};

export default function AtlasEngineLogin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeAction, setActiveAction] = useState<'atlas' | 'saml' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [ssoInfo, setSsoInfo] = useState<{
    enabled: boolean;
    orgId?: string;
    enforceSso?: boolean;
    metadataUrl?: string;
  } | null>(null);
  const [ssoChecking, setSsoChecking] = useState(false);
  const brandPrefix = useBrandStore((state) => state.companyName?.trim() || 'Atlas');
  const brandShort = useBrandStore((state) => state.shortName?.trim() || brandPrefix);
  const engineName = `${brandPrefix} Engine`;
  const brandLogo = useBrandStore((state) => state.logoUrl || state.sidebarLogoUrl || '/icon.png');

  const redirectParam = searchParams.get('redirect');
  const destination = useMemo(() => normalizeRedirect(safeDecode(redirectParam)), [redirectParam]);
  const samlEnabled = ssoInfo?.enabled ?? false;
  const enforceSso = Boolean(ssoInfo?.enforceSso);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    navigate(destination, { replace: true });
  }, [authLoading, user, destination, navigate]);

  useEffect(() => {
    if (!email || !email.includes('@')) {
      setSsoInfo(null);
      return;
    }
    const handle = setTimeout(() => {
      setSsoChecking(true);
      api
        .discoverSaml(email)
        .then((result) => {
          setSsoInfo(result);
        })
        .catch((err) => {
          console.warn('[login] sso discovery failed', err);
          setSsoInfo(null);
        })
        .finally(() => setSsoChecking(false));
    }, 350);

    return () => clearTimeout(handle);
  }, [email]);

  const buildCallbackUrl = useCallback(() => {
    if (typeof window === 'undefined') {
      return '/auth/callback';
    }
    const callback = new URL('/auth/callback', window.location.origin);
    if (destination) {
      callback.searchParams.set('redirect', destination);
    }
    return callback.toString();
  }, [destination]);

  const handleAtlasLogin = useCallback(() => {
    if (ssoInfo?.enforceSso) {
      setErrorMessage('Your organization enforces SSO. Please use Login with SSO.');
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    setActiveAction('atlas');
    setErrorMessage(null);
    setStatusMessage(`Taking you to ${brandShort}…`);
    const callback = encodeURIComponent(buildCallbackUrl());
    window.location.href = `${ATLAS_LOGIN_URL}?source=forge&redirect=${callback}`;
  }, [brandShort, buildCallbackUrl, ssoInfo?.enforceSso]);

  const handleSamlLogin = useCallback(async () => {
    if (!email || !email.includes('@')) {
      setErrorMessage('Enter your work email to continue with SSO.');
      return;
    }
    setActiveAction('saml');
    setErrorMessage(null);
    setStatusMessage('Redirecting to your identity provider…');
    try {
      const response = await api.startSamlLogin({ email, redirect: destination });
      if (!response?.redirectUrl) {
        throw new Error('Unable to start SAML login. Please try again.');
      }
      window.location.href = response.redirectUrl;
    } catch (error) {
      console.error('[login] SAML failed', error);
      setActiveAction(null);
      setStatusMessage(null);
      const message = error instanceof Error ? error.message : 'SAML login failed.';
      setErrorMessage(message);
    }
  }, [destination, email]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-6">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Logo and Branding */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-3">
            <img src={brandLogo} alt={engineName} className="h-12 w-auto rounded-lg bg-muted/30 p-1.5" />
            <div className="flex flex-col items-start">
              <span className="text-2xl font-bold text-foreground">{engineName}</span>
              <span className="text-xs text-muted-foreground">Secure sign-in</span>
            </div>
          </div>
          </div>

      </div>

          <div className="space-y-2">
            <Badge variant="outline" className="px-3 py-1 text-xs uppercase tracking-wide">
              Trusted Access
            </Badge>
            <h1 className="text-3xl font-bold text-foreground">Choose how to sign in</h1>
            {/* <p className="text-muted-foreground">
              We no longer redirect automatically—pick {brandShort} or SAML/Okta to continue.
            </p> */}
          </div>
        </div>

        <Card className="shadow-lg border-border/60">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-semibold">{engineName} Login</CardTitle>
            <p className="text-sm text-muted-foreground">Select your authentication provider.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            {!enforceSso ? (
              <div className="rounded-2xl border border-border/80 bg-card/70 p-4 space-y-3">
                <div>
                  <p className="font-semibold">Login with {brandShort}</p>
                  <p className="text-sm text-muted-foreground">Use your {brandShort} credentials to continue.</p>
                </div>
                <Button className="w-full h-12" onClick={handleAtlasLogin} disabled={activeAction !== null}>
                  {activeAction === 'atlas' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    <>
                      Sign In with {brandShort}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Alert>
                <AlertDescription>Your organization enforces SSO. Use the secure login below.</AlertDescription>
              </Alert>
            )}

            <Separator />

            <div
              className={`rounded-2xl border border-border/80 p-4 space-y-3 ${
                samlEnabled ? 'bg-card/70' : 'bg-muted/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">Login with SSO</p>
                  <p className="text-sm text-muted-foreground">
                    Enterprise SAML 2.0 using your IdP (Okta, Azure AD, Ping).
                  </p>
                </div>
                <Badge variant={samlEnabled ? 'default' : 'outline'}>
                  {ssoChecking ? 'Checking…' : samlEnabled ? 'Ready' : 'Domain check'}
                </Badge>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Work email</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={activeAction !== null}
                />
              </div>
              <Button
                variant="outline"
                className="w-full h-12"
                onClick={handleSamlLogin}
                disabled={activeAction !== null || !samlEnabled || ssoChecking || !email}
              >
                {activeAction === 'saml' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    Login with SSO
                    <KeyRound className="h-4 w-4" />
                  </>
                )}
              </Button>
              {email && !ssoChecking && !samlEnabled && (
                <Alert className="text-sm">
                  <AlertDescription>
                    We couldn't find an SSO configuration for <strong>{email.split('@')[1]}</strong>. Contact your admin.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {statusMessage && (
              <Alert>
                <AlertDescription>{statusMessage}</AlertDescription>
              </Alert>
            )}

            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">Need help? Contact atlas-support@atlasos.app.</p>
      </div>
    </div>
  );
}
