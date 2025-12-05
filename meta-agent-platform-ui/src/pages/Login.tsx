import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Shield, ArrowRight, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';

const ATLAS_LOGIN_URL = import.meta.env.VITE_ATLAS_LOGIN_URL || 'https://atlasos.app/login';
const SAML_PROVIDER_ID = import.meta.env.VITE_SUPABASE_SAML_PROVIDER_ID || '';
const SAML_DOMAIN = import.meta.env.VITE_SUPABASE_SSO_DOMAIN || '';
const SAML_AVAILABLE = Boolean(SAML_PROVIDER_ID || SAML_DOMAIN);

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

export default function AtlasForgeLogin() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeAction, setActiveAction] = useState<'atlas' | 'saml' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectParam = searchParams.get('redirect');
  const destination = useMemo(() => normalizeRedirect(safeDecode(redirectParam)), [redirectParam]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }
    navigate(destination, { replace: true });
  }, [authLoading, user, destination, navigate]);

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
    if (typeof window === 'undefined') {
      return;
    }
    setActiveAction('atlas');
    setErrorMessage(null);
    setStatusMessage('Taking you to Atlas…');
    const callback = encodeURIComponent(buildCallbackUrl());
    window.location.href = `${ATLAS_LOGIN_URL}?source=forge&redirect=${callback}`;
  }, [buildCallbackUrl]);

  const handleSamlLogin = useCallback(async () => {
    if (!SAML_AVAILABLE) {
      return;
    }
    setActiveAction('saml');
    setErrorMessage(null);
    setStatusMessage('Preparing secure SAML/Okta session…');
    try {
      const redirectTo = buildCallbackUrl();
      let response;
      if (SAML_PROVIDER_ID) {
        response = await supabase.auth.signInWithSSO({
          providerId: SAML_PROVIDER_ID,
          options: { redirectTo },
        });
      } else {
        response = await supabase.auth.signInWithSSO({
          domain: SAML_DOMAIN,
          options: { redirectTo },
        });
      }
      if (response.error) {
        throw response.error;
      }
      if (!response.data?.url) {
        throw new Error('Unable to start SAML/Okta login. Please try again.');
      }
      window.location.href = response.data.url;
    } catch (error) {
      console.error('[login] SAML/Okta failed', error);
      setActiveAction(null);
      setStatusMessage(null);
      const message = error instanceof Error ? error.message : 'SAML/Okta login failed.';
      setErrorMessage(message);
    }
  }, [buildCallbackUrl]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-6">
      <div className="w-full max-w-md space-y-8">
        {/* Atlas Logo and Branding */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-3">
            <img src="/icon.png" alt="Atlas" className="h-12 w-auto" />
            <div className="flex flex-col items-start">
              <span className="text-2xl font-bold text-foreground">Atlas</span>
              <span className="text-xs text-muted-foreground">By KaizenDev</span>
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
              We no longer redirect automatically—pick Atlas or SAML/Okta to continue.
            </p> */}
          </div>
        </div>

        <Card className="shadow-lg border-border/60">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-semibold">Atlas Forge Login</CardTitle>
            <p className="text-sm text-muted-foreground">Select your authentication provider.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-border/80 bg-card/70 p-4 space-y-3">
              <div>
                <p className="font-semibold">Login with Atlas</p>
                <p className="text-sm text-muted-foreground">Use your Atlas credentials to continue.</p>
              </div>
              <Button className="w-full h-12" onClick={handleAtlasLogin} disabled={activeAction !== null}>
                {activeAction === 'atlas' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  <>
                    Sign In with Atlas
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            <Separator />

            <div
              className={`rounded-2xl border border-border/80 p-4 space-y-3 ${
                SAML_AVAILABLE ? 'bg-card/70' : 'bg-muted/30'
              }`}
            >
              <div>
                <p className="font-semibold">Login with SAML/Okta</p>
                <p className="text-sm text-muted-foreground">Enterprise SSO powered by your IdP.</p>
              </div>
              <Button
                variant="outline"
                className="w-full h-12"
                onClick={handleSamlLogin}
                disabled={activeAction !== null || !SAML_AVAILABLE}
              >
                {activeAction === 'saml' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    Start SSO
                    <KeyRound className="h-4 w-4" />
                  </>
                )}
              </Button>
              {!SAML_AVAILABLE && (
                <Alert className="text-sm">
                  <AlertDescription>
                    Configure `VITE_SUPABASE_SAML_PROVIDER_ID` or `VITE_SUPABASE_SSO_DOMAIN` in `.env` to enable SAML/Okta.
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
