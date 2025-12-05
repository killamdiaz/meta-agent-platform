import { randomUUID } from 'node:crypto';
import type { AutomationPipeline, AutomationAgentName, AutomationNode } from '../../../automations/types.js';

function buildNode(agent: AutomationAgentName, type: AutomationNode['type'], config: Record<string, unknown>) {
  return {
    id: `${agent.toLowerCase()}_${randomUUID().slice(0, 8)}`,
    agent,
    type,
    config,
  };
}

export function autoConnectSlackWorkflow(
  prompt: string,
  pipeline: AutomationPipeline,
): { pipeline: AutomationPipeline; requiresKeys: AutomationAgentName[] } {
  const lower = prompt.toLowerCase();
  const nodes = [...pipeline.nodes];
  const edges = [...pipeline.edges];
  const requiresKeys = new Set<AutomationAgentName>();

  const ensureNode = (agent: AutomationAgentName, type: AutomationNode['type'], config: Record<string, unknown>) => {
    const existing = nodes.find((node) => node.agent === agent);
    if (existing) return existing;
    const node = buildNode(agent, type, config);
    nodes.push(node);
    return node;
  };

  if (lower.includes('slack')) {
    const trigger = ensureNode('SlackTrigger', 'Trigger', { event: 'channel_message', channel: 'auto' });
    if (!nodes.find((node) => node.agent === 'SlackAgent')) {
      const action = ensureNode('SlackAgent', 'Action', {
        channel: '#updates',
        message: '{{summary.body}}',
        connector: 'slack',
      });
      if (trigger) {
        edges.push({ from: trigger.id, to: action.id });
      }
    }
  }

  if (lower.includes('jira')) {
    const jiraNode = ensureNode('JiraAgent', 'Processor', { action: 'fetchTicket', connector: 'jira' });
    requiresKeys.add('JiraAgent');
    const slackNode = nodes.find((node) => node.agent === 'SlackAgent');
    if (slackNode && jiraNode) {
      edges.push({ from: jiraNode.id, to: slackNode.id });
    }
  }

  if (lower.includes('email') || lower.includes('gmail')) {
    const emailNode = ensureNode('EmailSenderAgent', 'Action', { to: ['team@company.com'], subject: 'Automation update' });
    requiresKeys.add('EmailSenderAgent');
    const trigger = nodes.find((node) => node.type === 'Trigger');
    if (trigger) {
      edges.push({ from: trigger.id, to: emailNode.id });
    }
  }

  const resultPipeline: AutomationPipeline = {
    ...pipeline,
    nodes,
    edges,
  };

  return { pipeline: resultPipeline, requiresKeys: Array.from(requiresKeys) };
}
