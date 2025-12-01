import { ragAnswer } from '../../../services/RagService.js';
import { SlackCommandContext } from './types.js';
import { buildCitationFooter } from '../handlers/citationBuilder.js';

export async function handleExplainCommand(ctx: SlackCommandContext) {
  const question = ctx.text.replace(/^\s*\/?explain/i, '').trim() || ctx.text;
  const answer = await ragAnswer({
    orgId: ctx.orgId,
    accountId: ctx.accountId ?? undefined,
    question,
    sources: ['slack'],
    threadId: ctx.threadTs,
  });

  await ctx.slackClient.postMessage({
    channel: ctx.channel,
    thread_ts: ctx.threadTs,
    text: `${answer.answer}${buildCitationFooter(answer.citations)}`,
  });
}
