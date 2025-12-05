import { storeEmbeddings } from '../core/ingestion/index.js';
import { ingestJiraTicket } from '../core/ingestion/jira-ticket.js';

export async function recordIntegrationNode(orgId: string, connectorType: string, metadata: Record<string, any>) {
  await storeEmbeddings([
    {
      orgId,
      accountId: null,
      sourceType: 'integration',
      sourceId: `${connectorType}-${orgId}`,
      content: `Integration connected: ${connectorType}`,
      metadata: {
        ...metadata,
        type: 'Integration',
        color: '#f97316' // orange
      },
      visibilityScope: 'org'
    } as any
  ]);
}

export function normalizeJiraIssue(issue: any) {
  const fields = issue?.fields || {};
  const resolution = fields.resolution?.name;
  const lastComment = fields.comment?.comments?.length
    ? fields.comment.comments[fields.comment.comments.length - 1]?.body
    : undefined;
  return {
    key: issue.key,
    summary: fields.summary,
    description: fields.description,
    status: fields.status?.name,
    reporter: fields.reporter?.displayName,
    assignee: fields.assignee?.displayName,
    priority: fields.priority?.name,
    comments: fields.comment?.comments ?? [],
    url: fields?.issuetype?.self,
    resolution,
    lastComment
  };
}

export async function ingestJiraIssue(issue: any, orgId: string, accountId?: string | null) {
  const normalized = normalizeJiraIssue(issue);
  await ingestJiraTicket(
    {
      key: normalized.key,
      summary: normalized.summary,
      description: normalized.description,
      status: normalized.status,
      reporter: normalized.reporter,
      assignee: normalized.assignee,
      url: normalized.url
    },
    {
      orgId,
      accountId: accountId ?? null,
      metadata: {
        priority: normalized.priority,
        comments: normalized.comments?.slice(-3).map((c: any) => c.body),
        resolution: normalized.resolution,
        lastComment: normalized.lastComment
      }
    } as any
  );
}

export async function ingestJiraProject(project: any, orgId: string, accountId?: string | null) {
  const content = [
    `Project ${project.key ?? project.id}`,
    `Name: ${project.name ?? ''}`,
    project.description ? `Description: ${project.description}` : '',
    project.lead?.displayName ? `Lead: ${project.lead.displayName}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  await storeEmbeddings([
    {
      orgId,
      accountId: accountId ?? null,
      sourceType: 'jira',
      sourceId: project.key ?? project.id ?? undefined,
      content,
      metadata: {
        type: 'project',
        projectId: project.id,
        key: project.key,
        name: project.name,
        color: '#f97316'
      }
    } as any
  ]);
}
