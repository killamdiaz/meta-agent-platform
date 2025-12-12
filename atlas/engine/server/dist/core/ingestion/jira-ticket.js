import { storeEmbeddings } from './index.js';
export async function ingestJiraTicket(ticket, record) {
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
    const payload = {
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
