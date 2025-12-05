import type { BaseConnector } from '../connectors/BaseConnector';
import type { BaseConnectorDependencies } from '../connectors/BaseConnector';
import { connectorRegistry } from '../connectors';
import type {
  ConnectorManifest,
  ConnectorName,
} from '../connectors/types';

export interface ConnectOptions {
  cacheKey?: string;
  deps?: BaseConnectorDependencies;
}

class ForgeConnect {
  private cache = new Map<string, Promise<BaseConnector>>();

  connect(
    name: ConnectorName | string,
    options: ConnectOptions = {},
  ): Promise<BaseConnector> {
    const cacheKey = options.cacheKey ?? `${name}::default`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as Promise<BaseConnector>;
    }

    const connectorPromise = connectorRegistry.create(
      name as ConnectorName,
      options.deps,
    );

    this.cache.set(cacheKey, connectorPromise);
    return connectorPromise;
  }

  findConnector(
    name: ConnectorName | string,
    options: ConnectOptions = {},
  ): Promise<BaseConnector> {
    return this.connect(name, options);
  }

  manifest(name: ConnectorName): ConnectorManifest {
    return connectorRegistry.manifest(name);
  }

  list(): Array<{ name: ConnectorName; manifest: ConnectorManifest }> {
    return connectorRegistry.list();
  }

  clearCache(cacheKey?: string): void {
    if (cacheKey) {
      this.cache.delete(cacheKey);
      return;
    }

    this.cache.clear();
  }
}

const forgeConnect = new ForgeConnect();

export default forgeConnect;
