type Pricing = {
  input: number; // per 1K tokens
  output: number; // per 1K tokens
};

const OPENAI_PRICING: Record<string, Pricing> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

function resolvePricing(model: string): Pricing | null {
  const key = model.toLowerCase();
  if (OPENAI_PRICING[key]) return OPENAI_PRICING[key];
  if (key.includes('gpt-4o-mini')) return OPENAI_PRICING['gpt-4o-mini'];
  if (key.includes('gpt-4o')) return OPENAI_PRICING['gpt-4o'];
  return null;
}

export function estimateCostUsd(model: string, provider: 'openai' | 'local', inputTokens: number, outputTokens: number) {
  if (provider === 'local') return 0;
  const pricing = resolvePricing(model);
  if (!pricing) return 0;
  const cost =
    ((inputTokens / 1000) * pricing.input) +
    ((outputTokens / 1000) * pricing.output);
  return Number(cost.toFixed(6));
}
