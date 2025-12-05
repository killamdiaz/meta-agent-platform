import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const manifest = manifestJson as ConnectorManifest;

class DiscordConnector extends BaseConnector {
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
    const token = credentials.apiKey ?? credentials.accessToken;

    if (!token) {
      throw new Error('Discord connector requires a bot token.');
    }

    switch (action) {
      case 'send_message': {
        const channelId = params.channel_id;
        const content = params.content as string | undefined;

        if (!channelId || typeof channelId !== 'string' || !content) {
          throw new Error(
            'send_message requires channel_id (string) and content.',
          );
        }

        const response: any = await this.request(
          `/channels/${channelId}/messages`,
          token,
          {
            method: 'POST',
            body: {
              content,
              embeds: params.embeds,
              components: params.components,
            },
          },
        );

        return this.normalize('message', {
          id: response.id,
          channel_id: response.channel_id,
          content: response.content,
          author_id: response.author?.id,
          created_at: response.timestamp,
          url: `https://discord.com/channels/${response.guild_id ?? '@me'}/${response.channel_id}/${response.id}`,
        }, response);
      }

      case 'list_channels': {
        const guildId = params.guild_id;

        if (!guildId || typeof guildId !== 'string') {
          throw new Error('list_channels requires a guild_id parameter.');
        }

        const response: any = await this.request(
          `/guilds/${guildId}/channels`,
          token,
          { method: 'GET' },
        );

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'channel',
          response
            .filter((channel: any) => channel.type === 0) // text channels
            .map((channel: any) => ({
              fields: {
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                created_at: undefined,
              },
              raw: channel,
            })),
        );
      }

      default:
        throw new Error(`Unsupported Discord action "${action}".`);
    }
  }

  schema(): ConnectorSchema[] {
    return [
      {
        type: 'message',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'channel_id', type: 'string', required: true },
          { name: 'author_id', type: 'string' },
          { name: 'content', type: 'string' },
          { name: 'created_at', type: 'datetime' },
          { name: 'url', type: 'string' },
        ],
      },
      {
        type: 'channel',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'name', type: 'string' },
          { name: 'type', type: 'number' },
          { name: 'position', type: 'number' },
          { name: 'created_at', type: 'datetime' },
        ],
      },
    ];
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'send_message',
        description: 'Send a message to a Discord channel as the bot',
        inputSchema: {
          type: 'object',
          required: ['channel_id', 'content'],
          properties: {
            channel_id: { type: 'string' },
            content: { type: 'string' },
            embeds: { type: 'array' },
            components: { type: 'array' },
          },
        },
      },
      {
        name: 'list_channels',
        description: 'List text channels for a Discord guild',
        inputSchema: {
          type: 'object',
          required: ['guild_id'],
          properties: {
            guild_id: { type: 'string' },
          },
        },
      },
    ];
  }

  private async request(
    path: string,
    token: string,
    init: {
      method: 'GET' | 'POST';
      body?: Record<string, unknown>;
    },
  ): Promise<any> {
    const response = await fetch(`${DISCORD_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Discord API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): DiscordConnector => new DiscordConnector(deps);

export type { DiscordConnector };
