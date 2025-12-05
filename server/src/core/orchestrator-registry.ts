import type { CoreOrchestrator } from './orchestrator.js';

let orchestratorInstance: CoreOrchestrator | null = null;

export function setCoreOrchestrator(orchestrator: CoreOrchestrator): void {
  orchestratorInstance = orchestrator;
}

export function getCoreOrchestrator(): CoreOrchestrator {
  if (!orchestratorInstance) {
    throw new Error('Core orchestrator has not been initialised.');
  }
  return orchestratorInstance;
}
