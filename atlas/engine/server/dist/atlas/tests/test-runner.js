export class ConnectorTestRunner {
    constructor(runtime) {
        this.runtime = runtime;
    }
    async run(connector, tenantId, authKey) {
        const passed = [];
        const failed = [];
        const logs = [];
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
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                failed.push(actionName);
                logs.push(`action:${actionName} failed: ${message}`);
            }
        }
        return { passed, failed, logs };
    }
}
