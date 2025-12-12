let orchestratorInstance = null;
export function setCoreOrchestrator(orchestrator) {
    orchestratorInstance = orchestrator;
}
export function getCoreOrchestrator() {
    if (!orchestratorInstance) {
        throw new Error('Core orchestrator has not been initialised.');
    }
    return orchestratorInstance;
}
