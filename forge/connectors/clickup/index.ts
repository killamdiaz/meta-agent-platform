import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';
const manifest = manifestJson as ConnectorManifest;

class ClickUpConnector extends BaseConnector {
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
      throw new Error('ClickUp connector requires an API token.');
    }

    switch (action) {
      case 'list_tasks': {
        const listId = params.list_id;

        if (!listId || typeof listId !== 'string') {
          throw new Error('list_tasks requires a list_id parameter.');
        }

        const response = await this.request(
          `/list/${listId}/task`,
          token,
          {
            method: 'GET',
            query: {
              page: params.page ?? 0,
              order_by: params.order_by ?? 'due_date',
              statuses: params.statuses,
            },
          },
        );

        const tasks = Array.isArray(response.tasks)
          ? response.tasks
          : [];

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'task',
          tasks.map((task: any) => ({
            fields: {
              id: task.id,
              name: task.name,
              status: task.status?.status,
              priority: task.priority?.priority,
              assignees: task.assignees?.map((assignee: any) => assignee.email),
              created_at: task.date_created
                ? new Date(Number(task.date_created)).toISOString()
                : undefined,
              updated_at: task.date_updated
                ? new Date(Number(task.date_updated)).toISOString()
                : undefined,
              due_date: task.due_date
                ? new Date(Number(task.due_date)).toISOString()
                : undefined,
              url: task.url,
            },
            raw: task,
          })),
        );
      }

      case 'create_task': {
        const listId = params.list_id;
        const name = params.name as string | undefined;

        if (!listId || typeof listId !== 'string' || !name) {
          throw new Error(
            'create_task requires list_id (string) and name.',
          );
        }

        const response = await this.request(
          `/list/${listId}/task`,
          token,
          {
            method: 'POST',
            body: {
              name,
              description: params.description,
              assignees: params.assignees,
              due_date: params.due_date,
              priority: params.priority,
            },
          },
        );

        return this.normalize('task', {
          id: response.id,
          name: response.name,
          status: response.status?.status,
          priority: response.priority?.priority,
          created_at: response.date_created
            ? new Date(Number(response.date_created)).toISOString()
            : undefined,
          updated_at: response.date_updated
            ? new Date(Number(response.date_updated)).toISOString()
            : undefined,
          due_date: response.due_date
            ? new Date(Number(response.due_date)).toISOString()
            : undefined,
          url: response.url,
        }, response);
      }

      default:
        throw new Error(`Unsupported ClickUp action "${action}".`);
    }
  }

  schema(): ConnectorSchema {
    return {
      type: 'task',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'name', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'priority', type: 'string' },
        { name: 'assignees', type: 'array' },
        { name: 'created_at', type: 'datetime' },
        { name: 'updated_at', type: 'datetime' },
        { name: 'due_date', type: 'datetime' },
        { name: 'url', type: 'string' },
      ],
    };
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'list_tasks',
        description: 'List tasks for a ClickUp list',
        inputSchema: {
          type: 'object',
          required: ['list_id'],
          properties: {
            list_id: { type: 'string' },
            page: { type: 'integer', minimum: 0 },
            order_by: { type: 'string' },
            statuses: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      {
        name: 'create_task',
        description: 'Create a new ClickUp task',
        inputSchema: {
          type: 'object',
          required: ['list_id', 'name'],
          properties: {
            list_id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            assignees: { type: 'array', items: { type: 'number' } },
            due_date: { type: 'integer' },
            priority: { type: 'integer', minimum: 1, maximum: 4 },
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
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
    },
  ): Promise<any> {
    const url = new URL(`${CLICKUP_API_BASE}${path}`);

    if (init.query) {
      Object.entries(init.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            url.searchParams.append(key, value.join(','));
            return;
          }
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `ClickUp API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): ClickUpConnector => new ClickUpConnector(deps);

export type { ClickUpConnector };
