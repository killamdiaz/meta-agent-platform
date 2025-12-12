export function buildCitationFooter(citations) {
    if (!citations.length)
        return '';
    const lines = citations.map((citation, index) => {
        const sourceId = citation.source_id ? ` (${citation.source_id})` : '';
        const channel = typeof citation.metadata?.channel === 'string' ? ` ${citation.metadata.channel}` : '';
        return `[${index + 1}] ${citation.source_type}${channel}${sourceId}`;
    });
    return `\n\nSources:\n${lines.join('\n')}`;
}
