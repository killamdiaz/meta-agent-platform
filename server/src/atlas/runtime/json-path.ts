export function getJsonPath(payload: any, path: string) {
  if (!path || path === '$') return payload;
  const normalized = path.replace(/^\$\./, '');
  const parts = normalized.split('.').flatMap((segment) => segment.split(/\[|\]/).filter(Boolean));
  return parts.reduce((acc: any, part: string) => {
    if (acc === undefined || acc === null) return undefined;
    const key = Number.isNaN(Number(part)) ? part : Number(part);
    return acc[key as keyof typeof acc];
  }, payload);
}

