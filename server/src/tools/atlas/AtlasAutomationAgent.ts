import type { AgentMessage } from '../../multiAgent/MessageBroker.js';
import { BaseAgent, type BaseAgentOptions } from '../../multiAgent/BaseAgent.js';

export interface AtlasAutomationAgentOptions extends BaseAgentOptions {
  agentType: string;
  config: Record<string, unknown>;
}

const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  'atlas-bridge-orchestrator':
    'Coordinates Atlas OS bridge workflows, routes module outputs, and manages credential prompts.',
  'atlas-contracts-agent': 'Handles Atlas OS contract lookups, creation, and status updates.',
  'atlas-invoices-agent': 'Manages Atlas OS invoice retrieval and reporting.',
  'atlas-tasks-agent': 'Creates and updates Atlas OS tasks for automation follow-up.',
  'atlas-notify-agent': 'Sends notifications and agent reports into Atlas OS.',
  'atlas-workspace-agent': 'Surfaces Atlas OS workspace summaries, plans, and module metadata.',
};

const DEFAULT_SHORT_NAMES: Record<string, string> = {
  'atlas-bridge-orchestrator': 'Atlas Bridge',
  'atlas-contracts-agent': 'Atlas Contracts',
  'atlas-invoices-agent': 'Atlas Invoices',
  'atlas-tasks-agent': 'Atlas Tasks',
  'atlas-notify-agent': 'Atlas Notify',
  'atlas-workspace-agent': 'Atlas Workspace',
};

const normaliseAgentType = (value: string) => value.toLowerCase();

export class AtlasAutomationAgent extends BaseAgent {
  private readonly config: Record<string, unknown>;
  private readonly agentType: string;

  constructor({ agentType, config, ...baseOptions }: AtlasAutomationAgentOptions) {
    const normalised = normaliseAgentType(agentType);
    const shortName = DEFAULT_SHORT_NAMES[normalised] ?? `Atlas ${agentType}`;
    const defaultRole = `${shortName} Automation Agent`;
    const description =
      baseOptions.description ?? DEFAULT_DESCRIPTIONS[normalised] ?? 'Atlas OS automation module agent.';
    super({
      ...baseOptions,
      role: baseOptions.role?.trim() || defaultRole,
      description,
    });
    this.agentType = normalised;
    this.config = config;
  }

  protected override async processMessage(message: AgentMessage): Promise<void> {
    const responsePrefix = `[${this.name}]`;
    switch (message.type) {
      case 'task': {
        await this.sendMessage(
          message.from,
          'response',
          `${responsePrefix} received task: "${message.content}". Atlas module execution is not yet implemented.`,
        );
        break;
      }
      case 'question': {
        await this.sendMessage(
          message.from,
          'response',
          `${responsePrefix} ready for Atlas OS actions. Provide execution details or credentials if required.`,
        );
        break;
      }
      default: {
        await this.sendMessage(message.from, 'response', `${responsePrefix} acknowledged your message.`);
      }
    }
  }
}
