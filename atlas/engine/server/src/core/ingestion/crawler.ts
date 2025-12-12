import axios from 'axios';
import * as cheerio from 'cheerio';
import type { IngestionRecord } from './index.js';
import { storeEmbeddings } from './index.js';

export async function crawlAndIngest(
  url: string,
  record: Omit<IngestionRecord, 'content' | 'sourceId'> & { sourceType?: string },
) {
  const response = await axios.get(url, { timeout: 15000 });
  const html = typeof response.data === 'string' ? response.data : '';
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  if (!text) return;

  const payload: IngestionRecord = {
    ...record,
    sourceType: record.sourceType ?? 'crawler',
    sourceId: url,
    metadata: { ...(record.metadata ?? {}), url },
    content: text,
  };
  await storeEmbeddings([payload]);
}
