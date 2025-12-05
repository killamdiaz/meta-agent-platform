import {
  AuthCredentials,
  ConnectorAction,
  ConnectorContext,
  ConnectorOptions,
  ConnectorQueryResponse,
  ConnectorSchema,
} from './types';
import {
  AuthManager,
  authManager as defaultAuthManager,
} from '../utils/AuthManager';
import {
  SchemaNormalizer,
  schemaNormalizer as defaultSchemaNormalizer,
} from '../utils/SchemaNormalizer';

export interface BaseConnectorDependencies {
  authManager?: AuthManager;
  schemaNormalizer?: SchemaNormalizer;
}

export abstract class BaseConnector {
  protected readonly authManager: AuthManager;
  protected readonly schemaNormalizer: SchemaNormalizer;
  protected readonly options: ConnectorOptions;

  constructor(
    options: ConnectorOptions,
    deps: BaseConnectorDependencies = {},
  ) {
    this.options = options;
    this.authManager = deps.authManager ?? defaultAuthManager;
    this.schemaNormalizer = deps.schemaNormalizer ?? defaultSchemaNormalizer;
  }

  /**
   * Fetches connector credentials from the AuthManager. Override this when
   * custom auth flows are required.
   */
  async auth(context: ConnectorContext = {}): Promise<AuthCredentials> {
    const credentials = await this.authManager.getCredentials(
      this.options.name,
      context,
    );

    if (!credentials) {
      throw new Error(
        `Missing credentials for connector "${this.options.name}".`,
      );
    }

    return credentials;
  }

  abstract query(
    action: string,
    params?: Record<string, unknown>,
    context?: ConnectorContext,
  ): Promise<ConnectorQueryResponse>;

  abstract schema(): ConnectorSchema | ConnectorSchema[];

  abstract actions(): ConnectorAction[];

  /**
   * Helper to persist refreshed tokens via the AuthManager.
   */
  protected async persistCredentials(
    credentials: AuthCredentials,
    context: ConnectorContext = {},
  ): Promise<void> {
    await this.authManager.saveCredentials({
      connector: this.options.name,
      context,
      credentials,
    });
  }

  protected normalize(
    type: string,
    fields: Record<string, unknown>,
    raw?: unknown,
  ) {
    return this.schemaNormalizer.normalize({
      source: this.options.name,
      type,
      fields,
      raw,
    });
  }
}
