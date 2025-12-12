// Pricing expressed per 1K tokens. Updated to reflect $70 per million tokens (~$0.07 per 1K)
// as a flat rate across supported models.
const OPENAI_PRICING = {
    'gpt-4o': { input: 0.07, output: 0.07 },
    'gpt-4o-mini': { input: 0.07, output: 0.07 },
};
function resolvePricing(model) {
    const key = model.toLowerCase();
    if (OPENAI_PRICING[key])
        return OPENAI_PRICING[key];
    if (key.includes('gpt-4o-mini'))
        return OPENAI_PRICING['gpt-4o-mini'];
    if (key.includes('gpt-4o'))
        return OPENAI_PRICING['gpt-4o'];
    return null;
}
export function estimateCostUsd(model, provider, inputTokens, outputTokens) {
    if (provider === 'local')
        return 0;
    const pricing = resolvePricing(model);
    if (!pricing)
        return 0;
    const cost = ((inputTokens / 1000) * pricing.input) +
        ((outputTokens / 1000) * pricing.output);
    return Number(cost.toFixed(6));
}
