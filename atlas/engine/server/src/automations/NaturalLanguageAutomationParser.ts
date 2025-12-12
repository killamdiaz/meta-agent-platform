import { randomUUID } from 'node:crypto';
import {
  type AutomationNode,
  type AutomationPipeline,
  type AutomationParserResult,
  type AutomationAgentName,
  type AutomationNodeType,
  type AutomationEdge,
} from './types.js';
import { autoConnectSlackWorkflow } from '../connectors/slack/workflows/workflowAutoConnect.js';

const KEY_REQUIRED_AGENTS = new Set<AutomationAgentName>([
  'JiraAgent',
  'JiraTrigger',
  'NotionAgent',
  'DiscordAgent',
  'EmailSenderAgent',
  'AtlasBridgeAgent',
]);

const DAY_TO_CRON: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const TRIGGER_PATTERNS: Array<{
  agent: AutomationAgentName;
  matcher: (input: string) => boolean;
  buildConfig: (input: string) => Record<string, unknown>;
  type: AutomationNodeType;
}> = [
  {
    agent: 'SlackTrigger',
    type: 'Trigger',
    matcher: (input) => /\bslack\b/i.test(input),
    buildConfig: (input) => {
      let event = 'channel_message';
      if (/mention/i.test(input) || /\btag\b/i.test(input)) {
        event = 'mention';
      } else if (/dm\b/i.test(input) || /direct\s+message/i.test(input)) {
        event = 'direct_message';
      } else if (/reaction/i.test(input)) {
        event = 'reaction';
      }
      const channelMatch = input.match(/#([\w-]+)/);
      const channel = channelMatch ? channelMatch[1] : 'all';
      return { event, channel };
    },
  },
  {
    agent: 'GmailTrigger',
    type: 'Trigger',
    matcher: (input) => /\bgmail\b/i.test(input) || /\bemail\b/i.test(input),
    buildConfig: (input) => {
      let event = 'new_message';
      if (/thread/i.test(input)) {
        event = 'new_thread';
      } else if (/reply/i.test(input)) {
        event = 'new_reply';
      }
      const labelMatch = input.match(/\blabel(?:ed)?\s+([\w\s]+)/i);
      const label = labelMatch ? labelMatch[1].trim() : 'Inbox';
      return { event, label };
    },
  },
  {
    agent: 'CronTrigger',
    type: 'Trigger',
    matcher: (input) => /\bevery\b/i.test(input) || /\bschedule\b/i.test(input) || /\bcron\b/i.test(input),
    buildConfig: (input) => buildCronConfig(input),
  },
];

const PROCESSOR_PATTERNS: Array<{
  agent: AutomationAgentName;
  matcher: (input: string) => boolean;
  buildConfig: (input: string) => Record<string, unknown>;
}> = [
  {
    agent: 'SummarizerAgent',
    matcher: (input) => /\bsummar(?:y|ize|ise|ising|izing)\b/i.test(input) || /\bdigest\b/i.test(input) || /\breport\b/i.test(input),
    buildConfig: (input) => {
      let format = 'brief';
      if (/detailed/i.test(input) || /long-form/i.test(input) || /comprehensive/i.test(input)) {
        format = 'detailed';
      } else if (/bullet/i.test(input) || /list/i.test(input)) {
        format = 'bullet';
      }
      const modelMatch = input.match(/\bmodel\s+(gpt-[\w-]+|[\w.-]+)\b/i);
      const model = modelMatch ? modelMatch[1] : 'gpt-4';
      return { model, format };
    },
  },
];

const ACTION_PATTERNS: Array<{
  agent: AutomationAgentName;
  matcher: (input: string) => boolean;
  buildConfig: (input: string) => Record<string, unknown>;
}> = [
  {
    agent: 'SlackAgent',
    matcher: (input) => /\bslack\b/i.test(input),
    buildConfig: (input) => {
      const channelMatch = input.match(/#([\w-]+)/);
      const channel = channelMatch ? `#${channelMatch[1]}` : '#general';
      return {
        channel,
        message: '{{summary.body}}',
      };
    },
  },
  {
    agent: 'NotionAgent',
    matcher: (input) => /\bnotion\b/i.test(input),
    buildConfig: (input) => {
      const dbMatch = input.match(/\b(?:database|page|doc(?:ument)?)\s+(?:called\s+)?["“”']?([\w\s-]+)["“”']?/i);
      const database = dbMatch ? dbMatch[1].trim() : 'Inbox';
      return {
        database,
        fields: {
          Title: '{{summary.title}}',
          Content: '{{summary.body}}',
        },
      };
    },
  },
  {
    agent: 'DiscordAgent',
    matcher: (input) => /\bdiscord\b/i.test(input),
    buildConfig: (input) => {
      const channelMatch = input.match(/#([\w-]+)/);
      const channel = channelMatch ? `#${channelMatch[1]}` : 'general';
      return {
        channel,
        message: '{{summary.body}}',
      };
    },
  },
  {
    agent: 'EmailSenderAgent',
    matcher: (input) => /\bsend\b/i.test(input) && /\bemail\b/i.test(input),
    buildConfig: (input) => {
      const toMatch = input.match(/\bto\s+([\w.+-]+@[\w.-]+\.[a-z]{2,})/i);
      return {
        to: toMatch ? [toMatch[1]] : ['me@example.com'],
        subject: 'Automation Output',
        body: '{{summary.body}}',
      };
    },
  },
  {
    agent: 'JiraAgent',
    matcher: (input) => /\bjira\b/i.test(input) || /\bjira\b.*\b(issue|ticket)/i.test(input),
    buildConfig: (input) => buildJiraConfig(input),
  },
];

const ATLAS_MODULES: Array<{
  agent: AutomationAgentName;
  keywords: RegExp[];
  defaultInclude?: boolean;
  config?: Record<string, unknown>;
}> = [
  {
    agent: 'AtlasWorkspaceAgent',
    keywords: [/workspace/i, /summary/i, /plan/i],
    defaultInclude: true,
    config: { endpoint: 'bridge-user-summary' },
  },
  {
    agent: 'AtlasContractsAgent',
    keywords: [/contract/i, /agreement/i],
    defaultInclude: true,
    config: { endpoint: 'bridge-contracts' },
  },
  {
    agent: 'AtlasInvoicesAgent',
    keywords: [/invoice/i, /billing/i, /finance/i],
    defaultInclude: true,
    config: { endpoint: 'bridge-invoices' },
  },
  {
    agent: 'AtlasTasksAgent',
    keywords: [/task/i, /todo/i, /follow\s*up/i],
    defaultInclude: true,
    config: { endpoint: 'bridge-tasks' },
  },
  {
    agent: 'AtlasNotifyAgent',
    keywords: [/notify/i, /notification/i, /alert/i, /report/i],
    defaultInclude: true,
    config: { endpoint: 'bridge-notify' },
  },
];

function normalise(input: string) {
  return input.replace(/\s+/g, ' ').trim();
}

function buildCronConfig(input: string) {
  const lowered = input.toLowerCase();
  let minute = 0;
  let hour = 9;
  let dayOfMonth = '*';
  let month = '*';
  let dayOfWeek = '*';
  let timezone = 'UTC';

  const timeMatch = lowered.match(/(?:at|@)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    hour = Number.parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? Number.parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];
    if (meridiem) {
      if (/pm/i.test(meridiem) && hour < 12) {
        hour += 12;
      }
      if (/am/i.test(meridiem) && hour === 12) {
        hour = 0;
      }
    }
  }

  const dayMatch = lowered.match(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (dayMatch) {
    const day = DAY_TO_CRON[dayMatch[1]];
    if (typeof day === 'number') {
      dayOfWeek = String(day);
    }
  }

  if (/\bweekday\b/i.test(input)) {
    dayOfWeek = '1-5';
  }
  if (/\bweekend\b/i.test(input)) {
    dayOfWeek = '6,0';
  }

  const tzMatch = input.match(/\b(?:timezone|tz)\s+([A-Za-z/_-]+)/);
  if (tzMatch) {
    timezone = tzMatch[1];
  }

  return {
    schedule: `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`,
    timezone,
  };
}

function buildJiraConfig(input: string) {
  const lower = input.toLowerCase();
  const wantsAttachments = /\b(attachment|file|screenshot|log)s?\b/i.test(input);
  const wantsFollowUps = /\bfollow[-\s]?up\b/i.test(lower) || /next steps?|action items?/i.test(lower);
  const wantsDrafts = /\bdraft\b|\bcomment\b|\breply\b|\brespond\b/i.test(input);
  const wantsPatterns = /\bpattern\b|\btrend\b|\bsignal\b/i.test(lower);
  const wantsGrouping = /\bgroup\b|\bregroup\b|\bbucket\b|\bcategor/i.test(lower);
  const wantsImpact = /\bcustomer\b|\bimpact\b|\bsev(erity)?\b/i.test(lower);
  const wantsSummaries = /\bsummar/i.test(lower) || /\bdigest\b/i.test(lower);
  const wantsSearch = /\bsearch\b|\bfind\b|\blookup\b|\bquery\b/i.test(lower);

  const actions = {
    search: wantsSearch || wantsSummaries || wantsAttachments,
    summarize: wantsSummaries || wantsSearch,
    attachments: wantsAttachments || wantsSearch,
    followUps: wantsFollowUps,
    draftResponse: wantsDrafts,
    analyzePatterns: wantsPatterns,
    regroupIssues: wantsGrouping,
    customerImpact: wantsImpact,
  };

  const anyRequested = Object.values(actions).some(Boolean);
  if (!anyRequested) {
    actions.search = true;
    actions.summarize = true;
    actions.attachments = true;
    actions.followUps = true;
    actions.draftResponse = true;
    actions.analyzePatterns = true;
    actions.regroupIssues = true;
    actions.customerImpact = true;
  }

  return {
    query: input,
    actions,
  };
}

function generateNodeId(agent: AutomationAgentName, suffix?: string) {
  const base = agent.replace(/Agent$/, '').replace(/Trigger$/, '').toLowerCase();
  const token = suffix ? `${base}_${suffix}` : base;
  return `${token}_${randomUUID().slice(0, 8)}`;
}

export class NaturalLanguageAutomationParser {
  parse(input: string): AutomationParserResult {
    const text = normalise(input);
    if (!text || text.length < 5) {
      throw new Error('Describe what should happen in the automation.');
    }

    const atlasResult = this.tryBuildAtlasIntegration(text);
    if (atlasResult) {
      return atlasResult;
    }

    const nodes: AutomationNode[] = [];
    const edges: AutomationPipeline['edges'] = [];
    const requiresKeys = new Set<AutomationAgentName>();

    let actionMatches = this.resolveActions(text);
    const existingActionAgents = actionMatches.map((action) => action.node.agent);

    let inferredTriggerLabel: string | null = null;
    let matchedTrigger = this.resolveTrigger(text);
    if (!matchedTrigger) {
      const inferred = this.inferTrigger(text, existingActionAgents);
      if (inferred) {
        matchedTrigger = { node: inferred.node, requiresKey: inferred.requiresKey };
        inferredTriggerLabel = inferred.label;
      }
    }

    if (!matchedTrigger) {
      throw new Error('Could not determine the trigger. Mention Slack, Gmail, or a schedule.');
    }
    nodes.push(matchedTrigger.node);
    if (matchedTrigger.requiresKey) {
      requiresKeys.add(matchedTrigger.node.agent);
    }

    const processorMatches = this.resolveProcessors(text);

    let inferredOutputLabel: string | null = null;
    if (actionMatches.length === 0) {
      const inferredAction = this.inferOutput(text, matchedTrigger.node.agent, existingActionAgents);
      if (inferredAction) {
        actionMatches.push({ node: inferredAction.node, requiresKey: inferredAction.requiresKey });
        existingActionAgents.push(inferredAction.node.agent);
        inferredOutputLabel = inferredAction.label;
      }
    }

    const actionMatchesResolved = actionMatches;

    if (processorMatches.length === 0 && /\bsummar/i.test(text)) {
      const defaultNode = this.buildNode('SummarizerAgent', 'Processor', {});
      nodes.push(defaultNode);
    } else {
      for (const processor of processorMatches) {
        nodes.push(processor.node);
      }
    }

    if (actionMatchesResolved.length === 0) {
      throw new Error('Describe where to send the automation output (Notion, Discord, or email).');
    }

    for (const action of actionMatchesResolved) {
      nodes.push(action.node);
      if (action.requiresKey) {
        requiresKeys.add(action.node.agent);
      }
    }

    // connect edges sequentially
    for (let index = 0; index < nodes.length - 1; index += 1) {
      edges.push({ from: nodes[index].id, to: nodes[index + 1].id });
    }

    let pipeline: AutomationPipeline = {
      name: this.inferName(text, matchedTrigger.node.agent, actionMatchesResolved.map((action) => action.node.agent)),
      nodes,
      edges,
    };

    const triggerLogLabel = inferredTriggerLabel ?? matchedTrigger.node.agent;
    const outputLogLabel = inferredOutputLabel ?? actionMatchesResolved.map((action) => action.node.agent).join(',');
    console.log(`[automation-builder] trigger=${triggerLogLabel} output=${outputLogLabel}`);

    const autoConnected = autoConnectSlackWorkflow(text, pipeline);
    pipeline = autoConnected.pipeline;
    autoConnected.requiresKeys.forEach((agent) => requiresKeys.add(agent));

    return {
      pipeline,
      requiresKeys: Array.from(requiresKeys),
    };
  }

  private resolveTrigger(input: string) {
    for (const candidate of TRIGGER_PATTERNS) {
      if (candidate.matcher(input)) {
        const config = candidate.buildConfig(input);
        const node = this.buildNode(candidate.agent, candidate.type, config);
        return {
          node,
          requiresKey: KEY_REQUIRED_AGENTS.has(candidate.agent),
        };
      }
    }
    return null;
  }

  private resolveProcessors(input: string) {
    const results: Array<{ node: AutomationNode; requiresKey: boolean }> = [];
    for (const candidate of PROCESSOR_PATTERNS) {
      if (candidate.matcher(input)) {
        const config = candidate.buildConfig(input);
        const node = this.buildNode(candidate.agent, 'Processor', config);
        results.push({ node, requiresKey: KEY_REQUIRED_AGENTS.has(candidate.agent) });
      }
    }
    return results;
  }

  private resolveActions(input: string) {
    const results: Array<{ node: AutomationNode; requiresKey: boolean }> = [];
    for (const candidate of ACTION_PATTERNS) {
      if (candidate.matcher(input)) {
        const config = candidate.buildConfig(input);
        const node = this.buildNode(candidate.agent, 'Action', config);
        results.push({ node, requiresKey: KEY_REQUIRED_AGENTS.has(candidate.agent) });
      }
    }
    return results;
  }

  private inferTrigger(description: string, existingActionAgents: AutomationAgentName[]): InferredNode | null {
    const lower = description.toLowerCase();

    if (lower.includes('discord')) {
      const node = this.buildNode('SlackTrigger', 'Trigger', {
        event: 'message',
        channel: 'all',
        platform: 'discord',
      });
      return {
        node,
        requiresKey: KEY_REQUIRED_AGENTS.has('SlackTrigger'),
        label: 'discord-message',
      };
    }

    if (lower.includes('slack') || existingActionAgents.includes('SlackAgent')) {
      const node = this.buildTriggerFromPattern('SlackTrigger', description);
      if (node) {
        return {
          node,
          requiresKey: KEY_REQUIRED_AGENTS.has('SlackTrigger'),
          label: 'slack-message',
        };
      }
    }

    if (lower.includes('gmail') || lower.includes('email')) {
      const node = this.buildTriggerFromPattern('GmailTrigger', description);
      if (node) {
        return {
          node,
          requiresKey: KEY_REQUIRED_AGENTS.has('GmailTrigger'),
          label: 'email-received',
        };
      }
    }

    if (/\bevery\b|\bschedule\b|\bcron\b|\bdaily\b|\bweekly\b|\bmonthly\b/.test(lower)) {
      const config = buildCronConfig(description);
      const node = this.buildNode('CronTrigger', 'Trigger', config);
      return {
        node,
        requiresKey: KEY_REQUIRED_AGENTS.has('CronTrigger'),
        label: 'time-schedule',
      };
    }

    return null;
  }

  private inferOutput(
    description: string,
    triggerAgent?: AutomationAgentName,
    existingActionAgents: AutomationAgentName[] = [],
  ): InferredNode | null {
    const lower = description.toLowerCase();

    if (!existingActionAgents.includes('NotionAgent') && lower.includes('notion')) {
      const node = this.buildActionFromPattern('NotionAgent', description);
      if (node) {
        return {
          node,
          requiresKey: KEY_REQUIRED_AGENTS.has('NotionAgent'),
          label: 'NotionAgent',
        };
      }
    }

    if (!existingActionAgents.includes('DiscordAgent') && lower.includes('discord')) {
      const node = this.buildActionFromPattern('DiscordAgent', description);
      if (node) {
        return {
          node,
          requiresKey: KEY_REQUIRED_AGENTS.has('DiscordAgent'),
          label: 'DiscordAgent',
        };
      }
    }

    if (
      !existingActionAgents.includes('EmailSenderAgent') &&
      (lower.includes('email') || lower.includes('gmail'))
    ) {
      const node = this.buildActionFromPattern('EmailSenderAgent', description);
      if (node) {
        return {
          node,
          requiresKey: KEY_REQUIRED_AGENTS.has('EmailSenderAgent'),
          label: 'EmailAgent',
        };
      }
    }

    if (
      !existingActionAgents.includes('SlackAgent') &&
      (lower.includes('slack') || triggerAgent === 'SlackTrigger')
    ) {
      const node = this.buildActionFromPattern('SlackAgent', description);
      if (node) {
        return {
          node,
          requiresKey: KEY_REQUIRED_AGENTS.has('SlackAgent'),
          label: 'SlackAgent',
        };
      }
    }

    return null;
  }

  private buildTriggerFromPattern(agent: AutomationAgentName, description: string): AutomationNode | null {
    const pattern = TRIGGER_PATTERNS.find((candidate) => candidate.agent === agent);
    if (!pattern) {
      return null;
    }
    const config = pattern.buildConfig(description);
    return this.buildNode(agent, pattern.type, config);
  }

  private buildActionFromPattern(agent: AutomationAgentName, description: string): AutomationNode | null {
    const pattern = ACTION_PATTERNS.find((candidate) => candidate.agent === agent);
    if (!pattern) {
      return null;
    }
    const config = pattern.buildConfig(description);
    return this.buildNode(agent, 'Action', config);
  }

  private buildNode(agent: AutomationAgentName, type: AutomationNode['type'], config: Record<string, unknown>) {
    return {
      id: generateNodeId(agent, type.toLowerCase()),
      type,
      agent,
      config,
    };
  }

  private inferName(input: string, triggerAgent: AutomationAgentName, actionAgents: AutomationAgentName[]) {
    const triggerName = triggerAgent.replace(/Trigger$/, '').replace(/Agent$/, '');
    const actionNames = actionAgents.map((agent) => agent.replace(/Agent$/, '').replace(/Trigger$/, ''));
    const base = `${triggerName} to ${actionNames.join(' & ')}`.replace(/\s+/g, ' ').trim();
    if (base) {
      return base
        .split(' ')
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
    }
    const summaryMatch = input.match(/["'“”](.+?)["'“”]/);
    if (summaryMatch) {
      return summaryMatch[1];
    }
    return undefined;
  }

  private tryBuildAtlasIntegration(input: string): AutomationParserResult | null {
    if (!/\batlas\b/i.test(input)) {
      return null;
    }

    const nodes: AutomationNode[] = [];
    const edges: AutomationEdge[] = [];
    const requiresKeys = new Set<AutomationAgentName>();

    const centralNode = this.buildNode('AtlasBridgeAgent', 'Processor', {
      description: 'Core Atlas OS Bridge orchestrator',
    });
    nodes.push(centralNode);
    requiresKeys.add('AtlasBridgeAgent');

    const lowered = input.toLowerCase();
    const selectedModules = ATLAS_MODULES.filter((module) => {
      if (module.keywords.some((regex) => regex.test(lowered))) {
        return true;
      }
      return module.defaultInclude === true;
    });

    centralNode.config = {
      ...centralNode.config,
      modules: selectedModules.map((module) => module.agent),
    };

    for (const module of selectedModules) {
      const moduleNode = this.buildNode(module.agent, 'Action', {
        ...(module.config ?? {}),
        mode: 'atlas_module',
      });
      nodes.push(moduleNode);
      edges.push({ from: centralNode.id, to: moduleNode.id });
    }

    const pipeline: AutomationPipeline = {
      name: 'Atlas OS Integration',
      nodes,
      edges,
    };

    return {
      pipeline,
      requiresKeys: Array.from(requiresKeys),
    };
  }
}
interface InferredNode {
  node: AutomationNode;
  requiresKey: boolean;
  label: string;
}
