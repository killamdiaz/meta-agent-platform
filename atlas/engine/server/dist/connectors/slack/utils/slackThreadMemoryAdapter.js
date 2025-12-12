import { ingestSlackMessage } from '../../../core/ingestion/slack-message.js';
export async function recordSlackMessage(message, context) {
    if (!context.orgId)
        return;
    await ingestSlackMessage(message, {
        orgId: context.orgId,
        accountId: context.accountId,
        visibilityScope: context.visibilityScope ?? 'org',
    });
}
