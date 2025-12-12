export function classifyIntent(text) {
    const normalized = text.toLowerCase();
    if (normalized.startsWith('/kb') || normalized.includes('knowledge base'))
        return 'kb';
    if (normalized.includes('diagram') || normalized.includes('sequence diagram'))
        return 'diagram';
    if (normalized.includes('format') || normalized.includes('reformat'))
        return 'format';
    if (normalized.includes('compare'))
        return 'compare';
    if (normalized.includes('explain'))
        return 'explain';
    return 'rag';
}
