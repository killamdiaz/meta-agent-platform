import { ragAnswer } from '../../../services/RagService.js';
import { buildCitationFooter } from './citationBuilder.js';
import { recordSlackMessage } from '../utils/slackThreadMemoryAdapter.js';
import type { SlackConnectorClient } from '../client/slackClient.js';

export interface RagHandlerInput {
  orgId: string;
  accountId?: string;
  channel: string;
  user?: string;
  text: string;
  threadTs?: string;
  slackClient: SlackConnectorClient;
}

export async function handleRagMessage(payload: RagHandlerInput) {
  const answer = await ragAnswer({
    orgId: payload.orgId,
    accountId: payload.accountId,
    question: payload.text,
    sources: ['slack'],
    threadId: payload.threadTs,
  });

  const footer = buildCitationFooter(answer.citations);
  const reply = `${answer.answer}${footer}`;

  await payload.slackClient.postMessage({
    channel: payload.channel,
    text: reply,
    thread_ts: payload.threadTs,
  });

  await recordSlackMessage(
    {
      text: payload.text,
      user: payload.user,
      channel: payload.channel,
      thread_ts: payload.threadTs,
    },
    { orgId: payload.orgId, accountId: payload.accountId },
  );

  await recordSlackMessage(
    {
      text: reply,
      user: 'forge-bot',
      channel: payload.channel,
      thread_ts: payload.threadTs,
    },
    { orgId: payload.orgId, accountId: payload.accountId },
  );
}
