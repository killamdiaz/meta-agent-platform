import { EventEmitter } from 'events';

export type AgentEventName =
  | 'task:queued'
  | 'task:start'
  | 'task:thought'
  | 'task:action'
  | 'task:completed'
  | 'task:error';

export interface AgentEventPayloads {
  'task:queued': { taskId: string; agentId: string; prompt: string; timestamp: string };
  'task:start': { taskId: string; agentId: string; prompt: string; timestamp: string };
  'task:thought': { taskId: string; agentId: string; thought: string; timestamp: string };
  'task:action': { taskId: string; agentId: string; action: unknown; timestamp: string };
  'task:completed': { taskId: string; agentId: string; result: unknown; timestamp: string };
  'task:error': { taskId: string; agentId: string; error: unknown; timestamp: string };
}

class AgentEventEmitter {
  private emitter = new EventEmitter();

  emit<K extends AgentEventName>(event: K, payload: AgentEventPayloads[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends AgentEventName>(event: K, listener: (payload: AgentEventPayloads[K]) => void) {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<K extends AgentEventName>(event: K, listener: (payload: AgentEventPayloads[K]) => void) {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }
}

export const agentEvents = new AgentEventEmitter();
