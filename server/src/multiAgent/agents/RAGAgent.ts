import { BaseAgent, type BaseAgentOptions } from '../BaseAgent.js';
import type { AgentMessage } from '../MessageBroker.js';

interface KnowledgeBaseEntry {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags?: string[];
  url?: string;
}

interface RetrievalMatch {
  entry: KnowledgeBaseEntry;
  score: number;
}

interface RAGAgentOptions extends Omit<BaseAgentOptions, 'description' | 'role'> {
  role?: string;
  knowledgeBase?: KnowledgeBaseEntry[];
  maxReferences?: number;
}

const DEFAULT_REFERENCES = 3;

export class RAGAgent extends BaseAgent {
  private readonly knowledgeBase: KnowledgeBaseEntry[];
  private readonly maxReferences: number;

  constructor(options: RAGAgentOptions) {
    super({
      ...options,
      role:
        options.role ??
        'Retrieval Specialist',
      aliases: Array.from(new Set([...(options.aliases ?? []), 'RAGAgent', 'KnowledgeAgent'])),
      description:
        'Retrieval augmented generation agent. Surfaces relevant knowledge snippets and crafts evidence-backed responses.',
    });
    this.knowledgeBase = options.knowledgeBase ?? [];
    this.maxReferences = options.maxReferences ?? DEFAULT_REFERENCES;
  }

  protected override async processMessage(message: AgentMessage): Promise<void> {
    if (message.type !== 'question') {
      await this.sendMessage(
        message.from,
        'response',
        'I specialise in knowledge retrieval. Please send me questions that need supporting evidence.',
        {
          origin: this.id,
          inReplyTo: message.id,
        },
      );
      return;
    }

    const retrieval = this.retrieve(message.content);
    const context = this.formatContext(retrieval.matches);

    const response = await this.generateLLMReply({
      from: message.from,
      content: message.content,
      metadata: message.metadata,
      context,
      systemPrompt: `You are Agent ${this.id}, a retrieval augmented assistant. Your role is to answer with grounded, verifiable insights using the supplied knowledge context. Reference the sources explicitly when helpful.`,
    });

    const references = retrieval.matches.map((match) => ({
      id: match.entry.id,
      title: match.entry.title,
      url: match.entry.url,
      summary: match.entry.summary,
    }));

    const formattedResponse = this.appendReferences(response, references);
    await this.sendMessage(message.from, 'response', formattedResponse, {
      origin: this.id,
      questionId: (message.metadata as { questionId?: string })?.questionId ?? message.id,
      originalSender: (message.metadata as { originalSender?: string })?.originalSender,
      references,
    });
  }

  private retrieve(query: string): { matches: RetrievalMatch[] } {
    if (!query) {
      return { matches: [] };
    }
    const tokens = this.tokenise(query);
    const matches: RetrievalMatch[] = this.knowledgeBase
      .map((entry) => ({
        entry,
        score: this.scoreEntry(tokens, entry),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxReferences);
    return { matches };
  }

  private formatContext(matches: RetrievalMatch[]): string | undefined {
    if (matches.length === 0) return undefined;
    return matches
      .map(
        (match, index) =>
          `Source ${index + 1}: ${match.entry.title}\nSummary: ${match.entry.summary}\nContent:\n${match.entry.content}`,
      )
      .join('\n\n---\n\n');
  }

  private appendReferences(
    response: string,
    references: Array<{ id: string; title: string; url?: string }>,
  ): string {
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

  private tokenise(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  private scoreEntry(tokens: string[], entry: KnowledgeBaseEntry): number {
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
}
