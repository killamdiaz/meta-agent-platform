# Atlas Forge Authentication Setup

This directory provides the minimal authentication scaffolding for Atlas Forge so it can reuse the existing Atlas OS Supabase project and login flow.

## Environment variables

Create a `.env.local` (copy from `.env.example`) with the following values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://lighdepncfhiecqllmod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=pk_anon_key_goes_here          # safe to expose to the browser

SUPABASE_SERVICE_ROLE_KEY=service_role_key_goes_here         # **server-side only**
NEXT_PUBLIC_META_AGENT_ID=forge
META_AGENT_SECRET=meta_agent_secret_goes_here                # **server-side only**

NEXT_PUBLIC_ATLAS_LOGIN_URL=https://atlasos.app/login
```

- `NEXT_PUBLIC_*` keys are embedded in the client bundle and therefore safe only when Supabase marks them as public (the anon key and Atlas login URL).
- `SUPABASE_SERVICE_ROLE_KEY` and `META_AGENT_SECRET` must never be shipped to the browser. Use them only in server-side code (API routes, middleware, edge functions).

## Project structure

```
forge/
  src/
    context/AuthContext.tsx         // React context for Supabase sessions
    lib/
      supabaseClient.ts             // Client & server Supabase helpers
      bridgeClient.ts               // Atlas Bridge API wrapper
    components/ProtectedRoute.tsx   // Guard for authenticated pages
    pages/
      login.tsx
      auth/callback.tsx
      dashboard.tsx
```

### Supabase client (`src/lib/supabaseClient.ts`)
- Creates cached client instances for browser and server runtime.
- Exposes helpers `getBrowserClient()` and `getServiceClient()`.
- Automatically refreshes tokens and logs errors for visibility.

### Auth context (`src/context/AuthContext.tsx`)
- Wraps the app, listens for `onAuthStateChange` events, and keeps the current Supabase `Session` & `User`.
- Restores sessions on page refresh.

### ProtectedRoute (`src/components/ProtectedRoute.tsx`)
- Redirects unauthenticated visitors to the Atlas login page, preserving the current URL with `?redirect=`.
- Shows a fallback loader while the auth state is being resolved.

### Bridge client (`src/lib/bridgeClient.ts`)
- Signs requests to Atlas Bridge edge functions using the active Supabase access token and an HMAC signature derived from `META_AGENT_SECRET`.
- Provides helper methods (`getUserSummary`, `getInvoices`, `createTask`) for convenience.

### Pages
- `/login` — simple redirector to the Atlas login page (adds `source=forge`).
- `/auth/callback` — reads query params (`token`, `refresh_token`), sets the Supabase session, and sends users to `/dashboard`.
- `/dashboard` — example protected page showing how to use the `AtlasBridgeClient`.

## Usage

Wrap your Next.js application with the `AuthProvider` (e.g. in `_app.tsx`) and use `ProtectedRoute` for any page that requires authentication:

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { AuthProvider } from '@/context/AuthContext';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
```

```tsx
// pages/dashboard.tsx
import ProtectedRoute from '@/components/ProtectedRoute';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

## Testing checklist

- [ ] Visiting `/login` redirects you to the Atlas login experience.
- [ ] Returning to `/auth/callback` with `token` + `refresh_token` sets the Supabase session.
- [ ] `supabase.auth.getUser()` returns a valid Atlas user inside guarded components.
- [ ] Bridge API calls succeed using the signed JWT.
- [ ] Logging out clears both Forge and Atlas sessions (Supabase handles cross-domain sign-out).

