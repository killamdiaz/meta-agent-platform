import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const manifest = manifestJson as ConnectorManifest;

class HubSpotConnector extends BaseConnector {
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
      throw new Error('HubSpot connector requires an OAuth access token.');
    }

    switch (action) {
      case 'list_contacts': {
        const response = await this.request(
          '/crm/v3/objects/contacts',
          token,
          {
            method: 'GET',
            query: {
              limit: params.limit ?? 20,
              properties: 'firstname,lastname,email,phone,createdate,lastmodifieddate',
            },
          },
        );

        const results = Array.isArray(response.results)
          ? response.results
          : [];

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'contact',
          results.map((contact: any) => ({
            fields: {
              id: contact.id,
              email: contact.properties?.email,
              first_name: contact.properties?.firstname,
              last_name: contact.properties?.lastname,
              phone: contact.properties?.phone,
              created_at: contact.properties?.createdate,
              updated_at: contact.properties?.lastmodifieddate,
              url: `https://app.hubspot.com/contacts/${contact.id}`,
            },
            raw: contact,
          })),
        );
      }

      case 'create_deal': {
        const properties = params.properties as Record<string, unknown>;

        if (!properties) {
          throw new Error('create_deal requires a properties object.');
        }

        const response = await this.request(
          '/crm/v3/objects/deals',
          token,
          {
            method: 'POST',
            body: { properties },
          },
        );

        return this.normalize('deal', {
          id: response.id,
          name: response.properties?.dealname,
          stage: response.properties?.dealstage,
          amount: response.properties?.amount,
          pipeline: response.properties?.pipeline,
          created_at: response.properties?.createdate,
          updated_at: response.properties?.hs_lastmodifieddate,
          url: `https://app.hubspot.com/contacts/deal/${response.id}`,
        }, response);
      }

      default:
        throw new Error(`Unsupported HubSpot action "${action}".`);
    }
  }

  schema(): ConnectorSchema[] {
    return [
      {
        type: 'contact',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'email', type: 'string' },
          { name: 'first_name', type: 'string' },
          { name: 'last_name', type: 'string' },
          { name: 'phone', type: 'string' },
          { name: 'created_at', type: 'datetime' },
          { name: 'updated_at', type: 'datetime' },
          { name: 'url', type: 'string' },
        ],
      },
      {
        type: 'deal',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'name', type: 'string' },
          { name: 'stage', type: 'string' },
          { name: 'amount', type: 'string' },
          { name: 'pipeline', type: 'string' },
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
        name: 'list_contacts',
        description: 'List HubSpot contacts with basic profile information',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
        },
      },
      {
        name: 'create_deal',
        description: 'Create a new HubSpot deal with supplied properties',
        inputSchema: {
          type: 'object',
          required: ['properties'],
          properties: {
            properties: { type: 'object' },
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
    const url = new URL(`${HUBSPOT_API_BASE}${path}`);

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
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `HubSpot API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): HubSpotConnector => new HubSpotConnector(deps);

export type { HubSpotConnector };
