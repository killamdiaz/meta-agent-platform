import { ConnectorName, NormalizedRecord } from '../connectors/types';

export interface NormalizeOptions {
  source: ConnectorName | string;
  type: string;
  fields: Record<string, unknown>;
  raw?: unknown;
}

export class SchemaNormalizer {
  normalize(options: NormalizeOptions): NormalizedRecord {
    const normalizedFields = this.normalizeFieldKeys(options.fields);
    return {
      source: options.source,
      type: options.type,
      fields: normalizedFields,
      raw: options.raw,
    };
  }

  normalizeList(
    source: ConnectorName | string,
    type: string,
    records: Array<{ fields: Record<string, unknown>; raw?: unknown }>,
  ): NormalizedRecord[] {
    return records.map((record) =>
      this.normalize({
        source,
        type,
        fields: record.fields,
        raw: record.raw,
      }),
    );
  }

  private normalizeFieldKeys(
    fields: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(fields)) {
      const normalizedKey = this.toSnakeCase(key);
      normalized[normalizedKey] = value;
    }

    if (!('created_at' in normalized) && 'createdTime' in fields) {
      normalized.created_at = fields.createdTime;
    }

    if (!('updated_at' in normalized) && 'lastEditedTime' in fields) {
      normalized.updated_at = fields.lastEditedTime;
    }

    return normalized;
  }

  private toSnakeCase(input: string): string {
    return input
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }
}

export const schemaNormalizer = new SchemaNormalizer();

