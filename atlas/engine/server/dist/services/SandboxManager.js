import { randomUUID } from 'crypto';
import { agentManager } from '../core/AgentManager.js';
import { AgentRunner } from './AgentRunner.js';
import { NetworkProxy } from './NetworkProxy.js';
export class SandboxManager {
    constructor(agentRunner = new AgentRunner(), networkProxy = new NetworkProxy()) {
        this.agentRunner = agentRunner;
        this.networkProxy = networkProxy;
    }
    async saveAgent(agentSpec) {
        const record = await agentManager.createAgent({
            name: agentSpec.name,
            role: agentSpec.description,
            tools: agentSpec.capabilities.tools.reduce((acc, tool) => {
                acc[tool] = true;
                return acc;
            }, {}),
            objectives: agentSpec.goals,
            memory_context: agentSpec.capabilities.memory ? 'Long-term memory enabled' : '',
            internet_access_enabled: agentSpec.securityProfile.network.allowInternet
        });
        return record;
    }
    async spawnAgent(agentSpec) {
        const sandboxId = randomUUID();
        const logs = [];
        const networkLog = this.networkProxy.configure(agentSpec.securityProfile.network);
        logs.push(networkLog);
        const runnerLog = this.agentRunner.launch(agentSpec);
        logs.push(runnerLog);
        logs.push({
            timestamp: new Date().toISOString(),
            message: `Sandbox ${sandboxId} initialized with filesystem policy read: ${agentSpec.securityProfile.filesystem.read.join(', ') || 'none'}, write: ${agentSpec.securityProfile.filesystem.write.join(', ') || 'none'}.`
        });
        return { sandboxId, logs };
    }
}
