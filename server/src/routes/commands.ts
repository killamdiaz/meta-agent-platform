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
    const tokens = input.trim().split(/\s+/);
    const action = tokens.shift()?.toLowerCase();
    if (!action) {
      res.status(400).json({ message: 'Invalid command' });
      return;
    }

    switch (action) {
      case '/create': {
        const remainder = input.replace(/^\/create\s+/i, '').trim();
        if (!remainder) {
          res.status(400).json({ message: 'Agent name required' });
          return;
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
          res.status(400).json({ message: 'Agent name required' });
          return;
        }
        const role = roleParts.join(' ') || name.replace(/Agent$/i, '') || 'Generalist';
        const agent = await agentManager.createAgent({
          name,
          role,
          tools,
          objectives: []
        });
        res.json({ message: 'Agent created', agent });
        break;
      }
      case '/set': {
        const target = tokens.shift();
        if (target?.toLowerCase() !== 'goal') {
          res.status(400).json({ message: 'Unknown /set command' });
          return;
        }
        let agentName: string | null = null;
        if (tokens.length && !tokens[0].startsWith('"')) {
          agentName = tokens.shift() ?? null;
        }
        const quoteIndex = input.indexOf('"');
        const goal = quoteIndex >= 0 ? input.substring(quoteIndex).replace(/^"|"$/g, '') : tokens.join(' ');
        if (!goal) {
          res.status(400).json({ message: 'Goal text required inside quotes' });
          return;
        }
        if (!agentName) {
          res.status(400).json({ message: 'Specify target agent e.g. /set goal FinanceAgent "..."' });
          return;
        }
        const agents = await agentManager.allAgents();
        const targetAgent = agents.find((a: AgentRecord) => a.name.toLowerCase() === agentName!.toLowerCase());
        if (!targetAgent) {
          res.status(404).json({ message: `Agent ${agentName} not found` });
          return;
        }
        const existing = Array.isArray(targetAgent.objectives)
          ? (targetAgent.objectives as string[])
          : [];
        const objectives = Array.from(new Set([...existing, goal]));
        await agentManager.setAgentObjectives(targetAgent.id, objectives);
        res.json({ message: 'Goal added', agent: targetAgent.id, objectives });
        break;
      }
      case '/run': {
        const agentName = tokens.shift();
        if (!agentName) {
          res.status(400).json({ message: 'Agent name required' });
          return;
        }
        const agents = await agentManager.allAgents();
        const agent = agents.find((a: AgentRecord) => a.name.toLowerCase() === agentName.toLowerCase());
        if (!agent) {
          res.status(404).json({ message: `Agent ${agentName} not found` });
          return;
        }
        const quoteIndex = input.indexOf('"');
        const prompt = quoteIndex >= 0 ? input.substring(quoteIndex).replace(/^"|"$/g, '') : tokens.join(' ');
        const task = await agentManager.addTask(agent.id, prompt || `Run command for ${agent.name}`);
        res.json({ message: 'Task enqueued', task });
        break;
      }
      default: {
        res.status(400).json({ message: `Unknown command ${action}` });
      }
    }
  } catch (error) {
    next(error);
  }
});

export default router;
