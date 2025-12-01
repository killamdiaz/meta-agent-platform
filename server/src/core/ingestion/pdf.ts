import type { IngestionRecord } from './index.js';
import { storeEmbeddings } from './index.js';

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = await import('pdf-parse');
    const parsed = await pdfParse.default(buffer);
    if (parsed?.text) {
      return String(parsed.text);
    }
  } catch (error) {
    console.warn('[ingestion:pdf] pdf-parse unavailable, falling back to utf8 decode', error);
  }
  return buffer.toString('utf8');
}

export async function ingestPdf(buffer: Buffer, record: Omit<IngestionRecord, 'content' | 'sourceType'> & { sourceType?: string }) {
  const text = await extractPdfText(buffer);
  if (!text?.trim()) return;
  const payload: IngestionRecord = {
    ...record,
    sourceType: record.sourceType ?? 'filesystem',
    metadata: { ...(record.metadata ?? {}), mime: 'application/pdf' },
    content: text,
  };
  await storeEmbeddings([payload]);
}
