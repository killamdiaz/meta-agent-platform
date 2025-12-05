import { routeMessage } from './llm/router.js';

export async function metaCortex(prompt: string, context = '', intent = 'meta_cortex'): Promise<string> {
  return routeMessage({ prompt, context, intent });
}
