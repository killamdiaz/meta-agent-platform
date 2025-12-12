import { routeMessage } from './llm/router.js';
export async function metaCortex(prompt, context = '', intent = 'meta_cortex') {
    return routeMessage({ prompt, context, intent });
}
