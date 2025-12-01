import { chatCompletion } from '../../../services/ModelRouterWrapper.js';
import { SlackCommandContext } from './types.js';

export async function handleFormatCommand(ctx: SlackCommandContext) {
  const cleaned = ctx.text.replace(/^\s*\/?format/i, '').trim();

  const completion = await chatCompletion({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Rewrite the message for clarity and brevity. Return plain text suitable for Slack.' },
      { role: 'user', content: cleaned || ctx.text },
    ],
    temperature: 0.3,
    org_id: ctx.orgId,
    account_id: ctx.accountId,
    user_id: ctx.user,
    source: 'slack',
    agent_name: 'SlackFormatCommand',
  });

  await ctx.slackClient.postMessage({
    channel: ctx.channel,
    thread_ts: ctx.threadTs,
    text: completion.content ?? 'No formatted text generated.',
  });
}
