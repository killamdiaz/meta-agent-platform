import type { AgentMessage } from '../../multiAgent/MessageBroker.js';
import { BaseAgent, type BaseAgentOptions } from '../../multiAgent/BaseAgent.js';
import { GmailClient, createGmailClientFromConfig } from './GmailClient.js';

interface MailAgentOptions extends BaseAgentOptions {
  config: Record<string, unknown>;
}

export class MailAgent extends BaseAgent {
  private readonly gmail: GmailClient;

  constructor({ config, ...baseOptions }: MailAgentOptions) {
    const role = baseOptions.role?.trim() || 'Inbox Orchestrator';
    const description =
      baseOptions.description ??
      'Gmail integration agent. Summarises inbox threads and sends follow-up emails on behalf of the team.';
    super({
      ...baseOptions,
      role,
      description,
    });
    this.gmail = createGmailClientFromConfig(config);
    this.startAutonomy(15000);
  }

  protected override async processMessage(message: AgentMessage): Promise<void> {
    if (message.type === 'task') {
      await this.handleOutboundMail(message);
      return;
    }

    const latest = await this.gmail.listMessages(3);
    await this.sendMessage(message.from, 'response', `Fetched ${latest.length} recent emails from the monitored label.`, {
      origin: this.id,
      emails: latest,
    });
  }

  protected override async think(): Promise<void> {
    const latest = await this.gmail.listMessages(1);
    if (!latest.length) return;
    const [message] = latest;
    await this.sendMessage('*', 'question', `New email detected (id: ${message.id}). Should we respond?`, {
      origin: this.id,
      autonomy: {
        askAgents: ['StrategyAgent'],
        escalateTo: ['CoordinatorAgent'],
      },
    });
  }

  private async handleOutboundMail(message: AgentMessage) {
    const metadata = message.metadata ?? {};
    const to = typeof metadata.to === 'string' ? metadata.to : undefined;
    const subject = typeof metadata.subject === 'string' ? metadata.subject : 'Automated update';
    if (!to) {
      await this.sendMessage(message.from, 'response', 'Missing recipient in metadata.', {
        origin: this.id,
        status: 'error',
      });
      return;
    }
    await this.gmail.sendMessage({
      to,
      subject,
      body: message.content,
    });
    await this.sendMessage(message.from, 'response', `Email sent to ${to}.`, {
      origin: this.id,
      status: 'sent',
    });
  }
}
