import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const TRELLO_API_BASE = 'https://api.trello.com/1';
const manifest = manifestJson as ConnectorManifest;

class TrelloConnector extends BaseConnector {
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
    const apiKey = credentials.apiKey as string | undefined;
    const token = (credentials.token ??
      credentials.accessToken) as string | undefined;

    if (!apiKey || !token) {
      throw new Error(
        'Trello connector requires both apiKey and token credentials.',
      );
    }

    switch (action) {
      case 'list_boards': {
        const response: any = await this.request(
          `/members/${params.member ?? 'me'}/boards`,
          apiKey,
          token,
          {
            method: 'GET',
            query: {
              fields: 'id,name,desc,url,dateLastActivity',
            },
          },
        );

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'board',
          response.map((board: any) => ({
            fields: {
              id: board.id,
              name: board.name,
              description: board.desc,
              url: board.url,
              updated_at: board.dateLastActivity,
            },
            raw: board,
          })),
        );
      }

      case 'create_card': {
        const listId = params.list_id;
        const name = params.name as string | undefined;

        if (!listId || typeof listId !== 'string' || !name) {
          throw new Error('create_card requires list_id and name.');
        }

        const response: any = await this.request(
          '/cards',
          apiKey,
          token,
          {
            method: 'POST',
            query: {
              idList: listId,
              name,
              desc: params.description,
              due: params.due,
              idMembers: Array.isArray(params.members)
                ? (params.members as string[]).join(',')
                : undefined,
            },
          },
        );

        return this.normalize('card', {
          id: response.id,
          name: response.name,
          description: response.desc,
          due_date: response.due,
          url: response.url,
          list_id: response.idList,
          board_id: response.idBoard,
          created_at: response.id
            ? new Date(parseInt(response.id.substring(0, 8), 16) * 1000).toISOString()
            : undefined,
        }, response);
      }

      default:
        throw new Error(`Unsupported Trello action "${action}".`);
    }
  }

  schema(): ConnectorSchema[] {
    return [
      {
        type: 'board',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'updated_at', type: 'datetime' },
        ],
      },
      {
        type: 'card',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'name', type: 'string' },
          { name: 'description', type: 'string' },
          { name: 'due_date', type: 'datetime' },
          { name: 'url', type: 'string' },
          { name: 'list_id', type: 'string' },
          { name: 'board_id', type: 'string' },
          { name: 'created_at', type: 'datetime' },
        ],
      },
    ];
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'list_boards',
        description: 'List Trello boards for a member (default current user)',
        inputSchema: {
          type: 'object',
          properties: {
            member: { type: 'string' },
          },
        },
      },
      {
        name: 'create_card',
        description: 'Create a Trello card on a given list',
        inputSchema: {
          type: 'object',
          required: ['list_id', 'name'],
          properties: {
            list_id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            due: { type: 'string', description: 'ISO 8601 timestamp' },
            members: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    ];
  }

  private async request(
    path: string,
    apiKey: string,
    token: string,
    init: {
      method: 'GET' | 'POST';
      query?: Record<string, unknown>;
    },
  ): Promise<any> {
    const url = new URL(`${TRELLO_API_BASE}${path}`);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('token', token);

    if (init.query) {
      Object.entries(init.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url, {
      method: init.method,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Trello API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): TrelloConnector => new TrelloConnector(deps);

export type { TrelloConnector };
