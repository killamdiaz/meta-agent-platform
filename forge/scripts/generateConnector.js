#!/usr/bin/env node

/**
 * Quick scaffold utility for creating new connectors.
 *
 * Usage:
 *   node scripts/generateConnector.js --name=my-service --auth=oauth2 --category=productivity
 */

const { mkdir, writeFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((part) => {
      const [key, value] = part.replace(/^--/, '').split('=');
      return [key, value ?? true];
    }),
  );

  const required = ['name', 'auth'];
  const missing = required.filter((key) => !args[key]);

  if (missing.length > 0) {
    console.error(`Missing required flags: ${missing.join(', ')}`);
    process.exit(1);
  }

  const rawName = String(args.name);
  const connectorName = rawName.toLowerCase();
  const directoryName = connectorName.replace(/[\s-]+/g, '_');
  const authType = String(args.auth);
  const category = String(args.category ?? 'custom');
  const baseDir = path.resolve('connectors', directoryName);

  if (existsSync(baseDir)) {
    console.error(`Connector directory already exists: ${baseDir}`);
    process.exit(1);
  }

  await mkdir(baseDir, { recursive: true });

  const manifest = {
    name: connectorName,
    version: '1.0.0',
    category,
    description: args.description ?? `Connector for ${rawName}`,
    required_auth: {
      type: authType,
      scopes: args.scopes ? String(args.scopes).split(',') : undefined,
    },
    example_actions: ['example_action'],
  };

  const manifestPath = path.join(baseDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const indexPath = path.join(baseDir, 'index.ts');
  const className = `${toPascalCase(connectorName)}Connector`;

  const indexContent = `import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
} from '../types';
import manifest from './manifest.json';

class ${className} extends BaseConnector {
  constructor(deps?: BaseConnectorDependencies) {
    super(
      {
        name: manifest.name,
        version: manifest.version,
        authType: manifest.required_auth.type,
        scopes: manifest.required_auth.scopes,
      },
      deps,
    );
  }

  async query(
    action: string,
    params: Record<string, unknown> = {},
    context: ConnectorContext = {},
  ): Promise<ConnectorQueryResponse> {
    switch (action) {
      default:
        throw new Error(\`Unsupported ${connectorName} action "\${action}".\`);
    }
  }

  schema(): ConnectorSchema {
    return {
      type: 'record',
      fields: [],
    };
  }

  actions(): ConnectorAction[] {
    return [];
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): ${className} => new ${className}(deps);

export type { ${className} };
`;

  await writeFile(indexPath, indexContent);

  console.log(`Created connector scaffold in ${baseDir}`);
}

function toPascalCase(input) {
  return input
    .replace(/[_\s-]+/g, ' ')
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
