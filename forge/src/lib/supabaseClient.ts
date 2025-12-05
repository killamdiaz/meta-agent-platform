import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

export const getBrowserClient = (): SupabaseClient => {
  if (!browserClient) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
    }
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });

    browserClient.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        console.info('[supabase] session cleared');
      }
    });
  }
  return browserClient;
};

export const getServiceClient = (): SupabaseClient => {
  if (!serviceClient) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side operations');
    }
    if (!SUPABASE_URL) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for server-side operations');
    }
    serviceClient = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return serviceClient;
};

export const getCurrentSession = async (): Promise<Session | null> => {
  try {
    const client = getBrowserClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error('[supabase] failed to load session', error);
      return null;
    }
    return data.session ?? null;
  } catch (error) {
    console.error('[supabase] getCurrentSession error', error);
    return null;
  }
};
