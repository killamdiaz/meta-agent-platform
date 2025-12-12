import { SlackToolAgent } from './slack/SlackAgent.js';
import { SlackClient, createSlackClientFromConfig } from './slack/SlackClient.js';
import { MailAgent } from './gmail/MailAgent.js';
import { GmailClient, createGmailClientFromConfig } from './gmail/GmailClient.js';
import { NotionAgent } from './notion/NotionAgent.js';
import { NotionClient, createNotionClientFromConfig } from './notion/NotionClient.js';
import { AtlasAutomationAgent } from './atlas/AtlasAutomationAgent.js';
export function instantiateToolAgent(agentType, options) {
    const upper = agentType.toLowerCase();
    if (upper.includes('slack')) {
        return new SlackToolAgent(options);
    }
    if (upper.includes('gmail') || upper.includes('mail')) {
        return new MailAgent(options);
    }
    if (upper.includes('notion')) {
        return new NotionAgent(options);
    }
    if (upper.includes('atlas')) {
        return new AtlasAutomationAgent({ ...options, agentType: agentType.trim() });
    }
    throw new Error(`Unsupported tool agent type: ${agentType}`);
}
export { SlackToolAgent, SlackClient, createSlackClientFromConfig, MailAgent, GmailClient, createGmailClientFromConfig, NotionAgent, NotionClient, createNotionClientFromConfig, AtlasAutomationAgent, };
