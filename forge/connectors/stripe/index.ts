import { BaseConnector, BaseConnectorDependencies } from '../BaseConnector';
import type {
  ConnectorAction,
  ConnectorContext,
  ConnectorQueryResponse,
  ConnectorSchema,
  ConnectorManifest,
} from '../types';
import manifestJson from './manifest.json';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const manifest = manifestJson as ConnectorManifest;

class StripeConnector extends BaseConnector {
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
      throw new Error('Stripe connector requires an API key.');
    }

    switch (action) {
      case 'list_customers': {
        const response = await this.request('/customers', apiKey, {
          method: 'GET',
          query: {
            limit: params.limit ?? 10,
            email: params.email,
          },
        });

        return this.schemaNormalizer.normalizeList(
          this.options.name,
          'customer',
          response.data.map((customer: any) => ({
            fields: {
              id: customer.id,
              email: customer.email,
              name: customer.name,
              created_at: customer.created
                ? new Date(customer.created * 1000).toISOString()
                : undefined,
              currency: customer.currency,
            },
            raw: customer,
          })),
        );
      }

      case 'create_payment_intent': {
        const amount = params.amount;
        const currency = params.currency;

        if (typeof amount !== 'number' || !currency) {
          throw new Error(
            'create_payment_intent requires amount (number) and currency.',
          );
        }

        const response = await this.request(
          '/payment_intents',
          apiKey,
          {
            method: 'POST',
            body: {
              amount: Math.round(amount),
              currency,
              customer: params.customer,
              automatic_payment_methods: { enabled: true },
              description: params.description,
            },
          },
        );

        return this.normalize('payment_intent', {
          id: response.id,
          amount: response.amount,
          currency: response.currency,
          status: response.status,
          customer: response.customer,
          created_at: response.created
            ? new Date(response.created * 1000).toISOString()
            : undefined,
          client_secret: response.client_secret,
        }, response);
      }

      default:
        throw new Error(`Unsupported Stripe action "${action}".`);
    }
  }

  schema(): ConnectorSchema[] {
    return [
      {
        type: 'customer',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'email', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'created_at', type: 'datetime' },
          { name: 'currency', type: 'string' },
        ],
      },
      {
        type: 'payment_intent',
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'amount', type: 'number', required: true },
          { name: 'currency', type: 'string', required: true },
          { name: 'status', type: 'string' },
          { name: 'customer', type: 'string' },
          { name: 'client_secret', type: 'string' },
          { name: 'created_at', type: 'datetime' },
        ],
      },
    ];
  }

  actions(): ConnectorAction[] {
    return [
      {
        name: 'list_customers',
        description: 'List Stripe customers with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            email: { type: 'string' },
          },
        },
      },
      {
        name: 'create_payment_intent',
        description: 'Create a Stripe payment intent',
        inputSchema: {
          type: 'object',
          required: ['amount', 'currency'],
          properties: {
            amount: { type: 'number' },
            currency: { type: 'string' },
            customer: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
    ];
  }

  private async request(
    path: string,
    apiKey: string,
    init: {
      method: 'GET' | 'POST';
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
    },
  ): Promise<any> {
    const url = new URL(`${STRIPE_API_BASE}${path}`);

    if (init.query) {
      Object.entries(init.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    let body: string | undefined;
    let headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };

    if (init.body) {
      body = this.toFormEncoded(init.body);
      headers = {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
    }

    const response = await fetch(url, {
      method: init.method,
      headers,
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Stripe API ${response.status}: ${error || response.statusText}`,
      );
    }

    return response.json();
  }

  private toFormEncoded(payload: Record<string, unknown>): string {
    const parts: string[] = [];

    const append = (key: string, value: unknown) => {
      if (value === undefined || value === null) return;

      if (typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          append(`${key}[${nestedKey}]`, nestedValue);
        });
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          append(`${key}[${index}]`, item);
        });
        return;
      }

      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      );
    };

    Object.entries(payload).forEach(([key, value]) => append(key, value));
    return parts.join('&');
  }
}

export const createConnector = (
  deps?: BaseConnectorDependencies,
): StripeConnector => new StripeConnector(deps);

export type { StripeConnector };
