import { ragAnswer } from '../../../services/RagService.js';
import { buildCitationFooter } from './citationBuilder.js';
import { recordSlackMessage } from '../utils/slackThreadMemoryAdapter.js';
import { appendUsageBlock, extractAndLogUsage } from '../utils/usageTracker.js';
export async function handleRagMessage(payload) {
    const slackMeta = {
        team_id: payload.slackMetadata?.team_id ?? undefined,
        user_id: payload.slackMetadata?.user_id ?? payload.user,
        channel_id: payload.slackMetadata?.channel_id ?? payload.channel,
        event_type: payload.slackMetadata?.event_type ?? 'message',
        org_id: payload.orgId,
        account_id: payload.accountId,
    };
    const answer = await ragAnswer({
        orgId: payload.orgId,
        accountId: payload.accountId,
        question: payload.text,
        sources: ['slack'],
        threadId: payload.threadTs,
    });
    const footer = buildCitationFooter(answer.citations);
    const hasSourcesSection = typeof answer.answer === 'string' && answer.answer.toLowerCase().includes('sources:');
    const reply = hasSourcesSection ? answer.answer : `${answer.answer}${footer}`;
    const usagePayload = {
        tokens_prompt: answer.usage.prompt_tokens,
        tokens_completion: answer.usage.completion_tokens,
        tokens_total: answer.usage.total_tokens,
        images_generated: 0,
        actions_triggered: [{ type: 'retrieval', details: 'rag_answer' }],
        slack_metadata: slackMeta,
    };
    const withUsage = appendUsageBlock(reply, usagePayload);
    await payload.slackClient.postMessage({
        channel: payload.channel,
        text: withUsage.text,
        blocks: withUsage.blocks,
        thread_ts: payload.threadTs,
    });
    await recordSlackMessage({
        text: payload.text,
        user: payload.user,
        channel: payload.channel,
        thread_ts: payload.threadTs,
    }, { orgId: payload.orgId, accountId: payload.accountId });
    await recordSlackMessage({
        text: reply,
        user: 'forge-bot',
        channel: payload.channel,
        thread_ts: payload.threadTs,
    }, { orgId: payload.orgId, accountId: payload.accountId });
    await extractAndLogUsage(withUsage.text, slackMeta);
}
