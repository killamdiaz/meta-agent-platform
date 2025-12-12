import { z } from 'zod';

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export const AuthSchema = z.object({
  type: z.enum(['oauth2', 'api_key', 'basic']),
  config: z
    .object({
      authUrl: z.string().url().optional(),
      tokenUrl: z.string().url().optional(),
      scopes: z.array(z.string()).optional(),
      headerName: z.string().optional(),
      queryParam: z.string().optional(),
      usernameField: z.string().optional(),
      passwordField: z.string().optional(),
    })
    .passthrough()
    .default({}),
});

export const ConnectorManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must follow semver MAJOR.MINOR.PATCH'),
  description: z.string().min(1),
  icon: z.string().optional().default(''),
  publisher: z.string().min(1),
  category: z.string().min(1),
  auth: AuthSchema,
});

export const ResponseMappingSchema = z.record(z.string()).default({});

export const ActionSchema = z.object({
  name: z.string().min(1),
  method: HttpMethodSchema.default('GET'),
  path: z.string().min(1),
  query: z.record(z.any()).default({}),
  headers: z.record(z.any()).default({}),
  body: z.record(z.any()).default({}),
  responseMapping: ResponseMappingSchema.default({}),
});

export const TriggerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['polling', 'webhook']),
  path: z.string().optional(),
  poll: z
    .object({
      path: z.string().min(1),
      method: HttpMethodSchema.default('GET'),
      intervalMs: z.number().min(1000).max(1000 * 60 * 60).default(60000),
      cursorPath: z.string().optional(),
      sinceParam: z.string().optional(),
    })
    .optional(),
  webhook: z
    .object({
      path: z.string().min(1),
      method: HttpMethodSchema.default('POST'),
    })
    .optional(),
  responseMapping: ResponseMappingSchema.default({}),
  cursorPath: z.string().optional(),
});

export const TransformSourceSchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
});

export const ConnectorPackageSchema = z.object({
  manifest: ConnectorManifestSchema,
  actions: z.record(ActionSchema),
  triggers: z.record(TriggerSchema).default({}),
  transforms: z.record(z.string()).default({}),
});

const forbiddenTransformPatterns = [
  'require(',
  'import(',
  'process.',
  'fs.',
  'child_process',
  'eval(',
  'while(true)',
  'for(;;)',
  'setInterval(',
  'net.',
  'http.',
  'https.',
  'tcp.',
  'udp.',
];

export function validateTransformSource(name: string, source: string) {
  for (const pattern of forbiddenTransformPatterns) {
    if (source.includes(pattern)) {
      throw new Error(`Transform ${name} contains forbidden pattern: ${pattern}`);
    }
  }
  if (source.length > 16_000) {
    throw new Error(`Transform ${name} is too large`);
  }
}

export function validateNoSecretsInFiles(files: Record<string, string>) {
  const secretPatterns = [/api[_-]?key/i, /token/i, /secret/i, /password/i];
  for (const [fileName, content] of Object.entries(files)) {
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        throw new Error(`Potential secret detected in ${fileName}`);
      }
    }
  }
}
