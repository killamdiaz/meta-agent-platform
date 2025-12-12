import { UniversalConnectorRuntime } from '../runtime/runtime.js';
import { ConnectorTestResult, StoredConnectorPackage } from '../core/types.js';

export class ConnectorTestRunner {
  constructor(private readonly runtime: UniversalConnectorRuntime) {}

  async run(connector: StoredConnectorPackage, tenantId: string, authKey?: string): Promise<ConnectorTestResult> {
    const passed: string[] = [];
    const failed: string[] = [];
    const logs: string[] = [];

    for (const actionName of Object.keys(connector.actions)) {
      try {
        const result = await this.runtime.executeAction({
          connector,
          action: actionName,
          input: {},
          tenantId,
          authKey,
        });
        logs.push(`action:${actionName} status=${result.status}`);
        passed.push(actionName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push(actionName);
        logs.push(`action:${actionName} failed: ${message}`);
      }
    }

    return { passed, failed, logs };
  }
}

