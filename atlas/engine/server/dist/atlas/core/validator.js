import { ConnectorPackageSchema, validateNoSecretsInFiles, validateTransformSource } from './schemas.js';
export function validateConnectorPackage(input) {
    const parsed = ConnectorPackageSchema.parse(input);
    for (const [name, transform] of Object.entries(parsed.transforms)) {
        validateTransformSource(name, transform);
    }
    validateNoSecretsInFiles({
        'connector.json': JSON.stringify(parsed.manifest),
        ...Object.fromEntries(Object.entries(parsed.actions).map(([k, v]) => [`actions/${k}.json`, JSON.stringify(v)])),
        ...Object.fromEntries(Object.entries(parsed.triggers).map(([k, v]) => [`triggers/${k}.json`, JSON.stringify(v)])),
        ...Object.fromEntries(Object.entries(parsed.transforms).map(([k, v]) => [`transforms/${k}.js`, v])),
    });
    return parsed;
}
export function ensureNoInlineSecrets(payload) {
    const stringified = JSON.stringify(payload);
    if (/(apikey|api_key|token|secret|password)/i.test(stringified)) {
        throw new Error('Connector payload appears to contain secrets. Remove secrets before publishing.');
    }
}
