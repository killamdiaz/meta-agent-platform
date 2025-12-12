import { z } from 'zod';
import { ActionSchema, ConnectorManifestSchema, ConnectorPackageSchema, TriggerSchema } from './schemas.js';

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;
export type ActionSpec = z.infer<typeof ActionSchema>;
export type TriggerSpec = z.infer<typeof TriggerSchema>;
export type ConnectorPackageInput = z.infer<typeof ConnectorPackageSchema>;

export type ConnectorStatus = 'draft' | 'installed' | 'published';

export interface StoredConnectorPackage {
  id: string;
  tenantId: string;
  manifest: ConnectorManifest;
  actions: Record<string, ActionSpec>;
  triggers: Record<string, TriggerSpec>;
  transforms: Record<string, string>;
  status: ConnectorStatus;
  verified: boolean;
  downloadCount: number;
  storagePath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectorTestResult {
  passed: string[];
  failed: string[];
  logs: string[];
}

export interface RuntimeAuthContext {
  type: 'oauth2' | 'api_key' | 'basic';
  token?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  refreshToken?: string;
}

export interface RuntimeExecutionResult {
  connectorId: string;
  actionName: string;
  status: number;
  data: unknown;
}

export interface PublishRequest {
  tenantId: string;
  connectorId: string;
  verified?: boolean;
}

export interface MarketplaceConnector {
  id: string;
  name: string;
  version: string;
  description: string;
  icon?: string;
  publisher: string;
  category: string;
  verified: boolean;
  downloadCount: number;
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map((part) => Number(part));
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 > b1 ? 1 : -1;
  if (a2 !== b2) return a2 > b2 ? 1 : -1;
  if (a3 !== b3) return a3 > b3 ? 1 : -1;
  return 0;
}

export function isVersionGreater(next: string, current: string) {
  return compareVersions(next, current) === 1;
}

