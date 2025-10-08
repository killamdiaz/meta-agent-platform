import { randomUUID } from 'crypto';
import { agentManager } from '../core/AgentManager.js';
import type { AgentSpec } from './NaturalLanguageAgentBuilder.js';
import { AgentRunner } from './AgentRunner.js';
import { NetworkProxy, type NetworkProxyLog } from './NetworkProxy.js';

export interface SandboxLaunchLog {
  timestamp: string;
  message: string;
}

export interface SpawnResult {
  sandboxId: string;
  logs: SandboxLaunchLog[];
}

export class SandboxManager {
  constructor(
    private readonly agentRunner = new AgentRunner(),
    private readonly networkProxy = new NetworkProxy()
  ) {}

  async saveAgent(agentSpec: AgentSpec) {
    const record = await agentManager.createAgent({
      name: agentSpec.name,
      role: agentSpec.description,
      tools: agentSpec.capabilities.tools.reduce<Record<string, boolean>>((acc, tool) => {
        acc[tool] = true;
        return acc;
      }, {}),
      objectives: agentSpec.goals,
      memory_context: agentSpec.capabilities.memory ? 'Long-term memory enabled' : ''
    });

    return record;
  }

  async spawnAgent(agentSpec: AgentSpec): Promise<SpawnResult> {
    const sandboxId = randomUUID();
    const logs: SandboxLaunchLog[] = [];

    const networkLog: NetworkProxyLog = this.networkProxy.configure(agentSpec.securityProfile.network);
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
