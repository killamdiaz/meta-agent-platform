import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const manifest = manifestJson as ConnectorManifest;

class GoogleDriveConnector extends BaseConnector {
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
      throw new Error('Google Drive connector requires an OAuth access token.');
    }

    switch (action) {
      case 'list_files': {
        const response = await this.request('/files', token, {
          method: 'GET',
          query: {
            q: params.query ?? undefined,
            pageSize: params.pageSize ?? 25,
            spaces: params.spaces ?? 'drive',
            orderBy: params.orderBy ?? 'modifiedTime desc',
            fields:
              'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,owners(emailAddress))',
          },
        });

        const files = Array.isArray(response.files)
          ? response.files
          : [];

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'file',
          files.map((file: any) => ({
            fields: {
              id: file.id,
              name: file.name,
              mime_type: file.mimeType,
              created_at: file.createdTime,
              updated_at: file.modifiedTime,
              url: file.webViewLink,
              owner: file.owners?.[0]?.emailAddress,
            },
            raw: file,
          })),
        );
      }

      case 'download_file': {
        const fileId = params.fileId;

        if (!fileId || typeof fileId !== 'string') {
          throw new Error('download_file requires a fileId parameter.');
        }

        const metadata = await this.request(
          `/files/${fileId}`,
          token,
          {
            method: 'GET',
            query: {
              fields:
                'id,name,mimeType,createdTime,modifiedTime,webViewLink',
            },
          },
        );

        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

        return this.normalize('file', {
          id: metadata.id,
          name: metadata.name,
          mime_type: metadata.mimeType,
          url: metadata.webViewLink,
          download_url: downloadUrl,
          created_at: metadata.createdTime,
          updated_at: metadata.modifiedTime,
        }, metadata);
      }

      default:
        throw new Error(`Unsupported Google Drive action "${action}".`);
    }
  }

  schema(): ConnectorSchema {
    return {
      type: 'file',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'name', type: 'string' },
        { name: 'mime_type', type: 'string' },
        { name: 'owner', type: 'string' },
        { name: 'created_at', type: 'datetime' },
        { name: 'updated_at', type: 'datetime' },
        { name: 'url', type: 'string' },
        { name: 'download_url', type: 'string' },
      ],
    };
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'list_files',
        description: 'List files available in Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
            spaces: { type: 'string' },
            orderBy: { type: 'string' },
          },
        },
      },
      {
        name: 'download_file',
        description: 'Fetch metadata and download link for a Google Drive file',
        inputSchema: {
          type: 'object',
          required: ['fileId'],
          properties: {
            fileId: { type: 'string' },
          },
        },
      },
    ];
  }

  private async request(
    path: string,
    token: string,
    init: {
      method: 'GET';
      query?: Record<string, unknown>;
    },
  ): Promise<any> {
    const url = new URL(`${DRIVE_API_BASE}${path}`);

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
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Google Drive API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): GoogleDriveConnector => new GoogleDriveConnector(deps);

export type { GoogleDriveConnector };
