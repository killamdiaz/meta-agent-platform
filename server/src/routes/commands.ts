import { Router } from 'express';
import { agentManager } from '../core/AgentManager.js';
import type { AgentRecord } from '../core/Agent.js';
import { z } from 'zod';
import { ragAnswer } from '../services/RagService.js';
import { config } from '../config.js';
import { JiraClient } from '../connectors/jira/client.js';
import { ingestJiraIssue, ingestJiraProject } from '../connectors/integrationNodes.js';

const router = Router();

const commandSchema = z.object({
  input: z.string().min(1),
  org_id: z.string().optional()
});

const resolveOrgId = (req: any): string | null => {
  return (
    (req.headers?.['x-org-id'] as string) ||
    (typeof req.body?.org_id === 'string' ? req.body.org_id : null) ||
    (typeof req.query?.org_id === 'string' ? req.query.org_id : null) ||
    config.defaultOrgId ||
    null
  );
};

const resolveAccountId = (req: any): string | null => {
  return (
    (req.headers?.['x-account-id'] as string) ||
    (typeof req.body?.account_id === 'string' ? req.body.account_id : null) ||
    (typeof req.query?.account_id === 'string' ? req.query.account_id : null) ||
    config.defaultAccountId ||
    null
  );
};

router.post('/', async (req, res, next) => {
  try {
    const { input } = commandSchema.parse(req.body);
    const trimmed = input.trim();
    if (!trimmed) {
      res.status(400).json({ message: 'Invalid command' });
      return;
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
      res.json({ message: 'Task enqueued', agent, task });
    };

    if (!trimmed.startsWith('/')) {
      if (trimmed.startsWith('@')) {
        const mentionBody = trimmed.slice(1);
        const [identifier, ...rest] = mentionBody.split(/\s+/);
        const agent = identifier ? findAgent(identifier) : undefined;
        if (!agent) {
          res.status(404).json({ message: `Agent ${identifier || ''} not found` });
          return;
        }
        const remainder = rest.join(' ').trim();
        await enqueue(agent, remainder || `Run command for ${agent.name}`);
        return;
      }

      if (agents.length === 0) {
        res.status(404).json({ message: 'No agents available to process this command' });
        return;
      }

      const agent = autoRoute(trimmed);
      if (!agent) {
        res.status(404).json({ message: 'No matching agent found for the request' });
        return;
      }
      await enqueue(agent, trimmed);
      return;
    }

    const tokens = trimmed.split(/\s+/);
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
        const identifier = tokens.shift();
        if (!identifier) {
          res.status(400).json({ message: 'Agent identifier required' });
          return;
        }
        const agent = findAgent(identifier);
        if (!agent) {
          res.status(404).json({ message: `Agent ${identifier} not found` });
          return;
        }
        const quoteIndex = trimmed.indexOf('"');
        const prompt = quoteIndex >= 0 ? trimmed.substring(quoteIndex).replace(/^"|"$/g, '') : tokens.join(' ');
        const task = await agentManager.addTask(agent.id, prompt || `Run command for ${agent.name}`);
        res.json({ message: 'Task enqueued', agent, task });
        break;
      }
      case '/slack': {
        const question = input.replace(/^\/slack\s*/i, '').trim();
        if (!question) {
          res.status(400).json({ message: 'Question is required, e.g. /slack What was discussed in #general?' });
          return;
        }
        const orgId = resolveOrgId(req);
        if (!orgId) {
          res.status(400).json({ message: 'org_id is required to query Slack data' });
          return;
        }
        const answer = await ragAnswer({
          orgId,
          question,
          sources: ['slack'],
          limit: 6
        });
        res.json({
          message: answer.answer,
          citations: answer.citations
        });
        break;
      }
      case '/jira': {
        const question = input.replace(/^\/jira\s*/i, '').trim();
        if (!question) {
          res.status(400).json({ message: 'Question is required, e.g. /jira show my open tickets' });
          return;
        }
        const orgId = resolveOrgId(req);
        const accountId = resolveAccountId(req);
        if (!orgId) {
          res.status(400).json({ message: 'org_id is required to query Jira data' });
          return;
        }
        if (!accountId) {
          res.status(400).json({ message: 'forge_user_id is required to query Jira data' });
          return;
        }
        const collectedIssues: any[] = [];
        // Try to refresh context from Jira before answering
        try {
          const client = await JiraClient.fromUser(orgId, accountId);
          const lower = question.toLowerCase();

          // Projects: always ingest latest list to support breakdown questions
          try {
            const projects = await client.getProjects();
            for (const project of projects.values ?? []) {
              await ingestJiraProject(project, orgId, accountId);
            }
          } catch (err) {
            console.warn('[commands] jira project sync failed', err);
          }

          // Assigned issues: keep context fresh
          try {
            const issues = await client.getAssignedIssues();
            for (const issue of issues.issues ?? []) {
              await ingestJiraIssue(issue, orgId, accountId);
              collectedIssues.push(issue);
            }
          } catch (err) {
            console.warn('[commands] jira assigned issues sync failed', err);
          }

          // Query-relevant search to enrich embeddings for tickets
          try {
            const searchResults = await client.searchIssues({
              query: question,
              status: lower.includes('open') ? 'Open' : undefined
            });
            for (const issue of searchResults.issues ?? []) {
              await ingestJiraIssue(issue, orgId, accountId);
              collectedIssues.push(issue);
            }
          } catch (err) {
            console.warn('[commands] jira search sync failed', err);
          }

          // Broad open tickets fetch to cover breakdowns
          try {
            const openIssues = await client.searchIssues({
              jql: 'statusCategory != Done ORDER BY updated DESC'
            });
            for (const issue of openIssues.issues ?? []) {
              await ingestJiraIssue(issue, orgId, accountId);
              collectedIssues.push(issue);
            }
          } catch (err) {
            console.warn('[commands] jira open issues sync failed', err);
          }

          // If specific keys are mentioned, fetch full details
          const keyMatches = question.match(/[A-Z][A-Z0-9]+-\d+/g);
          if (keyMatches && keyMatches.length) {
            for (const key of keyMatches) {
              try {
                const detailed = await client.getIssue(key);
                await ingestJiraIssue(detailed, orgId, accountId);
                collectedIssues.push(detailed);
              } catch (err) {
                console.warn(`[commands] jira fetch issue ${key} failed`, err);
              }
            }
          }
        } catch (err) {
          console.warn('[commands] jira context refresh failed', err);
        }
        // Try to answer from Jira embeddings first
        const answer = await ragAnswer({
          orgId,
          question,
          // Allow both Jira tickets and general KB to be retrieved for troubleshooting.
          sources: undefined,
          limit: 8
        });
        if ((!answer.citations || answer.citations.length === 0) && collectedIssues.length > 0) {
          const byStatus = new Map<string, any[]>();
          collectedIssues.forEach((issue) => {
            const status = issue?.fields?.status?.name ?? 'Unknown';
            if (!byStatus.has(status)) byStatus.set(status, []);
            byStatus.get(status)!.push(issue);
          });
          const summaryLines: string[] = [];
          summaryLines.push(`Found ${collectedIssues.length} issues recently pulled from Jira:`);
          for (const [status, issues] of byStatus.entries()) {
            summaryLines.push(`- ${status}: ${issues.length}`);
          }
          const topFive = collectedIssues.slice(0, 5).map((issue) => {
            const key = issue.key ?? issue.id;
            const summary = issue.fields?.summary ?? '';
            const status = issue.fields?.status?.name ?? 'Unknown';
            return `• ${key}: ${summary} (${status})`;
          });
          summaryLines.push('', 'Sample:', ...topFive);
          res.json({
            message: summaryLines.join('\n'),
            citations: []
          });
        } else {
          res.json({
            message: answer.answer,
            citations: answer.citations
          });
        }
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
