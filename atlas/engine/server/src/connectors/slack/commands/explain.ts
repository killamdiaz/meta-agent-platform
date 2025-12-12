import { ragAnswer } from '../../../services/RagService.js';
import { SlackCommandContext } from './types.js';
import { buildCitationFooter } from '../handlers/citationBuilder.js';
import { appendUsageBlock, extractAndLogUsage } from '../utils/usageTracker.js';

export async function handleExplainCommand(ctx: SlackCommandContext) {
  const question = ctx.text.replace(/^\s*\/?explain/i, '').trim() || ctx.text;
  const answer = await ragAnswer({
    orgId: ctx.orgId,
    accountId: ctx.accountId ?? undefined,
    question,
    sources: ['slack'],
    threadId: ctx.threadTs,
  });

  const reply = `${answer.answer}${buildCitationFooter(answer.citations)}`;
  const usageWrapped = appendUsageBlock(reply, {
    tokens_prompt: answer.usage.prompt_tokens,
    tokens_completion: answer.usage.completion_tokens,
    tokens_total: answer.usage.total_tokens,
    images_generated: 0,
    actions_triggered: [{ type: 'retrieval', details: 'explain command' }],
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
