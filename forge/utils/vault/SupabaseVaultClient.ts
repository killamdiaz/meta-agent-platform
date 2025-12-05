import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt, getEncryptionConfig } from './encryption';
import type { VaultClient } from '../AuthManager';

interface SupabaseVaultClientOptions {
  tableName?: string;
  encryption?: boolean;
}

interface VaultRow {
  id: string;
  secret: string;
  updated_at?: string;
}

const DEFAULT_TABLE = 'forge_connector_secrets';

export class SupabaseVaultClient implements VaultClient {
  private readonly table: string;
  private readonly encryptionConfig = getEncryptionConfig();
  private readonly shouldEncrypt: boolean;

  constructor(
    private readonly supabase: SupabaseClient,
    options: SupabaseVaultClientOptions = {},
  ) {
    this.table = options.tableName ?? DEFAULT_TABLE;
    this.shouldEncrypt =
      options.encryption ?? this.encryptionConfig !== null;
  }

  async getSecret(key: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('secret')
      .eq('id', key)
      .maybeSingle();

    if (error) {
      console.error(`[SupabaseVaultClient] getSecret error for ${key}`, error);
      return null;
    }

    if (!data) {
      return null;
    }

    return this.shouldEncrypt && this.encryptionConfig
      ? this.decryptValue(data.secret)
      : data.secret;
  }

  async setSecret(key: string, value: string): Promise<void> {
    const payload =
      this.shouldEncrypt && this.encryptionConfig
        ? this.encryptValue(value)
        : value;

    const { error } = await this.supabase.from(this.table).upsert(
      {
        id: key,
        secret: payload,
      },
      { onConflict: 'id' },
    );

    if (error) {
      throw new Error(
        `[SupabaseVaultClient] setSecret failed for ${key}: ${error.message}`,
      );
    }
  }

  async deleteSecret(key: string): Promise<void> {
    const { error } = await this.supabase.from(this.table).delete().eq('id', key);

    if (error) {
      throw new Error(
        `[SupabaseVaultClient] deleteSecret failed for ${key}: ${error.message}`,
      );
    }
  }

  private encryptValue(value: string): string {
    if (!this.encryptionConfig) {
      return value;
    }
    return encrypt(value, this.encryptionConfig);
  }

  private decryptValue(value: string): string {
    if (!this.encryptionConfig) {
      return value;
    }
    try {
      return decrypt(value, this.encryptionConfig);
    } catch (error) {
      console.error('[SupabaseVaultClient] decryptValue error', error);
      return value;
    }
  }
}

export const createSupabaseVaultClientFromEnv = async (): Promise<
  SupabaseVaultClient | null
> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return new SupabaseVaultClient(supabase);
};
