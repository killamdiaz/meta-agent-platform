import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { config } from '../config.js';

const router = express.Router();
const client = new OpenAI({ apiKey: config.openAiApiKey });

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

router.get('/history/:conversationId', (_req, res) => {
  res.json({ items: [] });
});

router.post('/send', async (req, res) => {
  const { message, conversationId } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const convId = conversationId || uuidv4();
  const messageId = uuidv4();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        { role: 'system', content: atlasSystemPrompt },
        { role: 'user', content: message },
      ],
    });

    let assembled = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        assembled += delta;
        res.write(`event: token\ndata: ${delta}\n\n`);
      }
    }

    res.write(`event: done\ndata: {"messageId":"${messageId}","conversationId":"${convId}"}\n\n`);
    res.end();
  } catch (err) {
    console.error('chat/send error', err);
    res.write(`event: token\ndata: Sorry, I hit an error.\n\n`);
    res.write(`event: done\ndata: {"error":"chat_failed","messageId":"${messageId}","conversationId":"${convId}"}\n\n`);
    res.end();
  }
});

export default router;
