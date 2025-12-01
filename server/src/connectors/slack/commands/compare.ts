import { chatCompletion } from '../../../services/ModelRouterWrapper.js';
import { SlackCommandContext } from './types.js';

export async function handleCompareCommand(ctx: SlackCommandContext) {
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

  await ctx.slackClient.postMessage({
    channel: ctx.channel,
    thread_ts: ctx.threadTs,
    text: completion.content ?? 'No comparison generated.',
  });
}
