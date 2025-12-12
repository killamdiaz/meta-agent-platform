import { pool } from '../../../db.js';
import { config } from '../../../config.js';
import { fetchSlackIntegrationByTeamId } from '../api/shared.js';

export interface SlackUsageMetadata {
  team_id?: string | null;
  user_id?: string | null;
  channel_id?: string | null;
  event_type?: string | null;
  org_id?: string | null;
  account_id?: string | null;
}

export interface SlackActionUsage {
  type: string;
  details?: string;
}

export interface SlackUsagePayload {
  tokens_prompt: number;
  tokens_completion: number;
  tokens_total: number;
  images_generated: number;
  actions_triggered: SlackActionUsage[];
  slack_metadata: SlackUsageMetadata;
}

const USAGE_REGEX = /<usage>\s*([\s\S]*?)\s*<\/usage>/i;

function normalizeUsagePayload(payload: Partial<SlackUsagePayload>, fallbackMeta?: SlackUsageMetadata): SlackUsagePayload {
  const slackMeta: SlackUsageMetadata = {
    team_id: payload.slack_metadata?.team_id ?? fallbackMeta?.team_id ?? null,
    user_id: payload.slack_metadata?.user_id ?? fallbackMeta?.user_id ?? null,
    channel_id: payload.slack_metadata?.channel_id ?? fallbackMeta?.channel_id ?? null,
    event_type: payload.slack_metadata?.event_type ?? fallbackMeta?.event_type ?? null,
    org_id: payload.slack_metadata?.org_id ?? fallbackMeta?.org_id ?? payload.slack_metadata?.team_id ?? fallbackMeta?.team_id ?? null,
    account_id: payload.slack_metadata?.account_id ?? fallbackMeta?.account_id ?? null,
  };

  const prompt = Number(payload.tokens_prompt ?? payload.tokens_total ?? 0) || 0;
  const completion = Number(payload.tokens_completion ?? 0) || 0;
  const total =
    Number(payload.tokens_total ?? (Number.isFinite(prompt + completion) ? prompt + completion : 0)) || 0;

  const actions =
    Array.isArray(payload.actions_triggered) && payload.actions_triggered.length
      ? payload.actions_triggered
          .map((entry) => ({
            type: typeof entry.type === 'string' ? entry.type : 'unknown',
            details: typeof entry.details === 'string' ? entry.details : undefined,
          }))
          .filter((entry) => entry.type)
      : [];

  return {
    tokens_prompt: prompt,
    tokens_completion: completion,
    tokens_total: total,
    images_generated: Number(payload.images_generated ?? 0) || 0,
    actions_triggered: actions,
    slack_metadata: slackMeta,
  };
}

export function appendUsageBlock(
  message: string,
  usage: Partial<SlackUsagePayload>,
): { text: string; blocks: Array<{ type: string; text: { type: 'mrkdwn'; text: string } }> } {
  const normalized = normalizeUsagePayload(usage);
  const usageBlock = `<usage>\n${JSON.stringify(normalized)}\n</usage>`;
  const visibleText = message.trimEnd();

  return {
    text: `${visibleText}\n\n${usageBlock}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: visibleText || ' ' },
      },
    ],
  };
}

export async function extractAndLogUsage(
  raw: string | null | undefined,
  fallbackMeta?: SlackUsageMetadata,
): Promise<SlackUsagePayload | null> {
  if (!raw) return null;
  const match = USAGE_REGEX.exec(raw);
  if (!match) {
    console.warn('[slack-usage] No usage block found; skipping billing log.');
    return null;
  }
  try {
    const parsed = JSON.parse(match[1]) as Partial<SlackUsagePayload>;
    const normalized = normalizeUsagePayload(parsed, fallbackMeta);

    let orgId =
      normalized.slack_metadata.org_id ??
      normalized.slack_metadata.team_id ??
      config.defaultOrgId ??
      null;
    let accountId =
      normalized.slack_metadata.account_id ??
      fallbackMeta?.account_id ??
      config.defaultAccountId ??
      null;

    if (!orgId && normalized.slack_metadata.team_id) {
      const integration = await fetchSlackIntegrationByTeamId(normalized.slack_metadata.team_id);
      if (integration) {
        orgId = integration.org_id;
        accountId = accountId ?? integration.account_id ?? null;
      }
    }

    await pool.query(
      `INSERT INTO billing_usage
       (id, source, team_id, user_id, channel_id, event_type, tokens_prompt, tokens_completion, tokens_total, images_generated, actions_triggered, created_at)
       VALUES (uuid_generate_v4(), 'slack', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        normalized.slack_metadata.team_id ?? null,
        normalized.slack_metadata.user_id ?? null,
        normalized.slack_metadata.channel_id ?? null,
        normalized.slack_metadata.event_type ?? null,
        normalized.tokens_prompt,
        normalized.tokens_completion,
        normalized.tokens_total,
        normalized.images_generated,
        normalized.actions_triggered ?? [],
      ],
    );
    if (orgId) {
      await pool.query(
        `INSERT INTO forge_token_usage
          (org_id, account_id, user_id, source, agent_name, model_name, model_provider, input_tokens, output_tokens, total_tokens, cost_usd, metadata)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          orgId,
          accountId ?? null,
          normalized.slack_metadata.user_id ?? null,
          'slack',
          normalized.slack_metadata.event_type ?? 'slack',
          'slack',
          'openai',
          normalized.tokens_prompt,
          normalized.tokens_completion,
          normalized.tokens_total,
          0,
          {
            slack_metadata: normalized.slack_metadata,
            actions_triggered: normalized.actions_triggered ?? [],
          },
        ],
      );
    }
    return normalized;
  } catch (error) {
    console.warn('[slack-usage] Failed to parse usage block', error);
    return null;
  }
}
