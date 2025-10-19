import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 45000);

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

interface GPTRequestOptions {
  prompt: string;
  context?: string;
  intent?: string;
  stream?: boolean;
}

interface GPTStreamOptions extends GPTRequestOptions {
  onToken?: (token: string) => void;
}

function buildMessages({ prompt, context }: { prompt: string; context?: string }) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (context) {
    messages.push({ role: 'system', content: context });
  }
  messages.push({ role: 'user', content: prompt });
  return messages;
}

export async function generateGPT(options: GPTRequestOptions): Promise<string> {
  if (!client) {
    throw new Error('OPENAI_API_KEY missing; cannot use GPT model.');
  }
  const messages = buildMessages(options);

  if (!options.stream) {
    const response = await client.chat.completions.create(
      {
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.4,
      },
      { timeout: OPENAI_TIMEOUT_MS },
    );
    return response.choices?.[0]?.message?.content?.trim() ?? '';
  }

  return streamGPT({ ...options });
}

export async function streamGPT(options: GPTStreamOptions): Promise<string> {
  if (!client) {
    throw new Error('OPENAI_API_KEY missing; cannot use GPT model.');
  }
  const messages = buildMessages(options);
  let final = '';

  const stream = await client.chat.completions.create(
    {
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.4,
      stream: true,
    },
    { timeout: OPENAI_TIMEOUT_MS },
  );

  for await (const part of stream) {
    const token = part.choices?.[0]?.delta?.content ?? '';
    if (token) {
      final += token;
      if (typeof options.onToken === 'function') {
        options.onToken(token);
      }
    }
  }

  return final;
}

export function gptAvailable(): boolean {
  return Boolean(client);
}
