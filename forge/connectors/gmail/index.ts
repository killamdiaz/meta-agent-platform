import { Buffer } from 'node:buffer';
import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const manifest = manifestJson as ConnectorManifest;

class GmailConnector extends BaseConnector {
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
      throw new Error('Gmail connector requires an OAuth access token.');
    }

    switch (action) {
      case 'send_email': {
        const rawMessage = this.buildRawMessage(params);
        const response = await this.request(
          '/users/me/messages/send',
          token,
          {
            method: 'POST',
            body: JSON.stringify({ raw: rawMessage }),
            headers: { 'Content-Type': 'application/json' },
          },
        );

        return this.normalize('email', {
          id: response.id,
          thread_id: response.threadId,
          label_ids: response.labelIds,
          created_at: new Date().toISOString(),
          subject: params.subject,
          to: params.to,
          from: params.from,
          snippet: response.snippet,
          url: `https://mail.google.com/mail/u/0/#inbox/${response.id}`,
        });
      }

      case 'list_messages': {
        const response = await this.request(
          '/users/me/messages',
          token,
          {
            method: 'GET',
            query: {
              maxResults: params.maxResults ?? 10,
              q: params.query,
              labelIds: params.labelIds,
            },
          },
        );

        const messages = Array.isArray(response.messages)
          ? response.messages
          : [];

        const detailed = await Promise.all(
          messages.map(async (message: any) => {
            const details = await this.request(
              `/users/me/messages/${message.id}`,
              token,
              { method: 'GET', query: { format: 'metadata' } },
            );

            return this.normalize('email', {
              id: details.id,
              thread_id: details.threadId,
              subject: this.header(details, 'Subject'),
              from: this.header(details, 'From'),
              to: this.header(details, 'To'),
              snippet: details.snippet,
              created_at: details.internalDate
                ? new Date(Number(details.internalDate)).toISOString()
                : undefined,
              url: `https://mail.google.com/mail/u/0/#inbox/${details.id}`,
            });
          }),
        );

        return detailed;
      }

      default:
        throw new Error(`Unsupported Gmail action "${action}".`);
    }
  }

  schema(): ConnectorSchema {
    return {
      type: 'email',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'thread_id', type: 'string' },
        { name: 'subject', type: 'string' },
        { name: 'from', type: 'string' },
        { name: 'to', type: 'string' },
        { name: 'snippet', type: 'string' },
        { name: 'label_ids', type: 'array' },
        { name: 'created_at', type: 'datetime' },
        { name: 'url', type: 'string' },
      ],
    };
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'send_email',
        description: 'Send an email with Gmail',
        inputSchema: {
          type: 'object',
          required: ['to', 'subject', 'body'],
          properties: {
            to: {
              anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            },
            cc: {
              anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            },
            bcc: {
              anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            },
            subject: { type: 'string' },
            body: { type: 'string' },
            from: { type: 'string' },
          },
        },
      },
      {
        name: 'list_messages',
        description: 'List Gmail messages with optional query filters',
        inputSchema: {
          type: 'object',
          properties: {
            maxResults: { type: 'integer', minimum: 1, maximum: 100 },
            query: { type: 'string' },
            labelIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    ];
  }

  private buildRawMessage(
    params: Record<string, unknown>,
  ): string {
    const headers: string[] = [];
    const addHeader = (key: string, value?: unknown) => {
      if (!value) return;

      if (Array.isArray(value)) {
        headers.push(`${key}: ${value.join(', ')}`);
      } else {
        headers.push(`${key}: ${value}`);
      }
    };

    addHeader('To', params.to);
    addHeader('Cc', params.cc);
    addHeader('Bcc', params.bcc);
    addHeader('Subject', params.subject);
    addHeader('From', params.from);
    addHeader('Content-Type', 'text/html; charset="UTF-8"');

    const message = `${headers.join('\r\n')}\r\n\r\n${params.body ?? ''}`;
    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private header(payload: any, name: string): string | undefined {
    const headers = payload?.payload?.headers;

    if (!Array.isArray(headers)) {
      return undefined;
    }

    const header = headers.find(
      (item: any) => item?.name?.toLowerCase() === name.toLowerCase(),
    );

    return header?.value;
  }

  private async request(
    path: string,
    token: string,
    init: {
      method: string;
      body?: string;
      headers?: Record<string, string>;
      query?: Record<string, unknown>;
    },
  ): Promise<any> {
    const url = new URL(`${GMAIL_API_BASE}${path}`);

    if (init.query) {
      Object.entries(init.query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) {
          value.forEach((item) =>
            url.searchParams.append(key, String(item)),
          );
          return;
        }

        url.searchParams.append(key, String(value));
      });
    }

    const response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
      body: init.body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Gmail API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): GmailConnector => new GmailConnector(deps);

export type { GmailConnector };
