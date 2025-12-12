import { pool } from '../db.js';
import { config } from '../config.js';
import { MailQueueService } from '../services/MailQueueService.js';
class MetaControllerClass {
    constructor() {
        this.initialized = false;
        this.metaAgentId = null;
    }
    async ensureInitialized() {
        if (this.initialized) {
            return;
        }
        const { rows } = await pool.query(`SELECT id FROM agents WHERE role = $1 OR name = $2 LIMIT 1`, [config.metaControllerAgentRole, config.metaControllerAgentName]);
        if (rows.length > 0) {
            this.metaAgentId = rows[0].id;
            this.initialized = true;
            return;
        }
        const insert = await pool.query(`INSERT INTO agents(name, role, status, objectives, tools, internet_access_enabled, settings)
       VALUES ($1, $2, 'idle', '[]'::jsonb, '{}'::jsonb, FALSE, $3::jsonb)
       RETURNING id`, [config.metaControllerAgentName, config.metaControllerAgentRole, JSON.stringify({ privileged: true })]);
        this.metaAgentId = insert.rows[0].id;
        this.initialized = true;
    }
    async getMetaAgentId() {
        await this.ensureInitialized();
        return this.metaAgentId;
    }
    async recordEvent(eventType, payload, relatedAgent, relatedTask) {
        await this.ensureInitialized();
        await pool.query(`INSERT INTO controller_events(event_type, payload, related_agent, related_task)
       VALUES ($1, $2::jsonb, $3, $4)`, [eventType, JSON.stringify(payload), relatedAgent ?? null, relatedTask ?? null]);
    }
    async onTaskScheduled(task) {
        await this.recordEvent('task_scheduled', { taskId: task.id, prompt: task.prompt }, task.agent_id, task.id);
    }
    async onTaskStarted(task, agent) {
        await this.recordEvent('task_started', { taskId: task.id, agentName: agent?.name ?? null }, task.agent_id, task.id);
    }
    async onTaskCompleted(task, result) {
        await this.recordEvent('task_completed', { taskId: task.id, result }, task.agent_id, task.id);
    }
    async onTaskFailed(task, error) {
        await this.recordEvent('task_failed', { taskId: task.id, error }, task.agent_id, task.id);
    }
    async recordCollaboration(sourceAgent, targetAgent, taskId, description) {
        await this.ensureInitialized();
        await pool.query(`INSERT INTO conversation_edges(source_agent, target_agent, task_id, description)
       VALUES ($1, $2, $3, $4)`, [sourceAgent, targetAgent, taskId, description]);
    }
    async listConversationEdges(limit = 100) {
        await this.ensureInitialized();
        const { rows } = await pool.query(`SELECT * FROM conversation_edges ORDER BY created_at DESC LIMIT $1`, [limit]);
        return rows;
    }
    async requestApproval(agentId, action, payload) {
        await this.ensureInitialized();
        const { rows } = await pool.query(`INSERT INTO controller_approvals(agent_id, action, payload)
       VALUES ($1, $2, $3::jsonb)
       RETURNING *`, [agentId, action, JSON.stringify(payload)]);
        const approval = rows[0];
        await this.recordEvent('approval_requested', { approvalId: approval.id, action, payload }, agentId);
        if (config.metaControllerAutoApprove) {
            return this.resolveApproval(approval.id, 'approved', 'Auto-approved by configuration');
        }
        return approval;
    }
    async resolveApproval(id, status, notes) {
        await this.ensureInitialized();
        const { rows } = await pool.query(`UPDATE controller_approvals
          SET status = $2, resolution_notes = $3, resolved_at = NOW()
        WHERE id = $1
        RETURNING *`, [id, status, notes ?? null]);
        if (!rows[0]) {
            throw new Error('Approval not found');
        }
        await this.recordEvent('approval_resolved', { approvalId: rows[0].id, status, notes }, rows[0].agent_id);
        return rows[0];
    }
    async listApprovals(status) {
        await this.ensureInitialized();
        if (status) {
            const { rows } = await pool.query(`SELECT * FROM controller_approvals WHERE status = $1 ORDER BY created_at DESC LIMIT 200`, [status]);
            return rows;
        }
        const { rows } = await pool.query(`SELECT * FROM controller_approvals ORDER BY created_at DESC LIMIT 200`);
        return rows;
    }
    async listEvents(limit = 200) {
        await this.ensureInitialized();
        const { rows } = await pool.query(`SELECT * FROM controller_events ORDER BY created_at DESC LIMIT $1`, [limit]);
        return rows;
    }
    async tick() {
        await this.ensureInitialized();
        await MailQueueService.processPending();
    }
}
export const metaController = new MetaControllerClass();
