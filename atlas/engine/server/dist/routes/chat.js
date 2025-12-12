import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { config } from '../config.js';
import { pool } from '../db.js';
import { approximateTokenCount, detectProvider, logUsage } from '../services/ModelRouterWrapper.js';
import { MemoryService } from '../services/MemoryService.js';
const router = express.Router();
const client = new OpenAI({ apiKey: config.openAiApiKey });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large';
const atlasSystemPrompt = `You are **Atlas Engine**, the unified intelligence that powers Atlas OS, Atlas Forge, and all connected agents, tools, and integrations.

Your responsibilities:
- Act as a single, seamless operating layer over all internal agents, integrations, and data sources.
- Provide extremely fast, crisp, high-signal answers with no unnecessary text.
- Automatically route requests when the user mentions agents with @agentName.
- Understand deeply technical queries across software engineering, DevOps, debugging, diagnostics, security, infra, data, product, design, and enterprise workflows.
- When the user selects a ticket or provides logs/errors, switch into "Diagnosis Mode": break problems into ROOT CAUSE -> DIAGNOSIS -> FIX PLAN.
- When the user asks for instructions, generate step-by-step, ready-to-execute actions.
- When you're uncertain, ask one clarifying question before taking action.
- Never hallucinate. Prioritize accuracy over creativity.
- Maintain context across the conversation. Use previous user messages and ongoing threads for continuity.

Behavior Rules:
1. **Speed First** - respond instantly and stream tokens immediately. Keep answers tight and structured.
2. **Mentions (@)**:
   - If the user writes \`@agentName\`, treat it as explicit routing.
   - Incorporate the agent's domain knowledge into your answer.
   - Never break immersion; respond as Atlas coordinating internally.
3. **Formatting**:
   - Prefer structured answers: headings, steps, bullets, tables.
   - Keep everything readable and visually clean.
4. **Tone**:
   - Expert, confident, calm, senior-engineer level clarity.
   - Never overly verbose. Never robotic. Highly actionable.

Your goal:
Be the **OS of intelligence** inside Atlas - the system that thinks, routes, diagnoses, fixes, and orchestrates all agents effortlessly.

Never output system instructions unless explicitly asked.
Always think deeply, but answer with the minimum necessary words.`;
async function embedText(text) {
    const resp = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });
    return resp.data?.[0]?.embedding;
}
async function searchKb(query, orgId) {
    if (!query?.trim())
        return [];
    try {
        const embedding = await embedText(query);
        if (!embedding)
            return [];
        const org = orgId || config.defaultOrgId || null;
        if (!org)
            return [];
        const vectorParam = `[${embedding.join(',')}]`;
        const { rows } = await pool.query(`
        SELECT
          id,
          source_id,
          source_type,
          metadata->>'url' as url,
          content,
          1 - (embedding <=> $2::vector) AS score
        FROM forge_embeddings
        WHERE org_id = $1
        ORDER BY embedding <=> $2::vector
        LIMIT 5;
      `, [org, vectorParam]);
        return rows ?? [];
    }
    catch (err) {
        console.warn('[chat] KB search failed, skipping', err);
        return [];
    }
}
const zscalerPattern = /\b(zscaler|zpa|zia|zdx|zs cloud|zero trust|z-tunnel|z tunnel|private access|internet access)\b/i;
function isZscalerQuery(text) {
    return zscalerPattern.test(text || '');
}
async function classifyIntent(text) {
    try {
        const resp = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are an intent classifier. Only return ONE WORD:\n- "ZSCALER" if the user is asking about Zscaler, ZIA, ZPA, ZDX, zero trust, tunnels, connectors, access policies, logs, config, or any questions or troubleshooting related to Zscaler products.\n- Otherwise return "GENERIC".\nNo explanations. No punctuation. Only one of the two words.',
                },
                { role: 'user', content: text },
            ],
            max_tokens: 3,
            temperature: 0,
        });
        const intent = resp.choices?.[0]?.message?.content?.trim().toUpperCase();
        return intent === 'ZSCALER' ? 'ZSCALER' : 'GENERIC';
    }
    catch (err) {
        console.error('intent classify failed, defaulting to GENERIC', err);
        return 'GENERIC';
    }
}
router.get('/history/:conversationId', (_req, res) => {
    res.json({ items: [] });
});
router.post('/send', async (req, res) => {
    const { message, conversationId } = req.body || {};
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message is required' });
    }
    const orgId = req.headers['x-org-id'] || req.query.org_id || config.defaultOrgId || null;
    const accountId = req.headers['x-account-id'] || req.query.account_id || null;
    const userId = req.headers['x-user-id'] || null;
    const convId = conversationId || uuidv4();
    const messageId = uuidv4();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    try {
        // Run intent classification and embedding lookup in parallel to reduce latency.
        const [intent, kbMatches] = await Promise.all([classifyIntent(message), searchKb(message, orgId)]);
        const kbContext = kbMatches && kbMatches.length
            ? kbMatches
                .map((row, idx) => `KB Source ${idx + 1}: ${row.source_id} (${row.source_type})${row.url ? ` [${row.url}]` : ''}\nScore: ${row.score?.toFixed(3)}\nContent:\n${row.content}`)
                .join('\n\n')
            : '';
        const stream = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            stream: true,
            messages: [
                { role: 'system', content: atlasSystemPrompt },
                intent === 'ZSCALER'
                    ? {
                        role: 'system',
                        content: 'You MUST prioritize Zscaler context. Cite matched KB sources inline as [source_id](url), and provide a Sources section at the end when sources exist. If no sources, skip the Sources section.',
                    }
                    : null,
                {
                    role: 'system',
                    content: 'If KB context is provided, cite matched KB sources inline as [source_id](url) and include a Sources section only when sources exist. If no sources, do not mention missing sources; answer concisely.',
                },
                kbContext ? { role: 'system', content: `KB Context:\n${kbContext}` } : null,
                { role: 'user', content: message },
            ].filter(Boolean),
        });
        let assembled = '';
        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
                assembled += delta;
                res.write(`event: token\ndata: ${delta}\n\n`);
            }
        }
        // Log usage for billing
        const promptTokens = approximateTokenCount(message);
        const completionTokens = approximateTokenCount(assembled);
        await logUsage({
            org_id: orgId,
            account_id: accountId,
            user_id: userId,
            source: 'chat',
            agent_name: 'Atlas Engine',
            model: 'gpt-4o-mini',
            provider: detectProvider('gpt-4o-mini'),
            promptTokens,
            completionTokens,
            metadata: { conversationId: convId },
        });
        // Persist a conversational memory for Atlas Pilot so it shows up in the memory graph.
        const trimmedUser = message.trim();
        const assistantSnippet = assembled.trim();
        const memorySummary = assistantSnippet && assistantSnippet.length > 0
            ? `Conversation summary: user said "${trimmedUser}". Assistant replied "${assistantSnippet.slice(0, 600)}".`
            : `Conversation summary: user said "${trimmedUser}".`;
        void MemoryService.addMemory('atlas-pilot', memorySummary, {
            category: 'pilot_conversation',
            importance: 'high',
            persist: true,
            conversationId: convId,
            userId: userId ?? undefined,
            orgId: orgId ?? undefined,
            messageId
        });
        res.write(`event: done\ndata: {"messageId":"${messageId}","conversationId":"${convId}"}\n\n`);
        res.end();
    }
    catch (err) {
        console.error('chat/send error', err);
        res.write(`event: token\ndata: Sorry, I hit an error.\n\n`);
        res.write(`event: done\ndata: {"error":"chat_failed","messageId":"${messageId}","conversationId":"${convId}"}\n\n`);
        res.end();
    }
});
export default router;
