import { conversationGovernor, embed, SIMILARITY_THRESHOLD, } from './conversationGovernor.js';
import { summarizeConversation } from './summarizer.js';
export { conversationGovernor, embed, summarizeConversation, SIMILARITY_THRESHOLD };
let summaryCallback;
export function registerSummaryCallback(callback) {
    summaryCallback = callback;
}
export async function onSummary(summary) {
    if (!summaryCallback) {
        return;
    }
    await summaryCallback(summary);
}
function ensureMessageHistory(threadState) {
    if (!Array.isArray(threadState.messages)) {
        threadState.messages = [];
    }
    return threadState.messages;
}
function truncateContent(content, length = 80) {
    const text = content.replace(/\s+/g, ' ').trim();
    if (text.length <= length) {
        return text;
    }
    return `${text.slice(0, length - 1)}…`;
}
/**
 * Processes a message through the conversation governor and summarizer pipeline.
 */
export async function processMessage(msg, threadState) {
    const history = ensureMessageHistory(threadState);
    if (threadState.complete) {
        const summary = await summarizeConversation(history);
        console.log('⚪ summary stored.');
        await onSummary(summary);
        return {
            type: 'completed',
            summary,
            content: '✅ Task cycle limit reached. Summarizing thread...',
        };
    }
    console.log(`🔵 inbound message from ${msg.origin}: ${truncateContent(msg.content ?? '')}`);
    const governorOutcome = await conversationGovernor(msg, threadState);
    history.push(msg);
    if (governorOutcome?.type === 'completion' || threadState.complete) {
        console.log('🟢 conversation cycle complete, generating summary.');
        const summary = await summarizeConversation(history);
        console.log('⚪ summary stored.');
        await onSummary(summary);
        return {
            type: 'completed',
            content: governorOutcome?.content ?? '✅ Task cycle limit reached. Summarizing thread...',
            summary,
        };
    }
    if (governorOutcome?.suppressed) {
        console.log('🟠 suppressing repetitive exchange.');
        return {
            type: 'suppressed',
            reason: governorOutcome.reason ?? 'similar',
            similarity: governorOutcome.similarity,
        };
    }
    return {
        type: 'forward',
        message: msg,
    };
}
// CommonJS compatibility
const exported = {
    conversationGovernor,
    embed,
    summarizeConversation,
    SIMILARITY_THRESHOLD,
    processMessage,
    registerSummaryCallback,
    onSummary,
};
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - guarded assignment for CJS consumers.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
}
