import { chatCompletion } from '../services/ModelRouterWrapper.js';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

interface GPTRequestOptions {
  prompt: string;
  context?: string;
  intent?: string;
  stream?: boolean;
}

function buildMessages({ prompt, context }: { prompt: string; context?: string }) {
  const messages: Array<{ role: 'user' | 'system'; content: string }> = [];
  if (context) {
    messages.push({ role: 'system', content: context });
  }
  messages.push({ role: 'user', content: prompt });
  return messages;
}

export async function generateGPT(options: GPTRequestOptions): Promise<string> {
  const messages = buildMessages(options);

  const response = await chatCompletion({
    model: DEFAULT_MODEL,
    messages,
    temperature: 0.4,
    source: options.intent ?? 'gpt-reasoner',
    agent_name: 'GPTReasoner',
  });
  return response.content?.trim() ?? '';
}

export function gptAvailable(): boolean {
  return true;
}
