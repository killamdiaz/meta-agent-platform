import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const GITHUB_API_BASE = 'https://api.github.com';
const manifest = manifestJson as ConnectorManifest;

class GitHubConnector extends BaseConnector {
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
    const token = credentials.accessToken ?? credentials.apiKey;

    if (!token) {
      throw new Error('GitHub connector requires an access token.');
    }

    switch (action) {
      case 'list_repositories': {
        const response = await this.request('/user/repos', token, {
          params: {
            visibility: params.visibility ?? 'all',
            per_page: params.per_page ?? 30,
            page: params.page ?? 1,
          },
        });

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'repository',
          response.map((repo: any) => ({
            fields: {
              id: repo.id,
              name: repo.name,
              full_name: repo.full_name,
              private: repo.private,
              created_at: repo.created_at,
              updated_at: repo.updated_at,
              description: repo.description,
              url: repo.html_url,
              language: repo.language,
            },
            raw: repo,
          })),
        );
      }

      case 'create_issue': {
        const repo = params.repository as string;
        const title = params.title as string;
        const body = params.body as string | undefined;
        const labels = params.labels as string[] | undefined;

        if (!repo || !title) {
          throw new Error(
            'create_issue requires repository (owner/repo) and title.',
          );
        }

        const response = await this.request(
          `/repos/${repo}/issues`,
          token,
          {
            method: 'POST',
            body: {
              title,
              body,
              labels,
            },
          },
        );

        return this.normalize('issue', {
          id: response.id,
          number: response.number,
          title: response.title,
          state: response.state,
          created_at: response.created_at,
          updated_at: response.updated_at,
          url: response.html_url,
          repository: repo,
          assignees: response.assignees?.map(
            (assignee: any) => assignee.login,
          ),
        }, response);
      }

      default:
        throw new Error(`Unsupported GitHub action "${action}".`);
    }
  }

  schema(): ConnectorSchema[] {
    return [
      {
        type: 'repository',
        fields: [
          { name: 'id', type: 'number', required: true },
          { name: 'name', type: 'string', required: true },
          { name: 'full_name', type: 'string' },
          { name: 'private', type: 'boolean' },
          { name: 'description', type: 'string' },
          { name: 'language', type: 'string' },
          { name: 'created_at', type: 'datetime' },
          { name: 'updated_at', type: 'datetime' },
          { name: 'url', type: 'string' },
        ],
      },
      {
        type: 'issue',
        fields: [
          { name: 'id', type: 'number', required: true },
          { name: 'number', type: 'number', required: true },
          { name: 'title', type: 'string', required: true },
          { name: 'state', type: 'string' },
          { name: 'repository', type: 'string' },
          { name: 'assignees', type: 'array' },
          { name: 'created_at', type: 'datetime' },
          { name: 'updated_at', type: 'datetime' },
          { name: 'url', type: 'string' },
        ],
      },
    ];
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'list_repositories',
        description: 'List repositories for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            visibility: {
              type: 'string',
              enum: ['all', 'public', 'private'],
            },
            per_page: { type: 'integer', minimum: 1, maximum: 100 },
            page: { type: 'integer', minimum: 1 },
          },
        },
      },
      {
        name: 'create_issue',
        description: 'Create an issue in a GitHub repository',
        inputSchema: {
          type: 'object',
          required: ['repository', 'title'],
          properties: {
            repository: { type: 'string', description: 'Format owner/repo' },
            title: { type: 'string' },
            body: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    ];
  }

  private async request(
    path: string,
    token: string,
    init: {
      method?: 'GET' | 'POST' | 'PATCH';
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
    },
  ): Promise<any> {
    const url = new URL(`${GITHUB_API_BASE}${path}`);

    if (init.params) {
      Object.entries(init.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'atlas-forge-connector',
        Accept: 'application/vnd.github+json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `GitHub API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): GitHubConnector => new GitHubConnector(deps);

export type { GitHubConnector };
