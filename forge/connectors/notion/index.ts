import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const manifest = manifestJson as ConnectorManifest;

class NotionConnector extends BaseConnector {
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
    const apiKey = credentials.apiKey;

    if (!apiKey) {
      throw new Error('Notion connector requires an integration token.');
    }

    switch (action) {
      case 'list_pages': {
        const response = await this.request('/search', apiKey, {
          method: 'POST',
          body: {
            filter: {
              property: 'object',
              value: 'page',
            },
            query: params.query,
            sort: params.sort,
            page_size: params.page_size ?? 10,
          },
        });

        const results = Array.isArray(response.results)
          ? response.results
          : [];

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'page',
          results.map((page: any) => ({
            fields: {
              id: page.id,
              title: this.extractTitle(page),
              created_at: page.created_time,
              updated_at: page.last_edited_time,
              url: page.url,
              icon: page.icon?.emoji ?? page.icon?.external?.url,
            },
            raw: page,
          })),
        );
      }

      case 'retrieve_page': {
        const pageId = params.page_id;

        if (!pageId || typeof pageId !== 'string') {
          throw new Error('retrieve_page requires a page_id parameter.');
        }

        const page = await this.request(`/pages/${pageId}`, apiKey, {
          method: 'GET',
        });

        return this.normalize('page', {
          id: page.id,
          title: this.extractTitle(page),
          created_at: page.created_time,
          updated_at: page.last_edited_time,
          url: page.url,
          icon: page.icon?.emoji ?? page.icon?.external?.url,
        }, page);
      }

      case 'create_page': {
        const databaseId = params.database_id;
        const properties = params.properties;

        if (!databaseId || !properties) {
          throw new Error(
            'create_page requires database_id and properties parameters.',
          );
        }

        const body = {
          parent: { database_id: databaseId },
          properties,
          children: params.children,
        };

        const page = await this.request('/pages', apiKey, {
          method: 'POST',
          body,
        });

        return this.normalize('page', {
          id: page.id,
          title: this.extractTitle(page),
          created_at: page.created_time,
          updated_at: page.last_edited_time,
          url: page.url,
          icon: page.icon?.emoji ?? page.icon?.external?.url,
        }, page);
      }

      default:
        throw new Error(`Unsupported Notion action "${action}".`);
    }
  }

  schema(): ConnectorSchema {
    return {
      type: 'page',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'title', type: 'string' },
        { name: 'created_at', type: 'datetime' },
        { name: 'updated_at', type: 'datetime' },
        { name: 'url', type: 'string' },
        { name: 'icon', type: 'string' },
      ],
    };
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'list_pages',
        description: 'List Notion pages accessible to the integration',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            sort: { type: 'object' },
            page_size: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
      {
        name: 'retrieve_page',
        description: 'Retrieve a Notion page by ID',
        inputSchema: {
          type: 'object',
          required: ['page_id'],
          properties: {
            page_id: { type: 'string' },
          },
        },
      },
      {
        name: 'create_page',
        description: 'Create a Notion page in a database',
        inputSchema: {
          type: 'object',
          required: ['database_id', 'properties'],
          properties: {
            database_id: { type: 'string' },
            properties: { type: 'object' },
            children: { type: 'array' },
          },
        },
      },
    ];
  }

  private extractTitle(page: any): string | undefined {
    const properties = page?.properties;
    if (!properties) return undefined;

    // Find first title property
    const titleProperty = Object.values(properties).find(
      (property: any) => Array.isArray(property?.title),
    ) as any;

    if (!titleProperty) return undefined;

    return titleProperty.title
      .map((item: any) => item.plain_text)
      .join('');
  }

  private async request(
    path: string,
    apiKey: string,
    init: {
      method: 'GET' | 'POST' | 'PATCH';
      body?: Record<string, unknown>;
    },
  ): Promise<any> {
    const response = await fetch(`${NOTION_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Notion API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): NotionConnector => new NotionConnector(deps);

export type { NotionConnector };
