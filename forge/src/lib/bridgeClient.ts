import crypto from 'crypto';
import { getBrowserClient } from '@/lib/supabaseClient';

const DEFAULT_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const META_AGENT_ID = process.env.NEXT_PUBLIC_META_AGENT_ID!;
const META_AGENT_SECRET = process.env.META_AGENT_SECRET;

export class AtlasBridgeClient {
  constructor(private baseUrl: string = DEFAULT_BASE_URL) {}

  private async getToken(): Promise<string | null> {
    const client = getBrowserClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.error('[bridge] failed to fetch session', error);
      return null;
    }
    return data.session?.access_token ?? null;
  }

  private signToken(token: string) {
    if (!META_AGENT_SECRET) {
      throw new Error('META_AGENT_SECRET is not configured');
    }
    return crypto.createHmac('sha256', META_AGENT_SECRET).update(`${META_AGENT_ID}${token}`).digest('hex');
  }

  async request<T = unknown>(endpoint: string, method: string = 'GET', body?: unknown): Promise<T> {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Missing Supabase session');
    }

    const signature = this.signToken(token);
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Agent-Id': META_AGENT_ID,
        'X-Agent-Signature': signature,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Atlas Bridge error ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  getUserSummary() {
    return this.request('/bridge-user-summary');
  }

  getInvoices() {
    return this.request('/bridge-invoices');
  }

  createTask(data: Record<string, unknown>) {
    return this.request('/bridge-tasks', 'POST', data);
  }
}
