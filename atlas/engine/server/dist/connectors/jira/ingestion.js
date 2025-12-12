import { ingestJiraTicket } from '../../core/ingestion/jira-ticket.js';
import { storeEmbeddings } from '../../core/ingestion/index.js';
export function normalizeIssue(issue) {
    const fields = issue?.fields || {};
    return {
        key: issue.key,
        summary: fields.summary,
        description: fields.description,
        status: fields.status?.name,
        reporter: fields.reporter?.displayName,
        assignee: fields.assignee?.displayName,
        priority: fields.priority?.name,
        comments: fields.comment?.comments ?? [],
        url: fields?.issuetype?.self // fallback
    };
}
export async function ingestIssue(issue, orgId, accountId) {
    const normalized = normalizeIssue(issue);
    await ingestJiraTicket({
        key: normalized.key,
        summary: normalized.summary,
        description: normalized.description,
        status: normalized.status,
        reporter: normalized.reporter,
        assignee: normalized.assignee,
        url: normalized.url
    }, {
        orgId,
        accountId: accountId ?? null,
        metadata: {
            priority: normalized.priority,
            comments: normalized.comments?.slice(-3).map((c) => c.body)
        }
    });
}
export async function recordIntegrationNode(orgId, connectorType, metadata) {
    await storeEmbeddings([
        {
            orgId,
            accountId: null,
            sourceType: 'integration',
            sourceId: `${connectorType}-${orgId}`,
            content: `Integration connected: ${connectorType}`,
            metadata,
            // Hint the renderer to show integration nodes in orange
            visibilityScope: 'org'
        }
    ]);
}
