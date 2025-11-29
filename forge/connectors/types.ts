export type ConnectorName =
  | 'slack'
  | 'gmail'
  | 'notion'
  | 'github'
  | 'stripe'
  | 'google_drive'
  | 'hubspot'
  | 'clickup'
  | 'trello'
  | 'discord';

export type ConnectorAuthType = 'oauth2' | 'api_key' | 'custom';

export interface ConnectorContext {
  userId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorAction {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  scope?: string[];
}

export interface NormalizedRecord<T = Record<string, unknown>> {
  source: ConnectorName | string;
  type: string;
  fields: T & {
    id?: string;
    created_at?: string;
    updated_at?: string;
    url?: string;
  };
  raw?: unknown;
}

export interface ConnectorSchemaField {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface ConnectorSchema {
  type: string;
  fields: ConnectorSchemaField[];
}

export interface ConnectorOptions {
  name: ConnectorName | string;
  authType: ConnectorAuthType;
  version: string;
  scopes?: string[];
}

export interface ConnectorManifest {
  name: string;
  version: string;
  category: string;
  description?: string;
  required_auth: {
    type: ConnectorAuthType;
    scopes?: string[];
  };
  example_actions: string[];
  homepage?: string;
}

export interface AuthCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  apiKey?: string;
  [key: string]: unknown;
}

export interface AuthPayload {
  connector: ConnectorName | string;
  context: ConnectorContext;
  credentials?: AuthCredentials;
}

export interface QueryOptions {
  action: string;
  params?: Record<string, unknown>;
  context?: ConnectorContext;
}

export type ConnectorQueryResponse =
  | NormalizedRecord
  | NormalizedRecord[]
  | Record<string, unknown>
  | Record<string, unknown>[];
