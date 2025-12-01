import type { IngestionRecord } from './index.js';
import { storeEmbeddings } from './index.js';

export interface JiraTicketLike {
  key: string;
  summary: string;
  description?: string;
  status?: string;
  reporter?: string;
  assignee?: string;
  url?: string;
}

export async function ingestJiraTicket(ticket: JiraTicketLike, record: Omit<IngestionRecord, 'content' | 'sourceType' | 'sourceId'> & { sourceType?: string }) {
  const description = ticket.description ?? '';
  const content = [
    `Ticket ${ticket.key}`,
    `Summary: ${ticket.summary}`,
    ticket.status ? `Status: ${ticket.status}` : '',
    ticket.reporter ? `Reporter: ${ticket.reporter}` : '',
    ticket.assignee ? `Assignee: ${ticket.assignee}` : '',
    description,
  ]
    .filter(Boolean)
    .join('\n');

  const payload: IngestionRecord = {
    ...record,
    sourceType: record.sourceType ?? 'jira',
    sourceId: ticket.key,
    metadata: {
      ...(record.metadata ?? {}),
      key: ticket.key,
      status: ticket.status,
      reporter: ticket.reporter,
      assignee: ticket.assignee,
      url: ticket.url,
    },
    content,
  };

  await storeEmbeddings([payload]);
}
