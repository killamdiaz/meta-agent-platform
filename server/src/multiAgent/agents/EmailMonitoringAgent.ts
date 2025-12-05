import type { AgentMessage } from '../MessageBroker.js';
import { AtlasModuleAgent, type AtlasModuleAgentOptions } from './AtlasModuleAgent.js';

const FETCH_EMAILS_ENDPOINT = '/gmail-fetch-emails';
const EMAIL_ACTIONS_ENDPOINT = '/gmail-actions';

interface EmailQueryPayload {
  query?: string;
  since?: string;
}

export interface EmailMonitoringAgentOptions extends Omit<AtlasModuleAgentOptions, 'endpoints'> {}

export class EmailMonitoringAgent extends AtlasModuleAgent {
  constructor(options: EmailMonitoringAgentOptions) {
    super({
      ...options,
      role: options.role ?? 'Atlas Email Monitoring Agent',
      description:
        options.description ??
        'Scans Gmail for actionable signals, triggers task creation, and collaborates with FinanceAgent for invoicing clues.',
      endpoints: [FETCH_EMAILS_ENDPOINT, EMAIL_ACTIONS_ENDPOINT, '/bridge-tasks', '/bridge-notify'],
    });
  }

  protected override async handleOperationalMessage(message: AgentMessage): Promise<void> {
    const payload = this.extractQuery(message);
    const emails = await this.fetchAtlas<Record<string, unknown>[]>(FETCH_EMAILS_ENDPOINT, {
      query: payload.query ?? 'inbox',
      since: payload.since,
    });
    if (!emails) {
      await this.sendMessage(
        message.from,
        'response',
        'Unable to scan the inbox right now.',
        { intent: 'email_scan_failed' },
      );
      return;
    }

    const alerts = this.findFinanceAlerts(emails);
    if (alerts.length > 0) {
      await this.requestHelp('FinanceAgent', {
        query: 'Review potential financial emails',
        messages: alerts,
        requester: this.id,
      });
    }

    await this.sendMessage(
      message.from,
      'response',
      `Fetched ${emails.length} emails matching the query.`,
      {
        intent: 'email_scan_complete',
        payload: emails.slice(0, 5),
      },
    );
  }

  protected override async handleContextRequest(message: AgentMessage): Promise<void> {
    const payload = this.extractQuery(message);
    const emails = await this.fetchAtlas<Record<string, unknown>[]>(FETCH_EMAILS_ENDPOINT, {
      query: payload.query ?? 'label:unread',
      since: payload.since,
    });
    if (!emails) {
      await this.sendMessage(
        message.from,
        'response',
        'Unable to retrieve email context at this moment.',
        { intent: 'email_context_unavailable' },
      );
      return;
    }
    await this.sendContextResponse(
      message.from,
      emails,
      `Email context prepared for ${message.from}.`,
      { responder: this.id, query: payload.query },
    );
  }

  private extractQuery(message: AgentMessage): EmailQueryPayload {
    const payload = this.getMessagePayload<EmailQueryPayload>(message);
    if (payload) {
      return payload;
    }
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    if (metadata && typeof metadata === 'object') {
      return {
        query: typeof metadata.query === 'string' ? metadata.query : undefined,
        since: typeof metadata.since === 'string' ? metadata.since : undefined,
      };
    }
    return {};
  }

  private findFinanceAlerts(emails: Record<string, unknown>[]): Record<string, unknown>[] {
    return emails.filter((email) => {
      const subject = typeof email.subject === 'string' ? email.subject.toLowerCase() : '';
      const body = typeof email.body === 'string' ? email.body.toLowerCase() : '';
      return subject.includes('invoice') || body.includes('invoice') || body.includes('payment');
    });
  }
}
