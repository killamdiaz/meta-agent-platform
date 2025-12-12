const DEFAULT_EMBEDDING_DIMENSION = 3072;

export function normalizeContent(content: string) {
  return content.replace(/\s+/g, ' ').trim();
}

export function chunkText(text: string, size = 1200, overlap = 200) {
  const normalized = normalizeContent(text);
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let i = 0; i < normalized.length; i += size - overlap) {
    chunks.push(normalized.slice(i, i + size));
    if (i + size >= normalized.length) {
      break;
    }
  }
  return chunks;
}

export function deterministicEmbedding(text: string, dimension = DEFAULT_EMBEDDING_DIMENSION): number[] {
  const values = new Array(dimension).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const index = (code + i) % dimension;
    values[index] += (code % 23) / 100;
  }
  const norm = Math.sqrt(values.reduce((acc, val) => acc + val * val, 0)) || 1;
  return values.map((val) => val / norm);
}

export function toPgVector(values: number[]) {
  return `[${values.join(',')}]`;
}
