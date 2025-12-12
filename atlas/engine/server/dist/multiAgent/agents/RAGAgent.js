import { BaseAgent } from '../BaseAgent.js';
import { AgentStatusEvents } from '../../events/AgentStatusEvents.js';
import { pool } from '../../db.js';
const DEFAULT_REFERENCES = 3;
export class RAGAgent extends BaseAgent {
    constructor(options) {
        super({
            ...options,
            role: options.role ??
                'Retrieval Specialist',
            aliases: Array.from(new Set([...(options.aliases ?? []), 'RAGAgent', 'KnowledgeAgent'])),
            description: 'Retrieval augmented generation agent. Surfaces relevant knowledge snippets and crafts evidence-backed responses.',
        });
        this.knowledgeBase = options.knowledgeBase ?? [];
        this.maxReferences = options.maxReferences ?? DEFAULT_REFERENCES;
    }
    async processMessage(message) {
        if (message.type !== 'question') {
            await this.sendMessage(message.from, 'response', 'I specialise in knowledge retrieval. Please send me questions that need supporting evidence.', {
                origin: this.id,
                inReplyTo: message.id,
            });
            return;
        }
        AgentStatusEvents.emitUpdate({ label: 'Analyzing issue…', stage: 'analyze' });
        const retrieval = this.retrieve(message.content);
        const context = this.formatContext(retrieval.matches);
        AgentStatusEvents.emitUpdate({ label: 'Searching KB for relevant documentation…', stage: 'kb' });
        AgentStatusEvents.emitUpdate({ label: 'Searching for similar solved Jira tickets…', stage: 'jira' });
        const similarIssues = await this.searchSimilarJiraIssues({
            orgId: message.metadata?.orgId ?? message.metadata?.org_id,
            projectKey: message.metadata?.projectKey,
            text: message.content,
            limit: 5,
        });
        const similarContext = this.formatSimilarIssues(similarIssues);
        AgentStatusEvents.emitUpdate({ label: 'Compiling diagnosis…', stage: 'compile' });
        const response = await this.generateLLMReply({
            from: message.from,
            content: message.content,
            metadata: message.metadata,
            context: [context, similarContext].filter(Boolean).join('\n\n'),
            systemPrompt: `You are Agent ${this.id}, a retrieval augmented assistant. Your role is to answer with grounded, verifiable insights using the supplied knowledge context. Reference the sources explicitly when helpful.`,
        });
        const references = retrieval.matches.map((match) => ({
            id: match.entry.id,
            title: match.entry.title,
            url: match.entry.url,
            summary: match.entry.summary,
        }));
        AgentStatusEvents.emitUpdate({ label: 'Preparing recommended next steps…', stage: 'plan' });
        const formattedResponse = this.appendReferences(response, references);
        await this.sendMessage(message.from, 'response', formattedResponse, {
            origin: this.id,
            questionId: message.metadata?.questionId ?? message.id,
            originalSender: message.metadata?.originalSender,
            references,
        });
        AgentStatusEvents.emitUpdate({ label: 'Done', stage: 'done' });
    }
    retrieve(query) {
        if (!query) {
            return { matches: [] };
        }
        const tokens = this.tokenise(query);
        const matches = this.knowledgeBase
            .map((entry) => ({
            entry,
            score: this.scoreEntry(tokens, entry),
        }))
            .filter((candidate) => candidate.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.maxReferences);
        return { matches };
    }
    formatContext(matches) {
        if (matches.length === 0)
            return undefined;
        return matches
            .map((match, index) => `Source ${index + 1}: ${match.entry.title}\nSummary: ${match.entry.summary}\nContent:\n${match.entry.content}`)
            .join('\n\n---\n\n');
    }
    appendReferences(response, references) {
        if (!references.length) {
            return response;
        }
        const referencesBlock = references
            .map((ref) => {
            const label = ref.url ? `${ref.title} (${ref.url})` : ref.title;
            return `• ${label}`;
        })
            .join('\n');
        return `${response.trim()}\n\nSources:\n${referencesBlock}`;
    }
    tokenise(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/gi, ' ')
            .split(/\s+/)
            .filter(Boolean);
    }
    scoreEntry(tokens, entry) {
        const haystack = [
            entry.title,
            entry.summary,
            entry.content,
            ...(entry.tags ?? []),
        ]
            .join(' ')
            .toLowerCase();
        let score = 0;
        for (const token of tokens) {
            if (haystack.includes(token)) {
                score += 1;
            }
        }
        return score;
    }
    async searchSimilarJiraIssues(params) {
        if (!params.orgId)
            return [];
        try {
            const { rows } = await pool.query(`
        SELECT ticket_id as key,
               title as summary,
               resolution as "rootCause",
               metadata->>'howSolved' as "howSolved",
               metadata->>'solvedBy' as "solvedBy",
               metadata->>'resolutionComment' as "resolutionComment",
               metadata->>'timeTaken' as "timeTaken",
               0 as "similarityScore"
        FROM jira_embeddings
        WHERE org_id = $1
          AND ($2::text IS NULL OR metadata->>'projectKey' = $2)
        ORDER BY updated_at DESC
        LIMIT $3
      `, [params.orgId, params.projectKey ?? null, params.limit ?? 5]);
            return rows;
        }
        catch (err) {
            console.warn('[RAGAgent] similar jira search failed', err);
            return [];
        }
    }
    formatSimilarIssues(issues = []) {
        if (!issues.length)
            return '';
        return issues
            .map((issue, idx) => {
            return `Similar ${idx + 1}: ${issue.key}\nSummary: ${issue.summary ?? ''}\nRoot Cause: ${issue.rootCause ?? ''}\nHow Solved: ${issue.howSolved ?? ''}`;
        })
            .join('\n\n');
    }
}
