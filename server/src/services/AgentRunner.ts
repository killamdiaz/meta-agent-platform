import type { AgentSpec } from './NaturalLanguageAgentBuilder.js';

export interface RunnerLog {
  timestamp: string;
  message: string;
}

export class AgentRunner {
  launch(spec: AgentSpec): RunnerLog {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      message: `Agent "${spec.name}" scheduled for execution inside sandbox with timeout ${spec.securityProfile.executionTimeout}s.`
    };
  }
}
