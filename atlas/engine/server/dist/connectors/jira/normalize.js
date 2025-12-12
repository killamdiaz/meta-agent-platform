export function normalizeJiraIssue(issue, jiraDomain) {
    const fields = issue?.fields || {};
    const rendered = issue?.renderedFields || {};
    const comments = (fields.comment?.comments || []).map((c) => ({
        author: c.author?.displayName,
        body: c.body ?? c.renderedBody,
        created: c.created,
    }));
    const attachments = (fields.attachment || []).map((a) => ({
        filename: a.filename,
        url: a.content,
        size: a.size,
    }));
    const browseUrl = jiraDomain && issue?.key
        ? `${String(jiraDomain).replace(/\/$/, '')}/browse/${issue.key}`
        : undefined;
    return {
        key: issue?.key,
        summary: fields.summary,
        descriptionHtml: rendered.description || fields.description,
        priority: fields.priority?.name,
        reporter: fields.reporter?.displayName,
        assignee: fields.assignee?.displayName,
        status: fields.status?.name,
        created: fields.created,
        updated: fields.updated,
        comments,
        attachments,
        changelog: issue?.changelog,
        transitions: issue?.transitions,
        url: browseUrl,
    };
}
