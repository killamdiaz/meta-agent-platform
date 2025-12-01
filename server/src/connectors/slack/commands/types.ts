import type { SlackConnectorClient } from '../client/slackClient.js';

export interface SlackCommandContext {
  orgId: string;
  accountId?: string | null;
  channel: string;
  user?: string;
  text: string;
  threadTs?: string;
  slackClient: SlackConnectorClient;
}
