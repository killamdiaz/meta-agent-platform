import { Router } from 'express';
import { agentManager } from '../core/AgentManager.js';
import type { AgentRecord } from '../core/Agent.js';
import { z } from 'zod';

const router = Router();

const commandSchema = z.object({
  input: z.string().min(1)
});

router.post('/', async (req, res, next) => {
  try {
    const { input } = commandSchema.parse(req.body);
    const trimmed = input.trim();
    if (!trimmed) {
      return res.status(400).json({ message: 'Invalid command' });
    }

    const agents = await agentManager.allAgents();

    const findAgent = (identifier: string): AgentRecord | undefined => {
      const lowered = identifier.toLowerCase();
      return (
        agents.find((agent) => agent.id === identifier) ||
        agents.find((agent) => agent.name.toLowerCase() === lowered)
      );
    };

    const autoRoute = (text: string): AgentRecord | undefined => {
      const lowered = text.toLowerCase();
      return (
        agents.find((agent) => lowered.includes(agent.name.toLowerCase())) ||
        agents.find((agent) => agent.role && lowered.includes(agent.role.toLowerCase())) ||
        agents[0]
      );
    };

    const enqueue = async (agent: AgentRecord, prompt: string) => {
      const task = await agentManager.addTask(agent.id, prompt);
      return res.json({ message: 'Task enqueued', agent, task });
    };

    if (!trimmed.startsWith('/')) {
      if (trimmed.startsWith('@')) {
        const mentionBody = trimmed.slice(1);
        const [identifier, ...rest] = mentionBody.split(/\s+/);
        const agent = identifier ? findAgent(identifier) : undefined;
        if (!agent) {
          return res.status(404).json({ message: `Agent ${identifier || ''} not found` });
        }
        const remainder = rest.join(' ').trim();
        return enqueue(agent, remainder || `Run command for ${agent.name}`);
      }

      if (agents.length === 0) {
        return res.status(404).json({ message: 'No agents available to process this command' });
      }

      const agent = autoRoute(trimmed);
      if (!agent) {
        return res.status(404).json({ message: 'No matching agent found for the request' });
      }
      return enqueue(agent, trimmed);
    }

    const tokens = trimmed.split(/\s+/);
    const action = tokens.shift()?.toLowerCase();
    if (!action) {
      return res.status(400).json({ message: 'Invalid command' });
    }

    switch (action) {
      case '/create': {
        const remainder = input.replace(/^\/create\s+/i, '').trim();
        if (!remainder) {
          return res.status(400).json({ message: 'Agent name required' });
        }
        const tools: Record<string, boolean> = {};
        const toolMatch = remainder.match(/with\s+tools?:\s*(.+)$/i);
        const toolString = toolMatch?.[1] ?? '';
        toolString
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((tool) => {
            tools[tool] = true;
          });
        const nameRolePart = toolMatch ? remainder.replace(toolMatch[0], '').trim() : remainder;
        const [name, ...roleParts] = nameRolePart.split(/\s+/);
        if (!name) {
          return res.status(400).json({ message: 'Agent name required' });
        }
        const role = roleParts.join(' ') || name.replace(/Agent$/i, '') || 'Generalist';
        const agent = await agentManager.createAgent({
          name,
          role,
          tools,
          objectives: []
        });
        return res.json({ message: 'Agent created', agent });
      }
      case '/set': {
        const target = tokens.shift();
        if (target?.toLowerCase() !== 'goal') {
          return res.status(400).json({ message: 'Unknown /set command' });
        }
        let agentName: string | null = null;
        if (tokens.length && !tokens[0].startsWith('"')) {
          agentName = tokens.shift() ?? null;
        }
        const quoteIndex = input.indexOf('"');
        const goal = quoteIndex >= 0 ? input.substring(quoteIndex).replace(/^"|"$/g, '') : tokens.join(' ');
        if (!goal) {
          return res.status(400).json({ message: 'Goal text required inside quotes' });
        }
        if (!agentName) {
          return res.status(400).json({ message: 'Specify target agent e.g. /set goal FinanceAgent "..."' });
        }
        const agents = await agentManager.allAgents();
        const targetAgent = agents.find((a: AgentRecord) => a.name.toLowerCase() === agentName!.toLowerCase());
        if (!targetAgent) {
          return res.status(404).json({ message: `Agent ${agentName} not found` });
        }
        const existing = Array.isArray(targetAgent.objectives)
          ? (targetAgent.objectives as string[])
          : [];
        const objectives = Array.from(new Set([...existing, goal]));
        await agentManager.setAgentObjectives(targetAgent.id, objectives);
        return res.json({ message: 'Goal added', agent: targetAgent.id, objectives });
      }
      case '/run': {
        const identifier = tokens.shift();
        if (!identifier) {
          return res.status(400).json({ message: 'Agent identifier required' });
        }
        const agent = findAgent(identifier);
        if (!agent) {
          return res.status(404).json({ message: `Agent ${identifier} not found` });
        }
        const quoteIndex = trimmed.indexOf('"');
        const prompt = quoteIndex >= 0 ? trimmed.substring(quoteIndex).replace(/^"|"$/g, '') : tokens.join(' ');
        const task = await agentManager.addTask(agent.id, prompt || `Run command for ${agent.name}`);
        return res.json({ message: 'Task enqueued', agent, task });
      }
      default: {
        return res.status(400).json({ message: `Unknown command ${action}` });
      }
    }
  } catch (error) {
    next(error);
  }
});

export default router;
