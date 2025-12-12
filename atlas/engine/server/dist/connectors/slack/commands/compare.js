import { chatCompletion } from '../../../services/ModelRouterWrapper.js';
import { appendUsageBlock, extractAndLogUsage } from '../utils/usageTracker.js';
export async function handleCompareCommand(ctx) {
    const cleaned = ctx.text.replace(/^\s*\/?compare/i, '').trim();
    const prompt = cleaned || ctx.text;
    const completion = await chatCompletion({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
            {
                role: 'user',
                content: `Compare the following items and return concise bullets with pros/cons:\n${prompt}`,
            },
        ],
        temperature: 0.3,
        org_id: ctx.orgId,
        account_id: ctx.accountId,
        user_id: ctx.user,
        source: 'slack',
        agent_name: 'SlackCompareCommand',
    });
    const usageWrapped = appendUsageBlock(completion.content ?? 'No comparison generated.', {
        tokens_prompt: completion.usage.prompt_tokens,
        tokens_completion: completion.usage.completion_tokens,
        tokens_total: completion.usage.total_tokens,
        images_generated: 0,
        actions_triggered: [{ type: 'compare', details: 'Slack compare command' }],
        slack_metadata: {
            team_id: ctx.teamId,
            user_id: ctx.user,
            channel_id: ctx.channel,
            event_type: ctx.eventType,
            org_id: ctx.orgId,
            account_id: ctx.accountId ?? null,
        },
    });
    await ctx.slackClient.postMessage({
        channel: ctx.channel,
        thread_ts: ctx.threadTs,
        ...usageWrapped,
    });
    await extractAndLogUsage(usageWrapped.text, {
        team_id: ctx.teamId,
        user_id: ctx.user,
        channel_id: ctx.channel,
        event_type: ctx.eventType,
        org_id: ctx.orgId,
        account_id: ctx.accountId ?? null,
    });
}
