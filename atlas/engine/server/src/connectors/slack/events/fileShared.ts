import { handleAttachment } from '../handlers/attachmentHandler.js';

export interface FileSharedEvent {
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

export interface FileSharedContext {
  orgId: string;
  accountId?: string;
  botToken: string;
}

export async function handleFileShared(event: FileSharedEvent, ctx: FileSharedContext) {
  await handleAttachment(event, { orgId: ctx.orgId, accountId: ctx.accountId, botToken: ctx.botToken });
}
