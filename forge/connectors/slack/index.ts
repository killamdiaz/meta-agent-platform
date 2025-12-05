import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const SLACK_API_BASE = 'https://slack.com/api';
const manifest = manifestJson as ConnectorManifest;

class SlackConnector extends BaseConnector {
  constructor(deps?: BaseConnectorDependencies) {
    super(
      {
        name: manifest.name,
        version: manifest.version,
        authType: manifest.required_auth.type,
        scopes: Array.isArray(manifest.required_auth.scopes)
          ? [...manifest.required_auth.scopes]
          : undefined,
      },
      deps,
    );
  }

  async query(
    action: string,
    params: Record<string, unknown> = {},
    context: ConnectorContext = {},
  ): Promise<ConnectorQueryResponse> {
    const credentials = await this.auth(context);
    const token = credentials.accessToken;

    if (!token) {
      throw new Error('Slack connector requires an OAuth access token.');
    }

    switch (action) {
      case 'send_message': {
        const response: any = await this.post(
          'chat.postMessage',
          token,
          {
            channel: params.channel,
            text: params.text,
            blocks: params.blocks,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Slack API error: ${response.error ?? 'unknown error'}`,
          );
        }

        const message: any = response.message ?? {};
        return this.normalize('message', {
          id: response.ts,
          channel: params.channel,
          text: message.text,
          created_at: this.timestampFromSlackTs(response.ts),
          url: message.permalink,
        });
      }

      case 'list_channels': {
        const response: any = await this.get(
          'conversations.list',
          token,
          params,
        );

        if (!response.ok) {
          throw new Error(
            `Slack API error: ${response.error ?? 'unknown error'}`,
          );
        }

        const channels = Array.isArray(response.channels)
          ? response.channels
          : [];

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'channel',
          channels.map((channel: any) => ({
            fields: {
              id: channel.id,
              name: channel.name,
              topic: channel.topic?.value,
              created_at: channel.created
                ? new Date(channel.created * 1000).toISOString()
                : undefined,
              is_private: channel.is_private,
            },
            raw: channel,
          })),
        );
      }

      default:
        throw new Error(`Unsupported Slack action "${action}".`);
    }
  }

  schema(): ConnectorSchema[] {
    return [
      {
        type: 'message',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'channel', type: 'string', required: true },
          { name: 'text', type: 'string', required: true },
          { name: 'created_at', type: 'datetime' },
          { name: 'url', type: 'string' },
        ],
      },
      {
        type: 'channel',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'name', type: 'string', required: true },
          { name: 'topic', type: 'string' },
          { name: 'created_at', type: 'datetime' },
          { name: 'is_private', type: 'boolean' },
        ],
      },
    ];
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'send_message',
        description: 'Send a message to a Slack channel',
        inputSchema: {
          type: 'object',
          required: ['channel', 'text'],
          properties: {
            channel: { type: 'string' },
            text: { type: 'string' },
            blocks: { type: 'array' },
          },
        },
      },
      {
        name: 'list_channels',
        description: 'List Slack channels available to the bot',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 200 },
            cursor: { type: 'string' },
          },
        },
      },
    ];
  }

  private async get(
    endpoint: string,
    token: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    const url = new URL(`${SLACK_API_BASE}/${endpoint}`);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return response.json();
  }

  private async post(
    endpoint: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    const response = await fetch(`${SLACK_API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });

    return response.json();
  }

  private timestampFromSlackTs(ts: unknown): string | undefined {
    if (typeof ts !== 'string') {
      return undefined;
    }

    const [secondsStr] = ts.split('.');
    const seconds = Number(secondsStr);

    if (Number.isNaN(seconds)) {
      return undefined;
    }

    return new Date(seconds * 1000).toISOString();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): SlackConnector => new SlackConnector(deps);

export type { SlackConnector };
