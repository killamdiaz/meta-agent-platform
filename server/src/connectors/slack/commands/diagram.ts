import { chatCompletion } from '../../../services/ModelRouterWrapper.js';
import { SlackCommandContext } from './types.js';

export async function handleDiagramCommand(ctx: SlackCommandContext) {
  const cleaned = ctx.text.replace(/^\s*\/?diagram/i, '').trim();

  const completion = await chatCompletion({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Return only a fenced ```mermaid``` block representing the flow described.' },
      { role: 'user', content: cleaned || ctx.text },
    ],
    temperature: 0.2,
    org_id: ctx.orgId,
    account_id: ctx.accountId,
    user_id: ctx.user,
    source: 'slack',
    agent_name: 'SlackDiagramCommand',
  });

  await ctx.slackClient.postMessage({
    channel: ctx.channel,
    thread_ts: ctx.threadTs,
    text: completion.content ?? 'No diagram generated.',
  });
}
