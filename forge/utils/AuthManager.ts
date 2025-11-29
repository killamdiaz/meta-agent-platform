import {
  AuthCredentials,
  AuthPayload,
  ConnectorContext,
  ConnectorName,
} from '../connectors/types';

export interface VaultClient {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

type TokenRefreshHandler = (payload: AuthPayload) => Promise<AuthCredentials>;

const EXPIRY_BUFFER_SECONDS = 90;

export class InMemoryVaultClient implements VaultClient {
  private store = new Map<string, string>();

  async getSecret(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export interface AuthManagerOptions {
  vaultClient?: VaultClient;
}

export class AuthManager {
  private vault: VaultClient;
  private refreshHandlers = new Map<string, TokenRefreshHandler>();

  constructor(options: AuthManagerOptions = {}) {
    this.vault = options.vaultClient ?? new InMemoryVaultClient();
  }

  setVaultClient(vaultClient: VaultClient): void {
    this.vault = vaultClient;
  }

  registerRefreshHandler(
    connector: ConnectorName | string,
    handler: TokenRefreshHandler,
  ): void {
    this.refreshHandlers.set(connector, handler);
  }

  async getCredentials(
    connector: ConnectorName | string,
    context: ConnectorContext = {},
  ): Promise<AuthCredentials | null> {
    const key = this.buildKey(connector, context);
    const secret = await this.vault.getSecret(key);

    if (!secret) {
      return null;
    }

    const credentials = JSON.parse(secret) as AuthCredentials;
    const expiresAt = credentials.expiresAt;

    if (
      expiresAt &&
      expiresAt > 0 &&
      expiresAt <=
        Math.floor(Date.now() / 1000) + EXPIRY_BUFFER_SECONDS
    ) {
      return this.refreshCredentials({ connector, context, credentials });
    }

    return credentials;
  }

  async saveCredentials(payload: AuthPayload): Promise<AuthCredentials> {
    if (!payload.credentials) {
      throw new Error('Missing credentials in auth payload.');
    }

    const key = this.buildKey(payload.connector, payload.context);
    await this.vault.setSecret(key, JSON.stringify(payload.credentials));
    return payload.credentials;
  }

  async deleteCredentials(
    connector: ConnectorName | string,
    context: ConnectorContext = {},
  ): Promise<void> {
    const key = this.buildKey(connector, context);
    await this.vault.deleteSecret(key);
  }

  async refreshCredentials(payload: AuthPayload): Promise<AuthCredentials> {
    const handler = this.refreshHandlers.get(payload.connector);

    if (!handler) {
      throw new Error(
        `No refresh handler registered for ${payload.connector}.`,
      );
    }

    const refreshed = await handler(payload);
    await this.saveCredentials({
      connector: payload.connector,
      context: payload.context,
      credentials: refreshed,
    });

    return refreshed;
  }

  private buildKey(
    connector: ConnectorName | string,
    context: ConnectorContext,
  ): string {
    const userPart = context.userId ? `user:${context.userId}` : 'user:shared';
    const workspacePart = context.workspaceId
      ? `workspace:${context.workspaceId}`
      : 'workspace:global';
    return `forge::connector::${workspacePart}::${userPart}::${connector}`;
  }
}

export const authManager = new AuthManager();

let vaultConfigured = false;

export const configureAuthManagerVault = async (): Promise<void> => {
  if (vaultConfigured) {
    return;
  }

  try {
    const module = await import('./vault/SupabaseVaultClient');
    const supabaseVault =
      (await module.createSupabaseVaultClientFromEnv()) ?? null;

    if (supabaseVault) {
      authManager.setVaultClient(supabaseVault);
      vaultConfigured = true;
      return;
    }
  } catch (error) {
    console.warn(
      '[AuthManager] Supabase vault configuration failed, continuing with in-memory vault.',
      error,
    );
  }

  vaultConfigured = true;
};

