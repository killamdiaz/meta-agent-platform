import type { IngestionRecord } from './index.js';
import { storeEmbeddings } from './index.js';

async function extractPptxText(buffer: Buffer): Promise<string> {
  try {
    const pptxText = await import('pptx-parser');
    const slides = await pptxText.default(buffer);
    if (Array.isArray(slides)) {
      return slides
        .map((slide) => {
          if (typeof slide?.text === 'string') return slide.text;
          if (Array.isArray(slide?.texts)) return slide.texts.join(' ');
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
  } catch (error) {
    console.warn('[ingestion:pptx] pptx-parser unavailable, falling back to utf8 decode', error);
  }
  return buffer.toString('utf8');
}

export async function ingestPptx(buffer: Buffer, record: Omit<IngestionRecord, 'content' | 'sourceType'> & { sourceType?: string }) {
  const text = await extractPptxText(buffer);
  if (!text?.trim()) return;
  const payload: IngestionRecord = {
    ...record,
    sourceType: record.sourceType ?? 'filesystem',
    metadata: { ...(record.metadata ?? {}), mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    content: text,
  };
  await storeEmbeddings([payload]);
}
