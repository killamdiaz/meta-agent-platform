import { AtlasModuleAgent } from './AtlasModuleAgent.js';
const SUMMARISE_ENDPOINT = '/atlas-ai-agent';
const INGEST_ENDPOINT = '/atlas-ai-ingest';
export class AISummarizerAgent extends AtlasModuleAgent {
    constructor(options) {
        super({
            ...options,
            role: options.role ?? 'Atlas AI Summarizer Agent',
            description: options.description ??
                'Summarises documents, transcripts, and conversation threads. Publishes insights via Atlas Bridge notifications.',
            endpoints: [SUMMARISE_ENDPOINT, INGEST_ENDPOINT, '/bridge-notify'],
        });
    }
    async handleOperationalMessage(message) {
        const content = message.content.trim();
        if (!content) {
            await this.sendMessage(message.from, 'response', 'Provide text or a document reference for me to summarise.', { intent: 'summarizer_missing_content' });
            return;
        }
        const summary = await this.postAtlas(SUMMARISE_ENDPOINT, {
            content,
            metadata: message.metadata ?? {},
        });
        if (!summary?.summary) {
            await this.sendMessage(message.from, 'response', 'I could not generate a summary from the provided content.', { intent: 'summarizer_failed' });
            return;
        }
        await this.sendMessage(message.from, 'response', summary.summary, {
            intent: 'summarizer_complete',
            payload: summary,
        });
        await this.notifyAtlas('ai_summary', 'New Summary', summary.summary.slice(0, 140), {
            sourceAgent: message.from,
            summary,
        });
    }
    async handleContextRequest(message) {
        const payload = this.getMessagePayload(message);
        if (payload?.ingest) {
            await this.postAtlas(INGEST_ENDPOINT, payload.ingest);
            await this.sendMessage(message.from, 'response', 'Document acknowledged for ingestion.', { intent: 'summarizer_ingest_ack' });
            return;
        }
        await this.sendMessage(message.from, 'response', 'Summarizer ready. Provide `ingest` payload to store reference material.', { intent: 'summarizer_no_context' });
    }
}
