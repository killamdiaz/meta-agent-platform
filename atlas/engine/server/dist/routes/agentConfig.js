import { Router } from 'express';
import { z } from 'zod';
import { agentConfigService } from '../services/AgentConfigService.js';
import { agentManager } from '../core/AgentManager.js';
const router = Router();
const schemaRequest = z.object({
    description: z.string().min(6, 'Provide more detail for the agent description.'),
    preferredTools: z.array(z.string()).optional(),
    existingAgents: z.array(z.string()).optional(),
});
const configFieldSchema = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'password', 'textarea', 'select']),
    required: z.boolean().optional(),
    secure: z.boolean().optional(),
    options: z.array(z.string().min(1)).optional(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    tooltip: z.string().optional(),
    defaultValue: z.unknown().optional(),
});
const upsertConfigSchema = z.object({
    agentType: z.string().min(1),
    summary: z.string().optional(),
    schema: z.array(configFieldSchema).min(1),
    values: z.record(z.unknown()).default({}),
});
router.post('/schema', async (req, res, next) => {
    try {
        const payload = schemaRequest.parse(req.body);
        const template = await agentConfigService.generateSchema(payload.description, {
            existingAgents: payload.existingAgents,
            preferredTools: payload.preferredTools,
        });
        res.json(template);
    }
    catch (error) {
        next(error);
    }
});
router.get('/:agentId', async (req, res, next) => {
    try {
        const { agentId } = z.object({ agentId: z.string().uuid('Invalid agent id.') }).parse(req.params);
        const agent = await agentManager.getAgent(agentId);
        if (!agent) {
            res.status(404).json({ message: 'Agent not found' });
            return;
        }
        const config = await agentConfigService.getAgentConfig(agentId);
        res.json(config ?? {
            agentId,
            agentType: agent.agent_type ?? agent.role,
            description: agent.config_summary ?? '',
            configSchema: Array.isArray(agent.config_schema) ? agent.config_schema : [],
            defaults: undefined,
            values: agent.config_data ?? {},
        });
    }
    catch (error) {
        next(error);
    }
});
router.put('/:agentId', async (req, res, next) => {
    try {
        const { agentId } = z.object({ agentId: z.string().uuid('Invalid agent id.') }).parse(req.params);
        const payload = upsertConfigSchema.parse(req.body);
        const agent = await agentManager.getAgent(agentId);
        if (!agent) {
            res.status(404).json({ message: 'Agent not found' });
            return;
        }
        const record = await agentConfigService.upsertAgentConfig(agentId, {
            agentType: payload.agentType,
            summary: payload.summary ?? agent.config_summary ?? agent.role,
            schema: payload.schema,
            values: payload.values,
        });
        res.json(record);
    }
    catch (error) {
        next(error);
    }
});
export default router;
