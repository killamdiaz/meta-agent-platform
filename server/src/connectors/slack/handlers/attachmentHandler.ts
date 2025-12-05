import axios from 'axios';
import { ingestPdf } from '../../../core/ingestion/pdf.js';
import { ingestDocx } from '../../../core/ingestion/docx.js';
import { ingestPptx } from '../../../core/ingestion/pptx.js';
import { storeEmbeddings, type IngestionRecord } from '../../../core/ingestion/index.js';

export interface SlackFileSharedEvent {
  file?: {
    id?: string;
    name?: string;
    mimetype?: string;
    url_private_download?: string;
    title?: string;
  };
  user?: string;
  channel_id?: string;
}

export interface AttachmentContext {
  orgId: string;
  accountId?: string;
  botToken: string;
}

async function downloadFile(url: string, token: string): Promise<Buffer | null> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${token}` },
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.warn('[slack-attachment] failed to download file', error);
    return null;
  }
}

export async function handleAttachment(event: SlackFileSharedEvent, ctx: AttachmentContext) {
  const file = event.file;
  if (!file) return;

  const buffer =
    file.url_private_download && ctx.botToken ? await downloadFile(file.url_private_download, ctx.botToken) : null;
  const baseRecord: Omit<IngestionRecord, 'content' | 'sourceType'> = {
    orgId: ctx.orgId,
    accountId: ctx.accountId,
    sourceId: file.id ?? `${event.channel_id ?? 'channel'}/${file.name ?? 'file'}`,
    metadata: {
      channel: event.channel_id,
      user: event.user,
      file_id: file.id,
      name: file.name,
      mimetype: file.mimetype,
    },
    visibilityScope: 'org',
  };

  const mime = file.mimetype ?? '';
  if (buffer) {
    if (mime.includes('pdf')) {
      await ingestPdf(buffer, { ...baseRecord, sourceType: 'slack' });
      return;
    }
    if (mime.includes('word') || mime.includes('docx')) {
      await ingestDocx(buffer, { ...baseRecord, sourceType: 'slack' });
      return;
    }
    if (mime.includes('presentation') || mime.includes('ppt')) {
      await ingestPptx(buffer, { ...baseRecord, sourceType: 'slack' });
      return;
    }
  }

  const fallbackContent = [
    `Slack file shared: ${file.name ?? 'attachment'}`,
    file.title ? `Title: ${file.title}` : '',
    file.mimetype ? `Type: ${file.mimetype}` : '',
    file.url_private_download ? `Download: ${file.url_private_download}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  await storeEmbeddings([
    {
      ...baseRecord,
      sourceType: 'slack',
      content: fallbackContent,
    },
  ]);
}
