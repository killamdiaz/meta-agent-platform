import { BaseAgent } from '../../multiAgent/BaseAgent.js';
const DEFAULT_DESCRIPTIONS = {};
const DEFAULT_SHORT_NAMES = {};
const normaliseAgentType = (value) => value.toLowerCase();
export class AtlasAutomationAgent extends BaseAgent {
    constructor({ agentType, config, ...baseOptions }) {
        const normalised = normaliseAgentType(agentType);
        const shortName = DEFAULT_SHORT_NAMES[normalised] ?? `Atlas ${agentType}`;
        const defaultRole = `${shortName} Automation Agent`;
        const description = baseOptions.description ?? DEFAULT_DESCRIPTIONS[normalised] ?? 'Atlas OS automation module agent.';
        super({
            ...baseOptions,
            role: baseOptions.role?.trim() || defaultRole,
            description,
        });
        this.agentType = normalised;
        this.config = config;
    }
    async processMessage(message) {
        const responsePrefix = `[${this.name}]`;
        switch (message.type) {
            case 'task': {
                await this.sendMessage(message.from, 'response', `${responsePrefix} received task: "${message.content}". Atlas module execution is not yet implemented.`);
                break;
            }
            case 'question': {
                await this.sendMessage(message.from, 'response', `${responsePrefix} ready for Atlas OS actions. Provide execution details or credentials if required.`);
                break;
            }
            default: {
                await this.sendMessage(message.from, 'response', `${responsePrefix} acknowledged your message.`);
            }
        }
    }
}
