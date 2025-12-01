import { ingestSlackMessage, type SlackMessageLike } from '../../../core/ingestion/slack-message.js';

export interface SlackMemoryContext {
  orgId: string;
  accountId?: string;
  visibilityScope?: 'org' | 'account' | 'private';
}

export async function recordSlackMessage(message: SlackMessageLike, context: SlackMemoryContext) {
  if (!context.orgId) return;
  await ingestSlackMessage(message, {
    orgId: context.orgId,
    accountId: context.accountId,
    visibilityScope: context.visibilityScope ?? 'org',
  });
}
