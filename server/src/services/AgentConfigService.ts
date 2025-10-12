import OpenAI from 'openai';
import { pool } from '../db.js';
import { config } from '../config.js';

export type AgentConfigFieldType = 'string' | 'number' | 'boolean' | 'password' | 'textarea' | 'select';

export interface AgentConfigField {
  key: string;
  label: string;
  type: AgentConfigFieldType;
  required?: boolean;
  secure?: boolean;
  options?: string[];
  description?: string;
  placeholder?: string;
  tooltip?: string;
  defaultValue?: unknown;
}

export interface AgentConfigTemplate {
  agentType: string;
  description: string;
  configSchema: AgentConfigField[];
  defaults?: Record<string, unknown>;
}

export interface AgentConfigRecord extends AgentConfigTemplate {
  agentId: string;
  values: Record<string, unknown>;
}

const openai = config.openAiApiKey ? new OpenAI({ apiKey: config.openAiApiKey }) : null;

const TOOL_KNOWLEDGE_BASE: Array<{
  keywords: RegExp[];
  agentType: string;
  description: string;
  schema: AgentConfigField[];
}> = [
  {
    agentType: 'SlackBotAgent',
    description: 'Conversational Slack bot that can post, listen, and coordinate across channels.',
    keywords: [/slack/i, /workspace/i, /channel/i],
    schema: [
      { key: 'slackToken', label: 'Slack Bot Token', type: 'password', required: true, secure: true, tooltip: 'xoxb- token with chat:write scope.' },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', required: true, secure: true },
      { key: 'defaultChannel', label: 'Default Channel', type: 'string', required: false, placeholder: '#general' },
    ],
  },
  {
    agentType: 'GmailAgent',
    description: 'Email triage agent that can read, summarise, and draft Gmail responses.',
    keywords: [/gmail/i, /email/i, /inbox/i, /mail/i],
    schema: [
      { key: 'clientId', label: 'Google Client ID', type: 'string', required: true },
      { key: 'clientSecret', label: 'Google Client Secret', type: 'password', required: true, secure: true },
      { key: 'refreshToken', label: 'OAuth Refresh Token', type: 'password', required: true, secure: true },
      { key: 'label', label: 'Label to Monitor', type: 'string', required: false, placeholder: 'INBOX' },
    ],
  },
  {
    agentType: 'NotionAgent',
    description: 'Knowledge curator that syncs notes and tasks with Notion databases.',
    keywords: [/notion/i, /database/i, /docs/i, /knowledge/i],
    schema: [
      { key: 'notionToken', label: 'Notion Integration Token', type: 'password', required: true, secure: true },
      { key: 'databaseId', label: 'Database ID', type: 'string', required: true },
      { key: 'workspaceName', label: 'Workspace Name', type: 'string', required: false },
    ],
  },
];

function sanitizeField(field: AgentConfigField): AgentConfigField {
  const rawType = typeof field.type === 'string' ? field.type.toLowerCase() : 'string';
  let normalisedType: AgentConfigFieldType;
  switch (rawType) {
    case 'text':
    case 'string':
      normalisedType = 'string';
      break;
    case 'secret':
    case 'password':
      normalisedType = 'password';
      break;
    case 'textarea':
    case 'long_text':
      normalisedType = 'textarea';
      break;
    case 'boolean':
    case 'checkbox':
      normalisedType = 'boolean';
      break;
    case 'number':
    case 'integer':
      normalisedType = 'number';
      break;
    case 'select':
    case 'dropdown':
      normalisedType = 'select';
      break;
    default:
      normalisedType = 'string';
  }
  const sanitized: AgentConfigField = {
    key: field.key.trim(),
    label: field.label.trim() || field.key,
    type: normalisedType ?? 'string',
    required: field.required ?? false,
    secure: field.secure ?? normalisedType === 'password',
  };
  if (field.options && Array.isArray(field.options)) {
    sanitized.options = field.options.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }
  if (field.description) sanitized.description = field.description;
  if (field.placeholder) sanitized.placeholder = field.placeholder;
  if (field.tooltip) sanitized.tooltip = field.tooltip;
  if (field.defaultValue !== undefined) sanitized.defaultValue = field.defaultValue;
  return sanitized;
}

function fallbackTemplate(description: string): AgentConfigTemplate {
  const matched = TOOL_KNOWLEDGE_BASE.find((entry) => entry.keywords.some((regex) => regex.test(description)));
  if (matched) {
    return {
      agentType: matched.agentType,
      description: matched.description,
      configSchema: matched.schema,
    };
  }
  return {
    agentType: 'GeneralPurposeAgent',
    description: 'Configurable agent without external tool integrations.',
    configSchema: [
      { key: 'primaryObjective', label: 'Primary Objective', type: 'textarea', required: false },
      { key: 'allowInternet', label: 'Enable Internet Access', type: 'boolean', required: false },
    ],
  };
}

class AgentConfigService {
  async generateSchema(description: string, context: { existingAgents?: string[]; preferredTools?: string[] } = {}): Promise<AgentConfigTemplate> {
    if (!description || description.trim().length === 0) {
      throw new Error('Description is required to generate a config schema.');
    }

    if (!openai) {
      return fallbackTemplate(description);
    }

    const systemPrompt = [
      'You design configuration schemas for autonomous agents.',
      'Return JSON with keys: agentType, description, configSchema (array of fields), defaults (optional).',
      'Field object format: { key, label, type (string|number|boolean|password|textarea|select), required?, secure?, options?, description?, placeholder?, tooltip?, defaultValue? }',
      'Choose secure=true for secrets. Keep between 1 and 6 fields. Avoid asking for redundant information.',
    ].join(' ');

    const userPrompt = JSON.stringify({
      description: description.trim(),
      existingAgents: context.existingAgents ?? [],
      preferredTools: context.preferredTools ?? [],
    });

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? '';
      const parsed = this.parseCompletion(raw) ?? fallbackTemplate(description);
      const fields = parsed.configSchema?.map(sanitizeField).filter((field) => field.key) ?? [];
      if (!fields.length) {
        return fallbackTemplate(description);
      }
      return {
        agentType: parsed.agentType || fallbackTemplate(description).agentType,
        description: parsed.description || description,
        configSchema: fields,
        defaults: parsed.defaults ?? {},
      };
    } catch (error) {
      console.error('[agent-config] schema generation failed', error);
      return fallbackTemplate(description);
    }
  }

  async upsertAgentConfig(agentId: string, payload: { agentType: string; summary?: string; schema: AgentConfigField[]; values: Record<string, unknown> }): Promise<AgentConfigRecord> {
    if (!agentId) throw new Error('agentId is required');
    const sanitizedFields = payload.schema.map(sanitizeField);
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO agent_configs (agent_id, agent_type, summary, schema, config)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
         ON CONFLICT (agent_id)
         DO UPDATE SET agent_type = EXCLUDED.agent_type,
                       summary = EXCLUDED.summary,
                       schema = EXCLUDED.schema,
                       config = EXCLUDED.config,
                       updated_at = NOW()
         RETURNING agent_id, agent_type, summary, schema, config` ,
        [agentId, payload.agentType, payload.summary ?? null, JSON.stringify(sanitizedFields), JSON.stringify(payload.values ?? {})],
      );
      const row = rows[0];
      return {
        agentId: row.agent_id,
        agentType: row.agent_type,
        description: payload.summary ?? '',
        configSchema: sanitizedFields,
        defaults: undefined,
        values: row.config ?? {},
      };
    } finally {
      client.release();
    }
  }

  async getAgentConfig(agentId: string): Promise<AgentConfigRecord | null> {
    const { rows } = await pool.query(
      `SELECT agent_id, agent_type, summary, schema, config
         FROM agent_configs
        WHERE agent_id = $1`,
      [agentId],
    );
    const row = rows[0];
    if (!row) return null;
    const schema = Array.isArray(row.schema) ? (row.schema as AgentConfigField[]).map(sanitizeField) : [];
    return {
      agentId: row.agent_id,
      agentType: row.agent_type,
      description: row.summary ?? '',
      configSchema: schema,
      defaults: undefined,
      values: row.config ?? {},
    };
  }

  async deleteAgentConfig(agentId: string): Promise<void> {
    await pool.query('DELETE FROM agent_configs WHERE agent_id = $1', [agentId]);
  }

  private parseCompletion(raw: string): AgentConfigTemplate | null {
    if (!raw) return null;
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as AgentConfigTemplate;
      return parsed;
    } catch (error) {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as AgentConfigTemplate;
        } catch (innerError) {
          console.debug('[agent-config] failed to parse completion snippet', innerError);
        }
      }
      console.debug('[agent-config] unable to parse completion', error);
      return null;
    }
  }
}

export const agentConfigService = new AgentConfigService();
