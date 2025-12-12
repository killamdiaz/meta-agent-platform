import type { AgentMessage } from '../MessageBroker.js';
import { AtlasModuleAgent, type AtlasModuleAgentOptions } from './AtlasModuleAgent.js';

const SUMMARISE_ENDPOINT = '/atlas-ai-agent';
const INGEST_ENDPOINT = '/atlas-ai-ingest';

export interface AISummarizerAgentOptions extends Omit<AtlasModuleAgentOptions, 'endpoints'> {}

export class AISummarizerAgent extends AtlasModuleAgent {
  constructor(options: AISummarizerAgentOptions) {
    super({
      ...options,
      role: options.role ?? 'Atlas AI Summarizer Agent',
      description:
        options.description ??
        'Summarises documents, transcripts, and conversation threads. Publishes insights via Atlas Bridge notifications.',
      endpoints: [SUMMARISE_ENDPOINT, INGEST_ENDPOINT, '/bridge-notify'],
    });
  }

  protected override async handleOperationalMessage(message: AgentMessage): Promise<void> {
    const content = message.content.trim();
    if (!content) {
      await this.sendMessage(
        message.from,
        'response',
        'Provide text or a document reference for me to summarise.',
        { intent: 'summarizer_missing_content' },
      );
      return;
    }

    const summary = await this.postAtlas<{ summary?: string }>(SUMMARISE_ENDPOINT, {
      content,
      metadata: message.metadata ?? {},
    });

    if (!summary?.summary) {
      await this.sendMessage(
        message.from,
        'response',
        'I could not generate a summary from the provided content.',
        { intent: 'summarizer_failed' },
      );
      return;
    }

    await this.sendMessage(
      message.from,
      'response',
      summary.summary,
      {
        intent: 'summarizer_complete',
        payload: summary,
      },
    );

    await this.notifyAtlas('ai_summary', 'New Summary', summary.summary.slice(0, 140), {
      sourceAgent: message.from,
      summary,
    });
  }

  protected override async handleContextRequest(message: AgentMessage): Promise<void> {
    const payload = this.getMessagePayload<Record<string, unknown>>(message);
    if (payload?.ingest) {
      await this.postAtlas(INGEST_ENDPOINT, payload.ingest);
      await this.sendMessage(
        message.from,
        'response',
        'Document acknowledged for ingestion.',
        { intent: 'summarizer_ingest_ack' },
      );
      return;
    }
    await this.sendMessage(
      message.from,
      'response',
      'Summarizer ready. Provide `ingest` payload to store reference material.',
      { intent: 'summarizer_no_context' },
    );
  }
}
