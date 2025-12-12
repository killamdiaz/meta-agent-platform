import { handleKbCommand } from '../commands/kb.js';
import { handleExplainCommand } from '../commands/explain.js';
import { handleCompareCommand } from '../commands/compare.js';
import { handleDiagramCommand } from '../commands/diagram.js';
import { handleFormatCommand } from '../commands/format.js';
import { classifyIntent } from '../handlers/intentClassifier.js';
import { handleRagMessage } from '../handlers/ragHandler.js';
import { slackToPlainText } from '../utils/slackMarkdownParser.js';
export async function handleAppMention(event, ctx) {
    const text = slackToPlainText(event.text ?? '').replace(/<@[^>]+>/g, '').trim();
    const intent = classifyIntent(text);
    const commandCtx = {
        orgId: ctx.orgId,
        accountId: ctx.accountId,
        channel: event.channel,
        user: event.user,
        text,
        threadTs: event.thread_ts,
        slackClient: ctx.slackClient,
        teamId: ctx.teamId,
        eventType: ctx.eventType,
    };
    switch (intent) {
        case 'kb':
            await handleKbCommand(commandCtx);
            break;
        case 'explain':
            await handleExplainCommand(commandCtx);
            break;
        case 'compare':
            await handleCompareCommand(commandCtx);
            break;
        case 'diagram':
            await handleDiagramCommand(commandCtx);
            break;
        case 'format':
            await handleFormatCommand(commandCtx);
            break;
        case 'rag':
        default:
            await handleRagMessage({
                orgId: ctx.orgId,
                accountId: ctx.accountId,
                channel: event.channel,
                user: event.user,
                text,
                threadTs: event.thread_ts,
                slackClient: ctx.slackClient,
                slackMetadata: {
                    team_id: ctx.teamId,
                    user_id: event.user,
                    channel_id: event.channel,
                    event_type: ctx.eventType,
                },
            });
            break;
    }
}
