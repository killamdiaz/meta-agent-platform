import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

export type PermissionMap = Record<string, string[]>;

let cachedPermissions: PermissionMap | null = null;

function parseSimpleYaml(content: string): PermissionMap {
  const lines = content.split(/\r?\n/);
  const result: PermissionMap = {};
  let currentKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.trim().startsWith('#')) {
      continue;
    }

    if (!line.startsWith('-') && line.includes(':')) {
      const [key] = line.split(':');
      currentKey = key.trim();
      if (!result[currentKey]) {
        result[currentKey] = [];
      }
      continue;
    }

    if (line.trimStart().startsWith('-')) {
      if (!currentKey) {
        continue;
      }
      const value = line.replace(/^-\s*/, '').trim();
      if (value) {
        result[currentKey].push(value);
      }
    }
  }

  return result;
}

export function loadPermissionMap(): PermissionMap {
  if (cachedPermissions) {
    return cachedPermissions;
  }

  const filePath = fileURLToPath(new URL('./permissions.yaml', import.meta.url));
  const content = readFileSync(filePath, 'utf-8');
  cachedPermissions = parseSimpleYaml(content);
  return cachedPermissions;
}
