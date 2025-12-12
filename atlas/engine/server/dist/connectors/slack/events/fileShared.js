import { handleAttachment } from '../handlers/attachmentHandler.js';
export async function handleFileShared(event, ctx) {
    await handleAttachment(event, { orgId: ctx.orgId, accountId: ctx.accountId, botToken: ctx.botToken });
}
