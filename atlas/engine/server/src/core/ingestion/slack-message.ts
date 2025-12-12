import type { IngestionRecord } from './index.js';
import { storeEmbeddings } from './index.js';

export interface SlackMessageLike {
  text?: string;
  user?: string;
  channel?: string;
  thread_ts?: string;
  ts?: string;
  blocks?: unknown;
  attachments?: unknown;
}

function collectTextFragments(source: unknown, output: string[], depth = 0) {
  if (!source || depth > 6) return;
  if (typeof source === 'string') {
    const fragment = source.replace(/\s+/g, ' ').trim();
    if (fragment) {
      output.push(fragment);
    }
    return;
  }
  if (Array.isArray(source)) {
    source.forEach((item) => collectTextFragments(item, output, depth + 1));
    return;
  }
  if (typeof source === 'object') {
    const record = source as Record<string, unknown>;
    if (typeof record.text === 'string') {
      const fragment = record.text.replace(/\s+/g, ' ').trim();
      if (fragment) {
        output.push(fragment);
      }
    }
    if (Array.isArray(record.elements)) {
      collectTextFragments(record.elements, output, depth + 1);
    }
    if (Array.isArray(record.fields)) {
      collectTextFragments(record.fields, output, depth + 1);
    }
    Object.entries(record).forEach(([key, value]) => {
      if (key === 'text' || key === 'elements' || key === 'fields') return;
      collectTextFragments(value, output, depth + 1);
    });
  }
}

function renderSlackMessage(message: SlackMessageLike) {
  const fragments: string[] = [];
  if (message.text) {
    fragments.push(message.text);
  }
  collectTextFragments(message.blocks, fragments);
  collectTextFragments(message.attachments, fragments);
  return fragments
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .join(' ');
}

export async function ingestSlackMessage(
  message: SlackMessageLike,
  record: Omit<IngestionRecord, 'content' | 'sourceType' | 'sourceId'> & { sourceType?: string; sourceId?: string },
) {
  const content = renderSlackMessage(message);
  if (!content) return;

  const payload: IngestionRecord = {
    ...record,
    sourceType: record.sourceType ?? 'slack',
    sourceId: record.sourceId ?? `${message.channel ?? 'unknown'}/${message.thread_ts ?? message.ts ?? 'root'}`,
    metadata: {
      ...(record.metadata ?? {}),
      channel: message.channel,
      user: message.user,
      thread_ts: message.thread_ts ?? message.ts,
    },
    content,
  };

  await storeEmbeddings([payload]);
}
