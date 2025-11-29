import type { BaseConnector } from './BaseConnector';
import type {
  ConnectorManifest,
  ConnectorName,
} from './types';
import type { BaseConnectorDependencies } from './BaseConnector';

import slackManifestJson from './slack/manifest.json';
import gmailManifestJson from './gmail/manifest.json';
import notionManifestJson from './notion/manifest.json';
import githubManifestJson from './github/manifest.json';
import stripeManifestJson from './stripe/manifest.json';
import googleDriveManifestJson from './google_drive/manifest.json';
import hubspotManifestJson from './hubspot/manifest.json';
import clickupManifestJson from './clickup/manifest.json';
import trelloManifestJson from './trello/manifest.json';
import discordManifestJson from './discord/manifest.json';

const slackManifest = slackManifestJson as ConnectorManifest;
const gmailManifest = gmailManifestJson as ConnectorManifest;
const notionManifest = notionManifestJson as ConnectorManifest;
const githubManifest = githubManifestJson as ConnectorManifest;
const stripeManifest = stripeManifestJson as ConnectorManifest;
const googleDriveManifest = googleDriveManifestJson as ConnectorManifest;
const hubspotManifest = hubspotManifestJson as ConnectorManifest;
const clickupManifest = clickupManifestJson as ConnectorManifest;
const trelloManifest = trelloManifestJson as ConnectorManifest;
const discordManifest = discordManifestJson as ConnectorManifest;

type ConnectorFactory = (
  deps?: BaseConnectorDependencies,
) => Promise<BaseConnector> | BaseConnector;

interface ConnectorRegistration {
  manifest: ConnectorManifest;
  loader: () => Promise<{ createConnector: ConnectorFactory }>;
}

class ConnectorRegistry {
  private registry = new Map<ConnectorName, ConnectorRegistration>();

  register(
    name: ConnectorName,
    registration: ConnectorRegistration,
  ): void {
    this.registry.set(name, registration);
  }

  async create(
    name: ConnectorName,
    deps?: BaseConnectorDependencies,
  ): Promise<BaseConnector> {
    const registration = this.registry.get(name);

    if (!registration) {
      throw new Error(`Connector "${name}" is not registered.`);
    }

    const module = await registration.loader();
    const connector = await module.createConnector(deps);
    return connector;
  }

  manifest(name: ConnectorName): ConnectorManifest {
    const registration = this.registry.get(name);

    if (!registration) {
      throw new Error(`Connector "${name}" is not registered.`);
    }

    return registration.manifest;
  }

  list(): Array<{ name: ConnectorName; manifest: ConnectorManifest }> {
    return Array.from(this.registry.entries()).map(
      ([name, registration]) => ({
        name,
        manifest: registration.manifest,
      }),
    );
  }
}

export const connectorRegistry = new ConnectorRegistry();

connectorRegistry.register('slack', {
  manifest: slackManifest,
  loader: () => import('./slack/index'),
});

connectorRegistry.register('gmail', {
  manifest: gmailManifest,
  loader: () => import('./gmail/index'),
});

connectorRegistry.register('notion', {
  manifest: notionManifest,
  loader: () => import('./notion/index'),
});

connectorRegistry.register('github', {
  manifest: githubManifest,
  loader: () => import('./github/index'),
});

connectorRegistry.register('stripe', {
  manifest: stripeManifest,
  loader: () => import('./stripe/index'),
});

connectorRegistry.register('google_drive', {
  manifest: googleDriveManifest,
  loader: () => import('./google_drive/index'),
});

connectorRegistry.register('hubspot', {
  manifest: hubspotManifest,
  loader: () => import('./hubspot/index'),
});

connectorRegistry.register('clickup', {
  manifest: clickupManifest,
  loader: () => import('./clickup/index'),
});

connectorRegistry.register('trello', {
  manifest: trelloManifest,
  loader: () => import('./trello/index'),
});

connectorRegistry.register('discord', {
  manifest: discordManifest,
  loader: () => import('./discord/index'),
});
