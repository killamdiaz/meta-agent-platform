import { storeEmbeddings } from './index.js';
async function extractDocxText(buffer) {
    try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        if (result?.value) {
            return String(result.value);
        }
    }
    catch (error) {
        console.warn('[ingestion:docx] mammoth unavailable, falling back to utf8 decode', error);
    }
    return buffer.toString('utf8');
}
export async function ingestDocx(buffer, record) {
    const text = await extractDocxText(buffer);
    if (!text?.trim())
        return;
    const payload = {
        ...record,
        sourceType: record.sourceType ?? 'filesystem',
        metadata: { ...(record.metadata ?? {}), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        content: text,
    };
    await storeEmbeddings([payload]);
}
